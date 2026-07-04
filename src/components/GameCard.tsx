import { useState, useTransition } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { recordResult } from "@/lib/actions";

type Side = { names: string[]; teamLabel?: string };

// Reference target for highlighting game point (pickleball: first to 11, win by 2).
const GAME_TO = 11;

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
  const router = useRouter();
  const record = useServerFn(recordResult);
  const [pending, startTransition] = useTransition();

  // Live, in-memory score for the current game (resets when the round advances).
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [serving, setServing] = useState<0 | 1>(0); // side 1 serves first
  const done = winnerSide !== null;

  // Award a rally to a side: the serving side scores a point; the receiving
  // side winning is a side-out (serve passes to them, no point).
  function awardRally(side: 0 | 1) {
    if (done || pending) return;
    if (side === serving) {
      setScores((s) => {
        const next: [number, number] = [s[0], s[1]];
        next[side] += 1;
        return next;
      });
    } else {
      setServing(side);
    }
  }

  function undo(side: 0 | 1) {
    if (done || pending) return;
    setScores((s) => {
      const next: [number, number] = [s[0], s[1]];
      next[side] = Math.max(0, next[side] - 1);
      return next;
    });
  }

  const leader = scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1;
  const gamePoint =
    leader !== null &&
    scores[leader] >= GAME_TO &&
    Math.abs(scores[0] - scores[1]) >= 2;

  function finish(side: 1 | 2) {
    if (done || pending) return;
    startTransition(async () => {
      await record({ data: { gameId, winnerSide: side } });
      await router.invalidate();
    });
  }

  const label = (s: Side) => s.teamLabel ?? s.names.join(" & ");

  return (
    <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
          Court {court}
        </span>
        <span className="text-xs text-black/40 dark:text-white/40">
          {done ? "Final" : pending ? "Saving…" : "🏓 = won the rally"}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <SidePanel
          side={side1}
          score={scores[0]}
          serving={serving === 0}
          won={winnerSide === 1}
          lost={winnerSide === 2}
          done={done}
          disabled={pending}
          onServe={() => setServing(0)}
          onAward={() => awardRally(0)}
          onUndo={() => undo(0)}
        />
        <SidePanel
          side={side2}
          score={scores[1]}
          serving={serving === 1}
          won={winnerSide === 2}
          lost={winnerSide === 1}
          done={done}
          disabled={pending}
          onServe={() => setServing(1)}
          onAward={() => awardRally(1)}
          onUndo={() => undo(1)}
        />
      </div>

      {!done && (
        <div className="mt-3 border-t border-black/5 dark:border-white/5 pt-3">
          <div className="mb-2 text-xs font-medium text-black/40 dark:text-white/40">
            {gamePoint
              ? `🏆 Game point — ${label(leader === 0 ? side1 : side2)}`
              : "Record the winning team"}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <RecordButton
              label={label(side1)}
              highlight={leader === 0}
              gamePoint={gamePoint && leader === 0}
              disabled={pending}
              onClick={() => finish(1)}
            />
            <RecordButton
              label={label(side2)}
              highlight={leader === 1}
              gamePoint={gamePoint && leader === 1}
              disabled={pending}
              onClick={() => finish(2)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SidePanel({
  side,
  score,
  serving,
  won,
  lost,
  done,
  disabled,
  onServe,
  onAward,
  onUndo,
}: {
  side: Side;
  score: number;
  serving: boolean;
  won: boolean;
  lost: boolean;
  done: boolean;
  disabled: boolean;
  onServe: () => void;
  onAward: () => void;
  onUndo: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition ${
        won
          ? "border-emerald-500 bg-emerald-500/15"
          : lost
            ? "border-black/10 dark:border-white/10 opacity-50"
            : serving
              ? "border-emerald-500/60 bg-emerald-500/5"
              : "border-black/10 dark:border-white/10"
      }`}
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          {side.teamLabel && (
            <span className="w-fit rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {side.teamLabel}
            </span>
          )}
          {!done &&
            (serving ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                🏓 Serving
              </span>
            ) : (
              <button
                type="button"
                onClick={onServe}
                disabled={disabled}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/40 hover:text-emerald-600 dark:text-white/40 dark:hover:text-emerald-400"
              >
                Set serve
              </button>
            ))}
        </span>
        <span className="min-w-0 truncate font-medium">
          {side.names.join(" & ")}
        </span>
      </span>

      {done ? (
        won && (
          <span className="shrink-0 pl-2 text-emerald-600 dark:text-emerald-400">
            ✓ Won
          </span>
        )
      ) : (
        <span className="flex shrink-0 items-center gap-2 pl-2">
          <button
            type="button"
            onClick={onUndo}
            disabled={disabled || score === 0}
            aria-label="Subtract a point"
            className="h-8 w-8 rounded-lg border border-black/10 dark:border-white/15 text-lg leading-none text-black/50 dark:text-white/50 disabled:opacity-30 active:scale-95"
          >
            −
          </button>
          <span className="w-8 text-center text-3xl font-bold tabular-nums">
            {score}
          </span>
          <button
            type="button"
            onClick={onAward}
            disabled={disabled}
            aria-label="Won the rally"
            className="h-10 w-10 rounded-lg bg-emerald-600 text-lg font-semibold text-white transition hover:bg-emerald-700 active:scale-95 disabled:opacity-60"
          >
            🏓
          </button>
        </span>
      )}
    </div>
  );
}

function RecordButton({
  label,
  highlight,
  gamePoint,
  disabled,
  onClick,
}: {
  label: string;
  highlight: boolean;
  gamePoint: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`truncate rounded-lg px-3 py-2 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-60 ${
        gamePoint
          ? "bg-emerald-600 text-white hover:bg-emerald-700"
          : highlight
            ? "border border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
            : "border border-black/15 dark:border-white/15 hover:border-emerald-500"
      }`}
    >
      {label} won
    </button>
  );
}
