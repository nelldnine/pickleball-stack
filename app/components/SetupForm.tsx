"use client";

import { useMemo, useState, useTransition } from "react";
import { createSession } from "@/lib/actions";

type Mode = "rotation" | "fixed";

function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function SetupForm() {
  const [hours, setHours] = useState(3);
  const [courts, setCourts] = useState(2);
  const [gameMinutes, setGameMinutes] = useState(15);
  const [mode, setMode] = useState<Mode>("rotation");
  const [names, setNames] = useState<string[]>(["", "", "", ""]);
  const [pairOrder, setPairOrder] = useState<number[]>([0, 1, 2, 3]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const totalRounds = useMemo(
    () => Math.max(1, Math.floor((hours * 60) / Math.max(1, gameMinutes))),
    [hours, gameMinutes],
  );
  const courtsUsed = Math.max(
    0,
    Math.min(courts, Math.floor(names.length / 4)),
  );

  function setPlayerCount(next: number) {
    const n = Math.max(4, Math.min(40, next));
    setNames((prev) => {
      const copy = [...prev];
      while (copy.length < n) copy.push("");
      copy.length = n;
      return copy;
    });
    setPairOrder(Array.from({ length: n }, (_, i) => i));
  }

  function updateName(i: number, value: string) {
    setNames((prev) => prev.map((v, idx) => (idx === i ? value : v)));
  }

  function reshuffle() {
    setPairOrder(shuffleIndices(names.length));
  }

  // Teams preview for fixed mode: consecutive index pairs from pairOrder.
  const teamsPreview = useMemo(() => {
    const teams: Array<[number, number]> = [];
    for (let i = 0; i + 1 < pairOrder.length; i += 2) {
      teams.push([pairOrder[i], pairOrder[i + 1]]);
    }
    return teams;
  }, [pairOrder]);

  const oddPlayers = names.length % 2 !== 0;

  function submit() {
    setError(null);
    const cleaned = names.map((n) => n.trim());
    if (cleaned.some((n) => n.length === 0)) {
      setError("Please fill in every player's name.");
      return;
    }
    if (mode === "fixed" && oddPlayers) {
      setError(
        "Fixed-partners mode needs an even number of players so everyone has a partner.",
      );
      return;
    }
    startTransition(async () => {
      const res = await createSession({
        hours,
        courts,
        gameMinutes,
        mode,
        players: cleaned,
        pairs: mode === "fixed" ? teamsPreview : undefined,
      });
      // On success the action redirects; only errors return here.
      if (res && "error" in res) setError(res.error);
    });
  }

  const labelCls = "block text-sm font-medium mb-1.5 text-black/70 dark:text-white/70";
  const inputCls =
    "w-full rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition";

  return (
    <div className="flex flex-col gap-6">
      {/* Match settings */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div>
          <label className={labelCls}>Hours</label>
          <input
            type="number"
            inputMode="decimal"
            min={0.5}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Courts</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={courts}
            onChange={(e) => setCourts(Number(e.target.value))}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Min/game</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={gameMinutes}
            onChange={(e) => setGameMinutes(Number(e.target.value))}
            className={inputCls}
          />
        </div>
      </div>

      <p className="-mt-2 text-sm text-black/50 dark:text-white/50">
        ≈ <span className="font-semibold text-emerald-600 dark:text-emerald-400">{totalRounds} rounds</span>
        {courtsUsed > 0 && (
          <> · {courtsUsed} court{courtsUsed > 1 ? "s" : ""} in play · {courtsUsed * 4} on court each round</>
        )}
      </p>

      {/* Mode toggle */}
      <div>
        <label className={labelCls}>Format</label>
        <div className="grid grid-cols-2 gap-2">
          <ModeButton
            active={mode === "rotation"}
            onClick={() => setMode("rotation")}
            title="Rotation"
            subtitle="Random partners, everyone plays everyone"
          />
          <ModeButton
            active={mode === "fixed"}
            onClick={() => setMode("fixed")}
            title="Fixed partners"
            subtitle="Set teams, win-lose stacking"
          />
        </div>
      </div>

      {/* Players */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-black/70 dark:text-white/70">
            Players ({names.length})
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPlayerCount(names.length - 1)}
              className="h-10 w-10 rounded-lg border border-black/15 dark:border-white/15 text-xl leading-none disabled:opacity-40 active:scale-95 transition"
              disabled={names.length <= 4}
              aria-label="Remove a player"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setPlayerCount(names.length + 1)}
              className="h-10 w-10 rounded-lg border border-black/15 dark:border-white/15 text-xl leading-none disabled:opacity-40 active:scale-95 transition"
              disabled={names.length >= 40}
              aria-label="Add a player"
            >
              +
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {names.map((name, i) => (
            <input
              key={i}
              value={name}
              onChange={(e) => updateName(i, e.target.value)}
              placeholder={`Player ${i + 1}`}
              className={inputCls}
            />
          ))}
        </div>
      </div>

      {/* Fixed-mode team preview */}
      {mode === "fixed" && (
        <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-black/70 dark:text-white/70">
              Teams
            </span>
            <button
              type="button"
              onClick={reshuffle}
              className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              ↻ Reshuffle
            </button>
          </div>
          {oddPlayers ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Add one more player — fixed partners needs an even number.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {teamsPreview.map(([a, b], i) => (
                <div
                  key={i}
                  className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm"
                >
                  <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                    Team {i + 1}
                  </span>
                  <div className="text-black/70 dark:text-white/70">
                    {names[a]?.trim() || `Player ${a + 1}`} &{" "}
                    {names[b]?.trim() || `Player ${b + 1}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-xl bg-emerald-600 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Creating match…" : "Start match"}
      </button>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition ${
        active
          ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
          : "border-black/15 dark:border-white/15 hover:border-black/30 dark:hover:border-white/30"
      }`}
    >
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-black/50 dark:text-white/50">{subtitle}</div>
    </button>
  );
}
