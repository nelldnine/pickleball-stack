/**
 * Pure scheduling logic for the pickleball app.
 *
 * These functions know nothing about Prisma, React, or the database. They take
 * plain ids and return plain assignments, so they are easy to reason about and
 * test in isolation. The server actions in `lib/actions.ts` translate between
 * database rows and these shapes.
 *
 * All games are doubles: 4 players per court, split into two "sides" of 2.
 */

/** A single doubles game on one court: two sides of two players each. */
export type GameAssignment = {
  court: number; // 1-based court number
  side1: [string, string]; // player ids
  side2: [string, string]; // player ids
};

/** One round = the games played simultaneously across courts, plus who rests. */
export type ScheduledRound = {
  round: number; // 1-based
  games: GameAssignment[];
  resting: string[]; // player ids sitting out this round
};

/** How many courts can actually be used given the player count. */
export function courtsInUse(playerCount: number, courts: number): number {
  return Math.max(0, Math.min(courts, Math.floor(playerCount / 4)));
}

/** Total rounds that fit in the rental window. */
export function computeTotalRounds(hours: number, gameMinutes: number): number {
  if (gameMinutes <= 0) return 0;
  return Math.max(1, Math.floor((hours * 60) / gameMinutes));
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ---------------------------------------------------------------------------
// Rotation mode: random partners, everyone plays everyone, fair sit-outs.
// ---------------------------------------------------------------------------

/**
 * Precompute every round for rotation mode.
 *
 * Fairness is achieved two ways:
 *  - Who plays each round is chosen by fewest games played, then longest time
 *    since last playing (so benched time is shared evenly).
 *  - Within each court's four players, the 2v2 split is chosen to minimise
 *    repeated partnerships, so pairings vary across the session.
 */
export function generateRotationSchedule(
  playerIds: string[],
  courts: number,
  rounds: number,
): ScheduledRound[] {
  const used = courtsInUse(playerIds.length, courts);
  if (used === 0 || rounds <= 0) return [];

  const slots = used * 4;
  const gamesPlayed = new Map<string, number>();
  const lastPlayed = new Map<string, number>(); // round index, -Infinity if never
  const partnerCount = new Map<string, number>();
  for (const id of playerIds) {
    gamesPlayed.set(id, 0);
    lastPlayed.set(id, -1);
  }

  const schedule: ScheduledRound[] = [];

  for (let r = 1; r <= rounds; r++) {
    // Pick who plays: fewest games, then longest rest, then random tiebreak.
    const ordered = shuffle(playerIds).sort((a, b) => {
      const g = (gamesPlayed.get(a) ?? 0) - (gamesPlayed.get(b) ?? 0);
      if (g !== 0) return g;
      return (lastPlayed.get(a) ?? -1) - (lastPlayed.get(b) ?? -1);
    });

    const playing = ordered.slice(0, slots);
    const resting = ordered.slice(slots);

    // Break the playing set into groups of four (one per court).
    const groups: string[][] = [];
    const pool = shuffle(playing);
    for (let i = 0; i < used; i++) {
      groups.push(pool.slice(i * 4, i * 4 + 4));
    }

    const games: GameAssignment[] = groups.map((group, i) => {
      const [a, b, c, d] = group;
      // Three ways to split four players into 2v2; pick the least-repeated.
      const splits: Array<[[string, string], [string, string]]> = [
        [
          [a, b],
          [c, d],
        ],
        [
          [a, c],
          [b, d],
        ],
        [
          [a, d],
          [b, c],
        ],
      ];
      let best = splits[0];
      let bestCost = Infinity;
      for (const split of splits) {
        const [s1, s2] = split;
        const cost =
          (partnerCount.get(pairKey(s1[0], s1[1])) ?? 0) +
          (partnerCount.get(pairKey(s2[0], s2[1])) ?? 0);
        if (cost < bestCost) {
          bestCost = cost;
          best = split;
        }
      }
      const [side1, side2] = best;
      partnerCount.set(
        pairKey(side1[0], side1[1]),
        (partnerCount.get(pairKey(side1[0], side1[1])) ?? 0) + 1,
      );
      partnerCount.set(
        pairKey(side2[0], side2[1]),
        (partnerCount.get(pairKey(side2[0], side2[1])) ?? 0) + 1,
      );
      return { court: i + 1, side1, side2 };
    });

    for (const id of playing) {
      gamesPlayed.set(id, (gamesPlayed.get(id) ?? 0) + 1);
      lastPlayed.set(id, r);
    }

    schedule.push({ round: r, games, resting });
  }

  return schedule;
}

// ---------------------------------------------------------------------------
// Fixed-partners mode: teams, win-lose stacking (king of the court).
// ---------------------------------------------------------------------------

export type PairedTeam = {
  label: string;
  playerIds: [string, string];
};

/** Randomly pair players into fixed 2-person teams. Odd player out is returned. */
export function autoPairTeams(playerIds: string[]): {
  teams: PairedTeam[];
  leftover: string | null;
} {
  const shuffled = shuffle(playerIds);
  const teams: PairedTeam[] = [];
  let i = 0;
  for (; i + 1 < shuffled.length; i += 2) {
    teams.push({
      label: `Team ${teams.length + 1}`,
      playerIds: [shuffled[i], shuffled[i + 1]],
    });
  }
  const leftover = i < shuffled.length ? shuffled[i] : null;
  return { teams, leftover };
}

/** One court in the stacking ladder: the two teams currently facing off. */
export type CourtPair = { court: number; teamA: string; teamB: string };

export type StackingState = {
  courts: CourtPair[]; // active courts, court 1 = top ("king court")
  restQueue: string[]; // team ids resting, front = enters soonest
};

/** Seed teams onto the ladder. Extra teams start in the rest queue. */
export function initialStacking(
  teamIds: string[],
  courts: number,
): StackingState {
  const activeCourts = courtsInUse(teamIds.length * 2, courts); // 2 teams/court
  const state: StackingState = { courts: [], restQueue: [] };
  let idx = 0;
  for (let c = 1; c <= activeCourts; c++) {
    state.courts.push({
      court: c,
      teamA: teamIds[idx],
      teamB: teamIds[idx + 1],
    });
    idx += 2;
  }
  state.restQueue = teamIds.slice(idx);
  return state;
}

/**
 * Draw a fresh round of matchups at random, favoring least-rested teams.
 *
 * Unlike king-of-the-court stacking, this ignores who won: every team is back
 * in the pool, so a winning pair can be picked again. To keep sit-out time
 * roughly even, teams are shuffled (random tie-break) and then stably sorted by
 * games played, so the least-rested teams fill the courts first. Leftover teams
 * rest, in that same order (front of the queue = played least, enters soonest).
 */
export function randomMatchRound(
  teams: { id: string; gamesPlayed: number }[],
  courts: number,
): StackingState {
  const ordered = shuffle(teams).sort((a, b) => a.gamesPlayed - b.gamesPlayed);
  const activeCourts = courtsInUse(teams.length * 2, courts); // 2 teams/court
  const state: StackingState = { courts: [], restQueue: [] };
  let idx = 0;
  for (let c = 1; c <= activeCourts; c++) {
    state.courts.push({
      court: c,
      teamA: ordered[idx].id,
      teamB: ordered[idx + 1].id,
    });
    idx += 2;
  }
  state.restQueue = ordered.slice(idx).map((t) => t.id);
  return state;
}

export type StackingResult = { court: number; winner: "A" | "B" };

/**
 * Advance the ladder by one round given each court's winner.
 *
 * King-of-the-court movement:
 *  - Winner moves up one court; the top court's winner stays.
 *  - Loser moves down one court; the bottom court's loser goes to the rest
 *    queue and the front of the rest queue takes their place.
 *  - With no rest queue, the bottom loser simply stays put.
 */
export function advanceStacking(
  state: StackingState,
  results: StackingResult[],
): StackingState {
  const byCourt = new Map<number, StackingResult>();
  for (const r of results) byCourt.set(r.court, r);

  const sorted = [...state.courts].sort((a, b) => a.court - b.court);
  const n = sorted.length;
  const winnerOf = (p: CourtPair) =>
    byCourt.get(p.court)?.winner === "B" ? p.teamB : p.teamA;
  const loserOf = (p: CourtPair) =>
    byCourt.get(p.court)?.winner === "B" ? p.teamA : p.teamB;

  // Compute the winner and loser destined for each court number.
  const nextA: (string | undefined)[] = new Array(n).fill(undefined); // index = court-1
  const nextB: (string | undefined)[] = new Array(n).fill(undefined);
  const queue = [...state.restQueue];

  for (let i = 0; i < n; i++) {
    const pair = sorted[i];
    const winner = winnerOf(pair);
    const loser = loserOf(pair);

    // Winner: up one court (index i-1), or stay if already at the top.
    const winnerCourt = i === 0 ? 0 : i - 1;
    // Loser: down one court (index i+1), or off the bottom.
    const loserGoesToRest = i === n - 1;
    const loserCourt = loserGoesToRest ? -1 : i + 1;

    placeTeam(nextA, nextB, winnerCourt, winner);
    if (loserGoesToRest) {
      if (queue.length > 0) {
        queue.push(loser); // to the back of the rest queue
      } else {
        // No one waiting: bottom loser stays on the bottom court.
        placeTeam(nextA, nextB, i, loser);
      }
    } else {
      placeTeam(nextA, nextB, loserCourt, loser);
    }
  }

  // Fill any still-empty bottom slot from the front of the rest queue.
  for (let i = 0; i < n; i++) {
    if (nextA[i] === undefined || nextB[i] === undefined) {
      const entrant = queue.shift();
      if (entrant !== undefined) placeTeam(nextA, nextB, i, entrant);
    }
  }

  const courts: CourtPair[] = [];
  for (let i = 0; i < n; i++) {
    courts.push({ court: i + 1, teamA: nextA[i]!, teamB: nextB[i]! });
  }
  return { courts, restQueue: queue };
}

function placeTeam(
  nextA: (string | undefined)[],
  nextB: (string | undefined)[],
  courtIndex: number,
  team: string,
) {
  if (courtIndex < 0) return;
  if (nextA[courtIndex] === undefined) nextA[courtIndex] = team;
  else nextB[courtIndex] = team;
}
