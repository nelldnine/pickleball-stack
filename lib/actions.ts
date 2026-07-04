import { createServerFn } from "@tanstack/react-start";
import { redirect, notFound } from "@tanstack/react-router";
import { prisma } from "@/lib/prisma";
import {
  computeTotalRounds,
  generateRotationSchedule,
  autoPairTeams,
  randomMatchRound,
  type StackingState,
} from "@/lib/scheduling";

export type CreateSessionInput = {
  hours: number;
  courts: number;
  gameMinutes: number;
  mode: "rotation" | "fixed";
  players: string[]; // all player names, in order
  // Fixed mode only: pairs of indices into `players` forming each team.
  // If omitted, players are auto-paired server-side.
  pairs?: [number, number][];
};

/**
 * Create a session, its players/teams, and round 1. On success this throws a
 * redirect to the new session; validation problems come back as `{ error }`.
 */
export const createSession = createServerFn({ method: "POST" })
  .validator((input: CreateSessionInput) => input)
  .handler(async ({ data: input }): Promise<{ error: string }> => {
    const names = input.players
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    if (names.length < 4) {
      return { error: "You need at least 4 players for doubles." };
    }
    if (input.courts < 1) {
      return { error: "You need at least 1 court." };
    }
    if (input.hours <= 0 || input.gameMinutes <= 0) {
      return { error: "Hours and minutes per game must be greater than 0." };
    }
    if (input.mode === "fixed" && names.length % 2 !== 0) {
      return {
        error:
          "Fixed-partners mode needs an even number of players so everyone has a partner.",
      };
    }

    const totalRounds = computeTotalRounds(input.hours, input.gameMinutes);

    const sessionId = await prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          hours: input.hours,
          courts: input.courts,
          gameMinutes: input.gameMinutes,
          mode: input.mode,
          totalRounds,
        },
      });

      // Create players, keeping the created ids aligned with input order.
      const playerIds: string[] = [];
      for (const name of names) {
        const p = await tx.player.create({
          data: { sessionId: session.id, name },
        });
        playerIds.push(p.id);
      }

      if (input.mode === "rotation") {
        const schedule = generateRotationSchedule(
          playerIds,
          input.courts,
          totalRounds,
        );
        for (const round of schedule) {
          for (const g of round.games) {
            await tx.game.create({
              data: {
                sessionId: session.id,
                round: round.round,
                court: g.court,
                players: {
                  create: [
                    { playerId: g.side1[0], side: 1 },
                    { playerId: g.side1[1], side: 1 },
                    { playerId: g.side2[0], side: 2 },
                    { playerId: g.side2[1], side: 2 },
                  ],
                },
              },
            });
          }
        }
      } else {
        // Fixed mode: build teams (from submitted pairs or auto-pair).
        let teamPlayerIds: [string, string][];
        if (input.pairs && input.pairs.length > 0) {
          teamPlayerIds = input.pairs.map(
            ([i, j]) => [playerIds[i], playerIds[j]] as [string, string],
          );
        } else {
          teamPlayerIds = autoPairTeams(playerIds).teams.map(
            (t) => t.playerIds,
          );
        }

        // Persist teams and link their two players.
        const teamIds: string[] = [];
        for (let i = 0; i < teamPlayerIds.length; i++) {
          const [a, b] = teamPlayerIds[i];
          const team = await tx.team.create({
            data: { sessionId: session.id, label: `Team ${i + 1}` },
          });
          await tx.player.update({ where: { id: a }, data: { teamId: team.id } });
          await tx.player.update({ where: { id: b }, data: { teamId: team.id } });
          teamIds.push(team.id);
        }

        // Draw round 1 at random (all teams tie at 0 games → pure shuffle).
        const state = randomMatchRound(
          teamIds.map((id) => ({ id, gamesPlayed: 0 })),
          input.courts,
        );
        const teamPlayers = new Map(
          teamIds.map((id, i) => [id, teamPlayerIds[i]]),
        );
        await persistStackingState(tx, session.id, state, teamPlayers, 1);
      }

      return session.id;
    });

    throw redirect({ href: `/session/${sessionId}` });
  });

