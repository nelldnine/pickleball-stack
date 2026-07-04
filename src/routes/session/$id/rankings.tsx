import { Link, createFileRoute } from "@tanstack/react-router";
import { getRankings } from "@/lib/actions";

export const Route = createFileRoute("/session/$id/rankings")({
  loader: ({ params }) => getRankings({ data: { id: params.id } }),
  component: RankingsPage,
});

function winPct(wins: number, played: number): string {
  if (played === 0) return "—";
  return `${Math.round((wins / played) * 100)}%`;
}

function RankingsPage() {
  const { id } = Route.useParams();
  const session = Route.useLoaderData();

  const players = [...session.players].sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.gamesPlayed - a.gamesPlayed ||
      a.name.localeCompare(b.name),
  );
  const leader = players[0]?.wins > 0 ? players[0] : null;

  const teams =
    session.mode === "fixed"
      ? [...session.teams].sort((a, b) => b.wins - a.wins || a.losses - b.losses)
      : [];

  const medal = (i: number) =>
    i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <Link
        to="/session/$id"
        params={{ id }}
        className="text-sm text-black/50 dark:text-white/50 hover:underline"
      >
        ← Back to match
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">🏆 Rankings</h1>
        {leader ? (
          <p className="mt-1 text-black/60 dark:text-white/60">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {leader.name}
            </span>{" "}
            is leading with {leader.wins} win{leader.wins === 1 ? "" : "s"}.
          </p>
        ) : (
          <p className="mt-1 text-black/60 dark:text-white/60">
            No games recorded yet — tap winners on the match screen.
          </p>
        )}
      </header>

      {/* Player scoreboard */}
      <div className="overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
        <div className="grid grid-cols-[1.75rem_1fr_2.25rem_2.25rem_3rem] gap-2 border-b border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40 sm:px-4">
          <span>#</span>
          <span>Player</span>
          <span className="text-right">W</span>
          <span className="text-right">L</span>
          <span className="text-right">Win%</span>
        </div>
        {players.map((p, i) => (
          <div
            key={p.id}
            className={`grid grid-cols-[1.75rem_1fr_2.25rem_2.25rem_3rem] items-center gap-2 border-b border-black/5 dark:border-white/5 px-3 py-3 last:border-0 sm:px-4 ${
              i === 0 && leader ? "bg-emerald-500/10" : ""
            }`}
          >
            <span className="text-sm">{medal(i)}</span>
            <span className="min-w-0 truncate font-medium">{p.name}</span>
            <span className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
              {p.wins}
            </span>
            <span className="text-right tabular-nums text-black/50 dark:text-white/50">
              {p.losses}
            </span>
            <span className="text-right tabular-nums text-sm">
              {winPct(p.wins, p.gamesPlayed)}
            </span>
          </div>
        ))}
      </div>

      {/* Team standings (fixed mode) */}
      {teams.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Team standings
          </h2>
          <div className="overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
            {teams.map((t, i) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 border-b border-black/5 dark:border-white/5 px-4 py-3 last:border-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-5 shrink-0 text-sm">{medal(i)}</span>
                  <span className="truncate font-medium">
                    {t.players.map((p) => p.name).join(" & ")}
                  </span>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-black/60 dark:text-white/60">
                  {t.wins}W · {t.losses}L
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
