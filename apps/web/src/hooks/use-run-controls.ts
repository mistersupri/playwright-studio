import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { RunDetail } from "@/lib/types";
import { isActive, useRun } from "@/stores/run";
import { runOptions, useWorkbench } from "@/stores/workbench";

const EVENTS = ["status", "log", "preview", "network", "cookies", "choice", "artifact", "url", "step", "recording", "inspected", "done", "synced"] as const;

/** The run this browser is watching, so a reload or a phone that dropped the tab can pick it up again. */
const STORED_RUN = "sb-active-run";
interface StoredRun {
  runId: string;
  projectId: string | null;
  file: string;
  recordOnly: boolean;
}

/**
 * One run's event stream. The run lives on the server and does not care whether anyone is watching,
 * so a dropped connection only means this page is behind: it retries, and every new connection
 * starts with a full replay of the run so far.
 */
interface Stream {
  runId: string;
  es: EventSource | null;
  retry?: number;
  attempt: number;
  connectedOnce: boolean;
  onDone: () => void;
}

let stream: Stream | null = null;

const notice = (level: "warning" | "info", message: string) =>
  useRun.getState().push("log", { source: "system", level, message, at: new Date().toISOString() });

function listen(runId: string, onDone: () => void) {
  close();
  stream = { runId, es: null, attempt: 0, connectedOnce: false, onDone };
  connect(stream);
}

function close() {
  if (!stream) return;
  window.clearTimeout(stream.retry);
  stream.es?.close();
  stream = null;
}

function connect(st: Stream) {
  if (stream !== st) return;
  st.es?.close();
  const es = new EventSource(`/api/runs/${st.runId}/events`);
  st.es = es;
  es.onopen = () => {
    if (st.connectedOnce) useRun.getState().resync();
    st.connectedOnce = true;
  };
  for (const type of EVENTS) {
    es.addEventListener(type, (e) => {
      if (stream !== st) return;
      const data = JSON.parse((e as MessageEvent).data);
      if (type === "synced") {
        st.attempt = 0;
        if (useRun.getState().reconnecting) {
          useRun.getState().setReconnecting(false);
          notice("info", "Reconnected. The script kept running on the server; the output above includes what happened while the connection was down.");
        }
        return;
      }
      useRun.getState().push(type, data);
      if (type === "done") finish(st);
    });
  }
  es.onerror = () => {
    if (stream !== st) return;
    if (!useRun.getState().reconnecting) {
      useRun.getState().setReconnecting(true);
      notice("warning", "Connection lost. The script keeps running on the server; reconnecting.");
    }
    // EventSource retries a dropped connection by itself, but gives up on an error response.
    if (es.readyState === EventSource.CLOSED) schedule(st);
  };
}

function schedule(st: Stream) {
  st.es?.close();
  st.es = null;
  window.clearTimeout(st.retry);
  const delay = Math.min(1000 * 2 ** st.attempt, 15_000);
  st.attempt++;
  st.retry = window.setTimeout(() => void recover(st), delay);
}

/** Ask where the run is before reconnecting: still going, finished while we were away, or gone. */
async function recover(st: Stream) {
  if (stream !== st) return;
  let detail: RunDetail;
  try {
    detail = await api.get<RunDetail>(`/runs/${st.runId}`);
  } catch (err) {
    if (stream !== st) return;
    // Still offline, or the server is restarting: try again later. A 4xx means the run is not ours to follow.
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      useRun.getState().setReconnecting(false);
      useRun.getState().fail(errorMessage(err));
      finish(st);
    } else schedule(st);
    return;
  }
  if (stream !== st) return;
  if (detail.live) {
    connect(st);
    return;
  }
  showFinished(detail);
  finish(st);
}

/** Put a run that ended out of sight into the console, as if we had watched it end. */
function showFinished(detail: RunDetail) {
  const run = useRun.getState();
  run.resync();
  for (const line of detail.logs) run.push("log", line);
  for (const a of detail.artifacts) run.push("artifact", a);
  run.setReconnecting(false);
  // A run row still marked active with no process behind it was lost when the server restarted.
  const lost = detail.status === "running" || detail.status === "queued";
  notice("info", "Reconnected after the run ended. Its full output is above.");
  run.push("done", lost ? { status: "failed", error: "The server restarted and this run was lost." } : { status: detail.status, error: detail.error ?? undefined });
}

function finish(st: Stream) {
  if (stream !== st) return;
  close();
  forgetRun();
  st.onDone();
}

function rememberRun(run: StoredRun) {
  try {
    localStorage.setItem(STORED_RUN, JSON.stringify(run));
  } catch {
    // Private mode or blocked storage: reconnecting still works, only a reload loses the run.
  }
}

function forgetRun() {
  try {
    localStorage.removeItem(STORED_RUN);
  } catch {
    // See rememberRun.
  }
}

function storedRun(): StoredRun | null {
  try {
    const raw = localStorage.getItem(STORED_RUN);
    return raw ? (JSON.parse(raw) as StoredRun) : null;
  } catch {
    return null;
  }
}

/** Back online, or back to the tab after the phone suspended it: reconnect now instead of waiting out the backoff. */
function wake() {
  const st = stream;
  if (!st || document.visibilityState !== "visible") return;
  const es = st.es;
  if (es && es.readyState === EventSource.OPEN) return;
  window.clearTimeout(st.retry);
  st.attempt = 0;
  es?.close();
  st.es = null;
  void recover(st);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", wake);
}

function useFinished() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: ["artifacts"] });
    qc.invalidateQueries({ queryKey: ["runs"] });
    qc.invalidateQueries({ queryKey: ["session"] });
    const { phase, error } = useRun.getState();
    if (phase === "success") toast.success("Run finished");
    else if (phase === "failed") toast.error("Run failed", { description: error ?? undefined });
  }, [qc]);
}

/** After a reload, pick up the run this browser was watching in this project, or show how it ended. */
export function useRunReattach(projectId: string | null) {
  const finished = useFinished();
  useEffect(() => {
    const saved = storedRun();
    if (!projectId || !saved || saved.projectId !== projectId || stream || isActive(useRun.getState().phase)) return;
    let cancelled = false;
    api
      .get<RunDetail>(`/runs/${saved.runId}`)
      .then((detail) => {
        if (cancelled || stream || isActive(useRun.getState().phase)) return;
        useRun.getState().begin(saved.file, saved.recordOnly);
        useRun.getState().attach(saved.runId);
        if (detail.live) {
          listen(saved.runId, finished);
          return;
        }
        showFinished(detail);
        forgetRun();
        finished();
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) forgetRun();
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, finished]);
}

export function useRunControls() {
  const busy = useRef(false);
  const finished = useFinished();

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
          viewport: s.viewport,
          ...runOptions(s, wb.project?.id),
          debug: s.debug,
          breakpoints: s.debug ? (wb.breakpoints[`${wb.project?.id ?? ""}/${file}`] ?? []) : [],
          record,
        });
        useRun.getState().attach(runId);
        rememberRun({ runId, projectId: wb.project?.id ?? null, file, recordOnly: Boolean(record) });
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
  useEffect(() => () => close(), []);
}