/** Record a game's winner, tally stats, and advance the round if it's complete. */
export const recordResult = createServerFn({ method: "POST" })
  .validator((data: { gameId: string; winnerSide: 1 | 2 }) => data)
  .handler(async ({ data: { gameId, winnerSide } }) => {
    await prisma.$transaction(async (tx) => {
      const game = await tx.game.findUnique({
        where: { id: gameId },
        include: { players: true, session: true },
      });
      if (!game || game.status === "completed") return;

      const winners = game.players.filter((p) => p.side === winnerSide);
      const losers = game.players.filter((p) => p.side !== winnerSide);

      await tx.game.update({
        where: { id: gameId },
        data: { status: "completed", winnerSide },
      });

      for (const gp of winners) {
        await tx.player.update({
          where: { id: gp.playerId },
          data: { wins: { increment: 1 }, gamesPlayed: { increment: 1 } },
        });
      }
      for (const gp of losers) {
        await tx.player.update({
          where: { id: gp.playerId },
          data: { losses: { increment: 1 }, gamesPlayed: { increment: 1 } },
        });
      }

      // In fixed mode also tally the team win/loss.
      if (game.session.mode === "fixed") {
        const winnerTeamId = await teamIdForPlayer(tx, winners[0].playerId);
        const loserTeamId = await teamIdForPlayer(tx, losers[0].playerId);
        if (winnerTeamId) {
          await tx.team.update({
            where: { id: winnerTeamId },
            data: { wins: { increment: 1 } },
          });
        }
        if (loserTeamId) {
          await tx.team.update({
            where: { id: loserTeamId },
            data: { losses: { increment: 1 } },
          });
        }
      }

      // Is the current round now fully played?
      const pendingThisRound = await tx.game.count({
        where: {
          sessionId: game.sessionId,
          round: game.round,
          status: "pending",
        },
      });
      if (pendingThisRound > 0) return; // wait for the rest of the round

      const isLastRound = game.round >= game.session.totalRounds;

      if (game.session.mode === "fixed" && !isLastRound) {
        await generateNextStackingRound(tx, game.sessionId, game.round);
      }

      // Session is complete when no pending games remain anywhere.
      const pendingTotal = await tx.game.count({
        where: { sessionId: game.sessionId, status: "pending" },
      });
      if (pendingTotal === 0) {
        await tx.session.update({
          where: { id: game.sessionId },
          data: { status: "completed" },
        });
      }
    });

    return { ok: true };
  });

/** Load the live match board: session, current round's games, and round number. */
export const getSessionBoard = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data: { id } }) => {
    const session = await prisma.session.findUnique({
      where: { id },
      include: { players: true },
    });
    if (!session) throw notFound();

    // The current round is the first one with games still to be played.
    const nextPending = await prisma.game.findFirst({
      where: { sessionId: id, status: "pending" },
      orderBy: [{ round: "asc" }, { court: "asc" }],
      select: { round: true },
    });
    const currentRound = nextPending?.round ?? null;

    const roundGames = currentRound
      ? await prisma.game.findMany({
          where: { sessionId: id, round: currentRound },
          include: {
            players: { include: { player: { include: { team: true } } } },
          },
          orderBy: { court: "asc" },
        })
      : [];

    return { session, roundGames, currentRound };
  });

/** Load the rankings page data: session with players and team standings. */
export const getRankings = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data: { id } }) => {
    const session = await prisma.session.findUnique({
      where: { id },
      include: { players: true, teams: { include: { players: true } } },
    });
    if (!session) throw notFound();
    return session;
  });

// Shared Prisma transaction client type.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Write a stacking round to the database: update each team's current court /
 * rest position and create the games for `round`.
 */
async function persistStackingState(
  tx: Tx,
  sessionId: string,
  state: StackingState,
  teamPlayers: Map<string, [string, string]>,
  round: number,
) {
  // Reset court/rest for all teams in this session, then apply the new state.
  for (const pair of state.courts) {
    await tx.team.update({
      where: { id: pair.teamA },
      data: { court: pair.court, restRank: null },
    });
    await tx.team.update({
      where: { id: pair.teamB },
      data: { court: pair.court, restRank: null },
    });
  }
  for (let i = 0; i < state.restQueue.length; i++) {
    await tx.team.update({
      where: { id: state.restQueue[i] },
      data: { court: null, restRank: i },
    });
  }

  for (const pair of state.courts) {
    const a = teamPlayers.get(pair.teamA)!;
    const b = teamPlayers.get(pair.teamB)!;
    await tx.game.create({
      data: {
        sessionId,
        round,
        court: pair.court,
        players: {
          create: [
            { playerId: a[0], side: 1 },
            { playerId: a[1], side: 1 },
            { playerId: b[0], side: 2 },
            { playerId: b[1], side: 2 },
          ],
        },
      },
    });
  }
}

async function teamIdForPlayer(tx: Tx, playerId: string) {
  const p = await tx.player.findUnique({ where: { id: playerId } });
  return p?.teamId ?? null;
}

/** Draw the next round's matchups at random, favoring least-rested teams. */
async function generateNextStackingRound(
  tx: Tx,
  sessionId: string,
  completedRound: number,
) {
  const [session, teams] = await Promise.all([
    tx.session.findUnique({ where: { id: sessionId } }),
    tx.team.findMany({ where: { sessionId }, include: { players: true } }),
  ]);
  if (!session) return;

  const teamPlayers = new Map<string, [string, string]>();
  for (const t of teams) {
    const ids = t.players.map((p) => p.id);
    if (ids.length >= 2) {
      teamPlayers.set(t.id, [ids[0], ids[1]]);
    }
  }

  const next = randomMatchRound(
    teams.map((t) => ({ id: t.id, gamesPlayed: t.wins + t.losses })),
    session.courts,
  );
  await persistStackingState(tx, sessionId, next, teamPlayers, completedRound + 1);
}
