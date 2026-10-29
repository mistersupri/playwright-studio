import { Pause, Play } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useMemo, useRef, useState, type WheelEvent } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRunControls } from "@/hooks/use-run-controls";
import { cn } from "@/lib/utils";
import { isActive, useRun } from "@/stores/run";
import { useWorkbench } from "@/stores/workbench";
import { Outputs, useArtifacts } from "./outputs";

export function BrowserPanel() {
  const projectId = useWorkbench((s) => s.project?.id);
  const artifacts = useArtifacts(projectId);
  const [tab, setTab] = useState("live");
  const count = artifacts.data?.length ?? 0;

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col gap-0 bg-panel">
      <div className="flex h-9 shrink-0 items-center border-b px-1.5">
        <TabsList variant="line" className="h-9 gap-1">
          <TabsTrigger value="live" className="px-2 text-xs">
            Browser
          </TabsTrigger>
          <TabsTrigger value="outputs" className="px-2 text-xs">
            Files
            {count > 0 && <span className="font-mono text-[11px] text-muted-foreground tabular">{count}</span>}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="live" className="min-h-0 flex-1">
        <LiveView />
      </TabsContent>
      <TabsContent value="outputs" className="min-h-0 flex-1">
        <Outputs />
      </TabsContent>
    </Tabs>
  );
}

function useCurrentUrl() {
  const logs = useRun((s) => s.logs);
  return useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      const m = logs[i].source === "system" && logs[i].message.match(/^Navigated to (.+)$/);
      if (m) return m[1];
    }
    return null;
  }, [logs]);
}

/** Keys sent as key presses; everything else that produces text arrives through the input event. */
const NAMED_KEYS = new Set([
  "Enter", "Tab", "Backspace", "Delete", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown", "Insert",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
]);

