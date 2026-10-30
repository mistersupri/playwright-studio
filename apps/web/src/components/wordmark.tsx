import { cn } from "@/lib/utils";

/**
 * Product name set in Plex Mono with the signal dot: the same dot that pulses
 * in the top bar while a run is live. No logo was supplied, so this stays typographic.
 */
export function Wordmark({ className, live = false }: { className?: string; live?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-mono text-[15px] font-medium tracking-tight", className)}>
      <span aria-hidden className={cn("size-2 rounded-full bg-signal", live && "signal-live")} />
      scriptbench
    </span>
  );
}
