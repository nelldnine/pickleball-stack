import { SetupForm } from "@/app/components/SetupForm";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-10 sm:py-16">
      <header className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          🥒 Pickleball Stack
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Set up your match</h1>
        <p className="mt-2 text-black/60 dark:text-white/60">
          Enter your court time and players. We&apos;ll schedule fair doubles so
          everyone plays an equal amount — then track wins, losses, and the
          leaderboard.
        </p>
      </header>

      <SetupForm />
    </main>
  );
}
