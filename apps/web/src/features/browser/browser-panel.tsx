import { ChevronDown, Copy, ListPlus, Pause, Play, SquareDashedMousePointer, Trash2 } from "lucide-react";
import { type FormEvent, type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { toast } from "sonner";
import { PromptDialog } from "@/components/prompt-dialog";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRunControls } from "@/hooks/use-run-controls";
import { toPlaywrightKey } from "@/lib/keys";
import { stepsToCode, tidySteps } from "@/lib/recorder";
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

/** Where the drawn screenshot sits inside the letterboxed <img>, in CSS pixels of the box. */
function drawnRect(img: HTMLImageElement) {
  const rect = img.getBoundingClientRect();
  const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
  const width = img.naturalWidth * scale;
  const height = img.naturalHeight * scale;
  return { rect, scale, offsetX: (rect.width - width) / 2, offsetY: (rect.height - height) / 2, width, height };
}

function AddressBar({ live }: { live: boolean }) {
  const url = useRun((s) => s.url);
  const paused = useRun((s) => s.paused);
  const controls = useRunControls();
  const [draft, setDraft] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = draft?.trim();
    setDraft(null);
    if (value && live) controls.navigate(value);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2">
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full bg-muted-foreground/40", live && !paused && "signal-live bg-signal")}
      />
      <input
        value={draft ?? url ?? (live ? "" : "about:blank")}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => e.key === "Escape" && (setDraft(null), e.currentTarget.blur())}
        readOnly={!live}
        placeholder="Enter a URL"
        aria-label="Page address"
        spellCheck={false}
        className="h-7 min-w-0 flex-1 rounded bg-transparent px-1.5 font-mono text-xs text-muted-foreground outline-none read-only:cursor-default focus:bg-background focus:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
    </form>
  );
}

