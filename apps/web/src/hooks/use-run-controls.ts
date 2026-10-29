import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { isActive, useRun } from "@/stores/run";
import { useWorkbench } from "@/stores/workbench";

const EVENTS = ["status", "log", "preview", "network", "cookies", "choice", "artifact", "url", "step", "recording", "inspected", "done"] as const;

let source: EventSource | null = null;

function listen(runId: string, onDone: () => void) {
  source?.close();
  const es = new EventSource(`/api/runs/${runId}/events`);
  source = es;
  const push = useRun.getState().push;
  for (const type of EVENTS) {
    es.addEventListener(type, (e) => {
      push(type, JSON.parse((e as MessageEvent).data));
      if (type === "done") {
        es.close();
        source = null;
        onDone();
      }
    });
  }
  es.onerror = () => {
    // EventSource retries on its own; give up only when the run is no longer active server side.
    if (es.readyState === EventSource.CLOSED) {
      source = null;
      if (isActive(useRun.getState().phase)) useRun.getState().fail("Lost the connection to this run.");
    }
  };
}

export function useRunControls() {
  const qc = useQueryClient();
  const busy = useRef(false);

  const finished = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["artifacts"] });
    qc.invalidateQueries({ queryKey: ["runs"] });
    qc.invalidateQueries({ queryKey: ["session"] });
    const { phase, error } = useRun.getState();
    if (phase === "success") toast.success("Run finished");
    else if (phase === "failed") toast.error("Run failed", { description: error ?? undefined });
  }, [qc]);

  const start = useCallback(
    async (entryFile?: string, record?: { url: string }) => {
      if (busy.current || isActive(useRun.getState().phase)) return;
      busy.current = true;
      const wb = useWorkbench.getState();
      const file = entryFile ?? wb.activeFile;
      const s = wb.settings;
      useRun.getState().begin(file, Boolean(record));
      try {
        const { runId } = await api.post<{ runId: string }>("/runs", {
          projectId: wb.project?.id,
          projectName: wb.name || "Untitled",
          files: wb.files,
          entryFile: file,
          workspaceId: s.workspaceId,
          timeoutSeconds: s.timeoutSeconds,
          viewport: s.viewport,
          stealth: s.stealth,
          binarizeCaptcha: s.binarizeCaptcha,
          useGeminiCaptcha: s.useGeminiCaptcha,
          recordVideo: s.recordVideo,
          debug: s.debug,
          breakpoints: s.debug ? (wb.breakpoints[`${wb.project?.id ?? ""}/${file}`] ?? []) : [],
          record,
        });
        useRun.getState().attach(runId);
        listen(runId, finished);
      } catch (err) {
        useRun.getState().fail(errorMessage(err));
        toast.error("Could not start the run", { description: errorMessage(err) });
      } finally {
        busy.current = false;
      }
    },
    [finished],
  );

  const call = useCallback(async (path: string, body?: Record<string, unknown>) => {
    const runId = useRun.getState().runId;
    if (!runId) return;
    try {
      await api.post(`/runs/${runId}/${path}`, body);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);

  return {
    start,
    stop: () => call("stop"),
    pause: () => call("pause"),
    resume: () => call("resume"),
    click: (x: number, y: number) => call("input", { type: "click", x, y }),
    type: (text: string) => call("input", { type: "type", text }),
    key: (key: string) => call("input", { type: "key", key }),
    wheel: (x: number, y: number, deltaX: number, deltaY: number) => call("input", { type: "wheel", x, y, deltaX, deltaY }),
    choose: (indexes: number[]) => call("choice", { indexes }),
    record: (url: string) => start(undefined, { url }),
    setRecording: (on: boolean) => call("record", { on }),
    navigate: (url: string) => call("input", { type: "navigate", url }),
    inspect: (x: number, y: number) => call("input", { type: "inspect", x, y }),
  };
}

/** Close the stream when the workbench unmounts. */
export function useRunStreamCleanup() {
  useEffect(() => () => source?.close(), []);
}
