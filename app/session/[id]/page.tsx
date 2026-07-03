import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GameCard } from "./GameCard";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    include: { players: true },
  });
  if (!session) notFound();

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
        include: { players: { include: { player: true } } },
        orderBy: { court: "asc" },
      })
    : [];

  const playingIds = new Set(
    roundGames.flatMap((g) => g.players.map((p) => p.playerId)),
  );
  const resting = session.players.filter((p) => !playingIds.has(p.id));

  const standings = [...session.players].sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses || b.gamesPlayed - a.gamesPlayed,
  );

  const completed = currentRound === null;
  const progress = Math.round(
    ((completed ? session.totalRounds : (currentRound ?? 1) - 1) /
      session.totalRounds) *
      100,
  );

  function sideNames(
    game: (typeof roundGames)[number],
    side: 1 | 2,
  ): string[] {
    return game.players
      .filter((p) => p.side === side)
      .map((p) => p.player.name);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <header className="mb-6">
        <Link
          href="/"
          className="text-sm text-black/50 dark:text-white/50 hover:underline"
        >
          ← New match
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {session.mode === "fixed" ? "Fixed partners" : "Rotation"} ·{" "}
            {session.players.length} players
          </h1>
          <Link
            href={`/session/${id}/rankings`}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            🏆 Rankings
          </Link>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-sm text-black/50 dark:text-white/50">
            <span>
              {completed
                ? "All rounds complete"
                : `Round ${currentRound} of ${session.totalRounds}`}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      {completed ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
          <p className="text-lg font-semibold">🎉 Match complete!</p>
          <p className="mt-1 text-black/60 dark:text-white/60">
            Every round has been played. See how everyone finished.
          </p>
          <Link
            href={`/session/${id}/rankings`}
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700"
          >
            View final rankings
          </Link>
        </div>
      ) : (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            On court now
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {roundGames.map((g) => (
              <GameCard
                key={g.id}
                gameId={g.id}
                court={g.court}
                side1={{ names: sideNames(g, 1) }}
                side2={{ names: sideNames(g, 2) }}
                winnerSide={g.winnerSide as 1 | 2 | null}
              />
            ))}
          </div>

          {resting.length > 0 && (
            <div className="mt-5 rounded-xl border border-black/10 dark:border-white/10 p-4">
              <h3 className="mb-2 text-sm font-semibold text-black/50 dark:text-white/50">
                Resting this round
              </h3>
              <div className="flex flex-wrap gap-2">
                {resting.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-full bg-black/5 dark:bg-white/10 px-3 py-1 text-sm"
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Live standings */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Standings
        </h2>
        <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
          {standings.map((p, i) => (
            <div
              key={p.id}
              className="flex items-center justify-between border-b border-black/5 dark:border-white/5 px-4 py-2.5 last:border-0"
            >
              <div className="flex items-center gap-3">
                <span className="w-5 text-sm text-black/40 dark:text-white/40">
                  {i + 1}
                </span>
                <span className="font-medium">
                  {i === 0 && p.wins > 0 ? "👑 " : ""}
                  {p.name}
                </span>
              </div>
              <span className="text-sm text-black/60 dark:text-white/60 tabular-nums">
                {p.wins}W · {p.losses}L
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