function LiveView() {
  const preview = useRun((s) => s.preview);
  const phase = useRun((s) => s.phase);
  const paused = useRun((s) => s.paused);
  const error = useRun((s) => s.error);
  const recording = useRun((s) => s.recording);
  const recordOnly = useRun((s) => s.recordOnly);
  const inspected = useRun((s) => s.inspected);
  const viewport = useWorkbench((s) => s.settings.viewport);
  const projectId = useWorkbench((s) => s.project?.id);
  const controls = useRunControls();
  const active = isActive(phase);
  const live = phase === "running";
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [askUrl, setAskUrl] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Keystrokes must reach the page in order, so every input waits for the previous one.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const wheel = useRef<{ x: number; y: number; dx: number; dy: number; timer?: number }>({ x: 0, y: 0, dx: 0, dy: 0 });
  const inspectBusy = useRef(0);

  useEffect(() => {
    if (!live) setInspecting(false);
  }, [live]);
  useEffect(() => {
    inspectBusy.current = 0;
  }, [inspected]);

  const enqueue = (send: () => Promise<unknown>) => {
    queue.current = queue.current.then(send, send);
  };

  /** Convert a pointer position on the letterboxed image to page coordinates. */
  function toPage(clientX: number, clientY: number) {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return null;
    const d = drawnRect(img);
    const px = clientX - d.rect.left - d.offsetX;
    const py = clientY - d.rect.top - d.offsetY;
    if (px < 0 || py < 0 || px > d.width || py > d.height) return null;
    return { x: px / d.scale, y: py / d.scale, localX: clientX - d.rect.left, localY: clientY - d.rect.top };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!live) return;
    // Keep focus on the hidden field so the next keystrokes go to the page.
    e.preventDefault();
    inputRef.current?.focus({ preventScroll: true });
    if (inspecting) {
      const locator = useRun.getState().inspected?.locator;
      if (locator) {
        navigator.clipboard.writeText(locator);
        toast.success("Locator copied", { description: locator });
      }
      return;
    }
    const pos = toPage(e.clientX, e.clientY);
    if (!pos) return;
    setRipple({ x: pos.localX, y: pos.localY, key: Date.now() });
    enqueue(() => controls.click(pos.x, pos.y));
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!inspecting || !live) return;
    const now = Date.now();
    // One question in flight at a time; give up waiting after 400 ms.
    if (inspectBusy.current && now - inspectBusy.current < 400) return;
    const pos = toPage(e.clientX, e.clientY);
    if (!pos) return;
    inspectBusy.current = now;
    controls.inspect(pos.x, pos.y);
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
    // Batch a burst of wheel events into one scroll.
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
    if (e.key === "Escape" && inspecting) {
      e.preventDefault();
      setInspecting(false);
      useRun.getState().setInspected(null);
      return;
    }
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

  function toggleRecord() {
    if (live) controls.setRecording(!recording);
    else setAskUrl(true);
  }

  // Inspector highlight, mapped from page pixels onto the scaled screenshot.
  let highlight: { left: number; top: number; width: number; height: number } | null = null;
  if (inspecting && inspected?.box && imgRef.current?.naturalWidth) {
    const d = drawnRect(imgRef.current);
    highlight = {
      left: d.offsetX + inspected.box.x * d.scale,
      top: d.offsetY + inspected.box.y * d.scale,
      width: inspected.box.width * d.scale,
      height: inspected.box.height * d.scale,
    };
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b pr-1.5 pl-3 text-xs">
        <AddressBar live={live} />
        <span className="hidden shrink-0 px-1 font-mono text-muted-foreground tabular xl:inline">
          {viewport.width}×{viewport.height}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Inspect elements"
              aria-pressed={inspecting}
              disabled={!live}
              onClick={() => {
                setInspecting((v) => !v);
                useRun.getState().setInspected(null);
                inputRef.current?.focus({ preventScroll: true });
              }}
              className={cn(inspecting && "bg-accent text-foreground")}
            >
              <SquareDashedMousePointer />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Inspect: hover to see a locator, click to copy it</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              aria-pressed={recording}
              disabled={(!live && active) || !projectId}
              onClick={toggleRecord}
              className={cn("gap-1.5", recording && "text-signal")}
            >
              <span aria-hidden className={cn("size-2 rounded-full border border-current", recording && "signal-live border-signal bg-signal")} />
              {recording ? "Recording" : "Record"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{live ? (recording ? "Stop recording actions" : "Record what you do on the page") : "Open a page and record what you do"}</TooltipContent>
        </Tooltip>
      </div>

      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden bg-muted/30 outline-offset-[-2px]",
          focused && live && "outline-2 outline-ring",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => inspecting && useRun.getState().setInspected(null)}
        onWheel={onWheel}
      >
        {preview ? (
          <>
            <img
              ref={imgRef}
              src={preview}
              alt="Live view of the browser page"
              draggable={false}
              className={cn("h-full w-full object-contain select-none", live && (inspecting ? "cursor-crosshair" : "cursor-pointer"))}
            />
            {ripple && (
              <span
                key={ripple.key}
                aria-hidden
                className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-signal animate-out fade-out-0 zoom-out-150 fill-mode-forwards duration-300"
                style={{ left: ripple.x, top: ripple.y }}
              />
            )}
            {highlight && (
              <div aria-hidden className="pointer-events-none absolute border-2 border-signal bg-signal/10" style={highlight}>
                <span className="absolute top-full left-0 mt-1 max-w-[28rem] truncate rounded bg-foreground px-1.5 py-0.5 font-mono text-[11px] text-background">
                  {inspected?.locator}
                </span>
              </div>
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
                Run a script to watch the page here, or press Record to open a page and turn what you do into code.
              </span>
            )}
          </div>
        )}
        {paused && !recordOnly && (
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

      <RecordedSteps />

      {active && (
        <div className="flex shrink-0 items-center gap-2 border-t p-2">
          {!recordOnly && (
            <Button size="sm" variant="outline" onClick={paused ? controls.resume : controls.pause} disabled={!live}>
              {paused ? <Play /> : <Pause />}
              {paused ? "Resume" : "Pause"}
            </Button>
          )}
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" aria-live="polite">
            {inspecting ? (
              <>
                Hover an element, click to copy its locator. <Kbd>Esc</Kbd> to stop.
              </>
            ) : focused && live ? (
              <>
                Typing goes to the page. <Kbd>Shift</Kbd> <Kbd>Esc</Kbd> to leave.
              </>
            ) : recordOnly ? (
              "Use the page. Press Stop in the top bar when you are done."
            ) : (
              "Click the page to interact with it."
            )}
          </p>
        </div>
      )}

      <PromptDialog
        open={askUrl}
        onOpenChange={setAskUrl}
        title="Record actions"
        description="Opens the page in the server's browser. Clicks, typing and key presses you make there become Playwright code."
        label="Start at URL"
        initialValue="https://"
        submitLabel="Open and record"
        validate={(v) => (/^https?:\/\/[^\s]+\.[^\s]+|^https?:\/\/localhost/.test(v) || /^[\w-]+(\.[\w-]+)+/.test(v) ? null : "Enter a web address, like example.com.")}
        onSubmit={(url) => controls.record(/^https?:\/\//.test(url) ? url : `https://${url}`)}
      />
    </div>
  );
}

function RecordedSteps() {
  const steps = useRun((s) => s.steps);
  const recording = useRun((s) => s.recording);
  const clear = useRun((s) => s.clearSteps);
  const activeFile = useWorkbench((s) => s.activeFile);
  const insertAtCursor = useWorkbench((s) => s.insertAtCursor);
  const [open, setOpen] = useState(true);
  const tidy = useMemo(() => tidySteps(steps), [steps]);
  const code = useMemo(() => stepsToCode(steps), [steps]);
  const listRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [code]);

  if (steps.length === 0 && !recording) return null;

  return (
    <section aria-label="Recorded steps" className="flex max-h-[45%] shrink-0 flex-col border-t">
      <div className="flex h-8 shrink-0 items-center gap-1 pr-1.5 pl-3">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium focus-visible:underline focus-visible:outline-none"
        >
          <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-150", !open && "-rotate-90")} />
          Recorded steps
          <span className="font-mono text-muted-foreground tabular">{tidy.length}</span>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="xs"
              variant="ghost"
              disabled={tidy.length === 0}
              onClick={() => {
                insertAtCursor(code);
                toast.success(`Inserted ${tidy.length} step${tidy.length === 1 ? "" : "s"} into ${activeFile}`);
              }}
            >
              <ListPlus /> Insert
            </Button>
          </TooltipTrigger>
          <TooltipContent>Insert at the cursor in {activeFile}</TooltipContent>
        </Tooltip>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Copy recorded code"
          disabled={tidy.length === 0}
          onClick={() => {
            navigator.clipboard.writeText(code);
            toast.success("Recorded code copied");
          }}
        >
          <Copy />
        </Button>
        <Button size="icon-xs" variant="ghost" aria-label="Clear recorded steps" disabled={steps.length === 0} onClick={clear}>
          <Trash2 />
        </Button>
      </div>
      {open && (
        <pre ref={listRef} className="min-h-0 overflow-auto bg-editor px-3 py-2 font-mono text-xs leading-5">
          {tidy.length === 0 ? <span className="text-muted-foreground">Click or type on the page to record a step.</span> : code}
        </pre>
      )}
    </section>
  );
}
