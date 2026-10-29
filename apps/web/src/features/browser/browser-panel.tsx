import { CornerDownLeft, Pause, Play } from "lucide-react";
import { type FormEvent, type MouseEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function LiveView() {
  const preview = useRun((s) => s.preview);
  const phase = useRun((s) => s.phase);
  const paused = useRun((s) => s.paused);
  const error = useRun((s) => s.error);
  const viewport = useWorkbench((s) => s.settings.viewport);
  const controls = useRunControls();
  const url = useCurrentUrl();
  const active = isActive(phase);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const [text, setText] = useState("");

  function clickPreview(e: MouseEvent<HTMLImageElement>) {
    if (phase !== "running") return;
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    // The image keeps its aspect ratio inside the box; map the click onto the real viewport.
    const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
    const drawnW = img.naturalWidth * scale;
    const drawnH = img.naturalHeight * scale;
    const offsetX = (rect.width - drawnW) / 2;
    const offsetY = (rect.height - drawnH) / 2;
    const px = e.clientX - rect.left - offsetX;
    const py = e.clientY - rect.top - offsetY;
    if (px < 0 || py < 0 || px > drawnW || py > drawnH) return;
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() });
    controls.click((px / drawnW) * img.naturalWidth, (py / drawnH) * img.naturalHeight);
  }

  function sendText(e: FormEvent) {
    e.preventDefault();
    if (!text) return;
    controls.type(text);
    setText("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs">
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full bg-muted-foreground/40", phase === "running" && !paused && "signal-live bg-signal")}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground" title={url ?? undefined}>
          {url ?? "about:blank"}
        </span>
        <span className="shrink-0 font-mono text-muted-foreground tabular">
          {viewport.width}×{viewport.height}
        </span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/30">
        {preview ? (
          <>
            <img
              src={preview}
              alt="Live view of the browser page"
              onClick={clickPreview}
              draggable={false}
              className={cn("h-full w-full object-contain select-none", phase === "running" && "cursor-crosshair")}
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
            {phase === "starting" || (phase === "running" && !preview) ? (
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
                Run a script to watch the page here. While it runs you can click the page, type, and pause.
              </span>
            )}
          </div>
        )}
        {paused && (
          <div className="absolute inset-x-0 top-0 bg-warning/15 px-3 py-1.5 text-center text-xs font-medium text-warning backdrop-blur-sm">
            Paused. The script waits before its next page action.
          </div>
        )}
      </div>

      {active && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t p-2">
          <Button size="sm" variant="outline" onClick={paused ? controls.resume : controls.pause} disabled={phase !== "running"}>
            {paused ? <Play /> : <Pause />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <form onSubmit={sendText} className="flex min-w-[10rem] flex-1 items-center gap-1">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type into the page"
              aria-label="Text to type into the page"
              className="h-8 text-xs"
              disabled={phase !== "running"}
            />
            <Button size="icon-sm" variant="outline" type="submit" aria-label="Send text" disabled={!text}>
              <CornerDownLeft />
            </Button>
          </form>
          <div className="flex items-center gap-1" aria-label="Send key">
            {["Enter", "Tab", "Escape", "Backspace"].map((key) => (
              <button
                key={key}
                onClick={() => controls.key(key)}
                disabled={phase !== "running"}
                className="pressable rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                aria-label={`Press ${key}`}
              >
                <Kbd>{key === "Escape" ? "Esc" : key === "Backspace" ? "⌫" : key}</Kbd>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
