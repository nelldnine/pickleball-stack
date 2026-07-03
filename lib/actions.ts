"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  computeTotalRounds,
  generateRotationSchedule,
  autoPairTeams,
  initialStacking,
  advanceStacking,
  type CourtPair,
  type StackingState,
  type StackingResult,
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

export type CreateSessionResult = { error: string } | void;

export async function createSession(
  input: CreateSessionInput,
): Promise<CreateSessionResult> {
  const names = input.players.map((n) => n.trim()).filter((n) => n.length > 0);

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
        teamPlayerIds = autoPairTeams(playerIds).teams.map((t) => t.playerIds);
      }

      // Persist teams and link their two players.
      const teamIds: string[] = [];
      for (let i = 0; i < teamPlayerIds.length; i++) {
        const [a, b] = teamPlayerIds[i];
        const team = await tx.team.create({
          data: { sessionId: session.id, label: `Team ${i + 1}` },
        });
        await tx.player.update({
          where: { id: a },
          data: { teamId: team.id },
        });
        await tx.player.update({
          where: { id: b },
          data: { teamId: team.id },
        });
        teamIds.push(team.id);
      }

      // Seed the stacking ladder and create round 1.
      const state = initialStacking(teamIds, input.courts);
      const teamPlayers = new Map(teamIds.map((id, i) => [id, teamPlayerIds[i]]));
      await persistStackingState(tx, session.id, state, teamPlayers, 1);
    }

    return session.id;
  });

  redirect(`/session/${sessionId}`);
}

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

export async function recordResult(gameId: string, winnerSide: 1 | 2) {
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
      where: { sessionId: game.sessionId, round: game.round, status: "pending" },
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

  revalidatePath(`/session/${await sessionIdForGame(gameId)}`);
}

async function teamIdForPlayer(tx: Tx, playerId: string) {
  const p = await tx.player.findUnique({ where: { id: playerId } });
  return p?.teamId ?? null;
}

async function sessionIdForGame(gameId: string) {
  const g = await prisma.game.findUnique({ where: { id: gameId } });
  return g?.sessionId ?? "";
}

/** Build the next stacking round from the just-completed round's results. */
async function generateNextStackingRound(
  tx: Tx,
  sessionId: string,
  completedRound: number,
) {
  const teams = await tx.team.findMany({
    where: { sessionId },
    include: { players: true },
  });
  const teamPlayers = new Map<string, [string, string]>();
  const playerTeam = new Map<string, string>();
  for (const t of teams) {
    const ids = t.players.map((p) => p.id);
    if (ids.length >= 2) {
      teamPlayers.set(t.id, [ids[0], ids[1]]);
    }
    for (const p of t.players) playerTeam.set(p.id, t.id);
  }

  // Reconstruct the current ladder from the completed round's games.
  const games = await tx.game.findMany({
    where: { sessionId, round: completedRound },
    include: { players: true },
    orderBy: { court: "asc" },
  });

  const courts: CourtPair[] = [];
  const results: StackingResult[] = [];
  for (const g of games) {
    const side1Player = g.players.find((p) => p.side === 1);
    const side2Player = g.players.find((p) => p.side === 2);
    if (!side1Player || !side2Player) continue;
    const teamA = playerTeam.get(side1Player.playerId)!;
    const teamB = playerTeam.get(side2Player.playerId)!;
    courts.push({ court: g.court, teamA, teamB });
    results.push({ court: g.court, winner: g.winnerSide === 2 ? "B" : "A" });
  }

  const restingTeams = teams
    .filter((t) => t.court === null)
    .sort((a, b) => (a.restRank ?? 0) - (b.restRank ?? 0))
    .map((t) => t.id);

  const state: StackingState = { courts, restQueue: restingTeams };
  const next = advanceStacking(state, results);
  await persistStackingState(tx, sessionId, next, teamPlayers, completedRound + 1);
}
