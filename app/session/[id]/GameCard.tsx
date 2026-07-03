"use client";

import { useTransition } from "react";
import { recordResult } from "@/lib/actions";

type Side = { names: string[] };

export function GameCard({
  gameId,
  court,
  side1,
  side2,
  winnerSide,
}: {
  gameId: string;
  court: number;
  side1: Side;
  side2: Side;
  winnerSide: 1 | 2 | null;
}) {
  const [pending, startTransition] = useTransition();
  const done = winnerSide !== null;

  function pick(side: 1 | 2) {
    if (done || pending) return;
    startTransition(async () => {
      await recordResult(gameId, side);
    });
  }

  return (
    <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
          Court {court}
        </span>
        <span className="text-xs text-black/40 dark:text-white/40">
          {done ? "Final" : pending ? "Saving…" : "Tap the winner"}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <SidePanel
          names={side1.names}
          won={winnerSide === 1}
          lost={winnerSide === 2}
          disabled={done || pending}
          onClick={() => pick(1)}
        />
        <div className="text-center text-xs font-medium text-black/30 dark:text-white/30">
          vs
        </div>
        <SidePanel
          names={side2.names}
          won={winnerSide === 2}
          lost={winnerSide === 1}
          disabled={done || pending}
          onClick={() => pick(2)}
        />
      </div>
    </div>
  );
}

function SidePanel({
  names,
  won,
  lost,
  disabled,
  onClick,
}: {
  names: string[];
  won: boolean;
  lost: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
        won
          ? "border-emerald-500 bg-emerald-500/15"
          : lost
            ? "border-black/10 dark:border-white/10 opacity-50"
            : "border-black/10 dark:border-white/10 hover:border-emerald-500 hover:bg-emerald-500/5 active:scale-[0.99]"
      } ${disabled ? "cursor-default" : "cursor-pointer"}`}
    >
      <span className="font-medium">{names.join(" & ")}</span>
      {won && <span className="text-emerald-600 dark:text-emerald-400">✓ Won</span>}
    </button>
  );
}