/** Map a browser keyboard event to a Playwright key string, or null when it should be typed as text. */
function toPlaywrightKey(e: KeyboardEvent<HTMLTextAreaElement>): string | null {
  const mods = [
    // The remote browser runs on Linux, so Cmd shortcuts become Ctrl shortcuts there.
    (e.ctrlKey || e.metaKey) && "Control",
    e.altKey && "Alt",
    e.shiftKey && "Shift",
  ].filter(Boolean) as string[];
  if (NAMED_KEYS.has(e.key)) return [...mods, e.key].join("+");
  const shortcut = (e.ctrlKey || e.metaKey || e.altKey) && e.key.length === 1;
  // Let paste through: it lands in the hidden field and is typed like any other text.
  if (shortcut && !((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v")) return [...mods, e.key].join("+");
  return null;
}

function LiveView() {
  const preview = useRun((s) => s.preview);
  const phase = useRun((s) => s.phase);
  const paused = useRun((s) => s.paused);
  const error = useRun((s) => s.error);
  const viewport = useWorkbench((s) => s.settings.viewport);
  const controls = useRunControls();
  const url = useCurrentUrl();
  const active = isActive(phase);
  const live = phase === "running";
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Keystrokes must reach the page in order, so every input waits for the previous one.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const wheel = useRef<{ x: number; y: number; dx: number; dy: number; timer?: number }>({ x: 0, y: 0, dx: 0, dy: 0 });

  const enqueue = (send: () => Promise<unknown>) => {
    queue.current = queue.current.then(send, send);
  };

  /** Convert a pointer position on the letterboxed image to page coordinates. */
  function toPage(clientX: number, clientY: number) {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return null;
    const rect = img.getBoundingClientRect();
    const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
    const drawnW = img.naturalWidth * scale;
    const drawnH = img.naturalHeight * scale;
    const px = clientX - rect.left - (rect.width - drawnW) / 2;
    const py = clientY - rect.top - (rect.height - drawnH) / 2;
    if (px < 0 || py < 0 || px > drawnW || py > drawnH) return null;
    return { x: px / scale, y: py / scale, localX: clientX - rect.left, localY: clientY - rect.top };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!live) return;
    // Keep focus on the hidden field so the next keystrokes go to the page.
    e.preventDefault();
    inputRef.current?.focus({ preventScroll: true });
    const pos = toPage(e.clientX, e.clientY);
    if (!pos) return;
    setRipple({ x: pos.localX, y: pos.localY, key: Date.now() });
    enqueue(() => controls.click(pos.x, pos.y));
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (!live) return;
    const pos = toPage(e.clientX, e.clientY);
    if (!pos) return;
    const w = wheel.current;
    w.x = pos.x;
    w.y = pos.y;
    w.dx += e.deltaX;
    w.dy += e.deltaY;
    // Batch a burst of wheel events into one scroll per frame-ish window.
    if (w.timer) return;
    w.timer = window.setTimeout(() => {
      const { x, y, dx, dy } = w;
      w.dx = 0;
      w.dy = 0;
      w.timer = undefined;
      enqueue(() => controls.wheel(x, y, dx, dy));
    }, 80);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && e.shiftKey) {
      // The way out: Tab and Escape belong to the page while it has focus.
      e.preventDefault();
      inputRef.current?.blur();
      return;
    }
    if (e.nativeEvent.isComposing) return;
    const key = toPlaywrightKey(e);
    if (!key) return;
    e.preventDefault();
    enqueue(() => controls.key(key));
  }

  function flushText(el: HTMLTextAreaElement) {
    const text = el.value;
    el.value = "";
    if (text) enqueue(() => controls.type(text));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs">
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full bg-muted-foreground/40", live && !paused && "signal-live bg-signal")}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground" title={url ?? undefined}>
          {url ?? "about:blank"}
        </span>
        <span className="shrink-0 font-mono text-muted-foreground tabular">
          {viewport.width}×{viewport.height}
        </span>
      </div>

      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden bg-muted/30 outline-offset-[-2px]",
          focused && live && "outline-2 outline-ring",
        )}
        onPointerDown={onPointerDown}
        onWheel={onWheel}
      >
        {preview ? (
          <>
            <img
              ref={imgRef}
              src={preview}
              alt="Live view of the browser page"
              draggable={false}
              className={cn("h-full w-full object-contain select-none", live && "cursor-pointer")}
            />
            {ripple && (
              <span
                key={ripple.key}
                aria-hidden
                className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-signal animate-out fade-out-0 zoom-out-150 fill-mode-forwards duration-300"
                style={{ left: ripple.x, top: ripple.y }}
              />
            )}
          </>
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
            {phase === "starting" || (live && !preview) ? (
              <span className="flex items-center gap-2">
                <Spinner /> Starting Chromium
              </span>
            ) : phase === "failed" ? (
              <span className="max-w-xs">
                <span className="block font-medium text-danger">The run failed before the page rendered.</span>
                {error && <span className="mt-1 block text-xs break-words">{error}</span>}
              </span>
            ) : (
              <span className="max-w-xs">
                Run a script to watch the page here. While it runs, click the page to use it like a normal browser: type, press keys, scroll.
              </span>
            )}
          </div>
        )}
        {paused && (
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-warning/15 px-3 py-1.5 text-center text-xs font-medium text-warning backdrop-blur-sm">
            Paused. The script waits before its next page action.
          </div>
        )}
        {/* Receives keyboard input, IME composition and paste; also opens the on-screen keyboard on phones. */}
        <textarea
          ref={inputRef}
          aria-label="Keyboard input for the browser page"
          disabled={!live}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          onInput={(e) => {
            if (!(e.nativeEvent as InputEvent).isComposing) flushText(e.currentTarget);
          }}
          onCompositionEnd={(e) => flushText(e.currentTarget)}
          className="pointer-events-none absolute bottom-0 left-0 size-px resize-none opacity-0"
        />
      </div>

      {active && (
        <div className="flex shrink-0 items-center gap-2 border-t p-2">
          <Button size="sm" variant="outline" onClick={paused ? controls.resume : controls.pause} disabled={!live}>
            {paused ? <Play /> : <Pause />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" aria-live="polite">
            {focused && live ? (
              <>
                Typing goes to the page. <Kbd>Shift</Kbd> <Kbd>Esc</Kbd> to leave.
              </>
            ) : (
              "Click the page to interact with it."
            )}
          </p>
        </div>
      )}
    </div>
  );
}
