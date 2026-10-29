import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ArtifactViewer } from "@/features/browser/artifact-viewer";
import { api, errorMessage } from "@/lib/api";
import { formatDuration, formatRelative, formatTime } from "@/lib/format";
import type { Artifact, RunDetail, RunStatus, RunSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkbench } from "@/stores/workbench";
import { PanelHeader } from "./panel-header";

export const STATUS_LABEL: Record<RunStatus, string> = { running: "Running", success: "Passed", failed: "Failed", stopped: "Stopped" };
export const STATUS_CLASS: Record<RunStatus, string> = {
  running: "text-signal",
  success: "text-success",
  failed: "text-danger",
  stopped: "text-muted-foreground",
};

export function HistoryPanel() {
  const projectId = useWorkbench((s) => s.project?.id);
  const runs = useQuery({
    queryKey: ["runs", projectId],
    queryFn: () => api.get<RunSummary[]>(`/runs?projectId=${encodeURIComponent(projectId!)}`),
    enabled: Boolean(projectId),
  });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Run history" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {runs.isPending ? (
          <div className="grid gap-2 p-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : runs.isError ? (
          <div className="p-3 text-xs">
            <p className="text-danger">{runs.error.message}</p>
            <Button variant="outline" size="xs" className="mt-2" onClick={() => runs.refetch()}>
              Try again
            </Button>
          </div>
        ) : runs.data.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">Runs of this project, manual and scheduled, are kept here with their logs and files.</p>
        ) : (
          <ul className="divide-y">
            {runs.data.map((r) => (
              <li key={r.id}>
                <button onClick={() => setOpen(r.id)} className="w-full px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("text-xs font-medium", STATUS_CLASS[r.status])}>{STATUS_LABEL[r.status]}</span>
                    <span className="text-xs text-muted-foreground tabular">{formatRelative(r.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate font-mono">{r.entryFile}</span>
                    <span className="shrink-0 tabular">
                      {r.trigger === "schedule" ? "scheduled · " : ""}
                      {formatDuration(r.createdAt, r.finishedAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <RunDetailDialog runId={open} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  );
}

function RunDetailDialog({ runId, onOpenChange }: { runId: string | null; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.get<RunDetail>(`/runs/${runId}`),
    enabled: Boolean(runId),
  });
  const [viewing, setViewing] = useState<Artifact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const run = detail.data;

  return (
    <Dialog open={runId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{run ? `${STATUS_LABEL[run.status]} · ${run.entryFile}` : "Run"}</DialogTitle>
          <DialogDescription>
            {run ? `${new Date(run.createdAt).toLocaleString()} · ${formatDuration(run.createdAt, run.finishedAt) || "still running"}` : "Loading run details"}
          </DialogDescription>
        </DialogHeader>
        {detail.isPending ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner /> Loading
          </div>
        ) : detail.isError ? (
          <p className="text-sm text-danger">{detail.error.message}</p>
        ) : (
          <div className="grid min-h-0 gap-4 overflow-y-auto">
            {run!.error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{run!.error}</p>}
            {run!.artifacts.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-xs font-semibold">Files ({run!.artifacts.length})</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {run!.artifacts.map((a) => (
                    <li key={a.id}>
                      <Button variant="outline" size="xs" className="font-mono" onClick={() => setViewing(a)}>
                        {a.name}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="min-h-0">
              <h3 className="mb-1.5 text-xs font-semibold">Log</h3>
              <div className="max-h-[45dvh] overflow-y-auto rounded-md border bg-panel py-1 font-mono text-xs leading-5">
                {run!.logs.length === 0 ? (
                  <p className="px-3 text-muted-foreground">No output was recorded.</p>
                ) : (
                  run!.logs.map((l, i) => (
                    <div key={i} className="flex gap-3 px-3">
                      <span className="shrink-0 text-muted-foreground tabular">{formatTime(l.at)}</span>
                      <span className={cn("min-w-0 break-words whitespace-pre-wrap", l.level === "error" && "text-danger", l.level === "warning" && "text-warning", l.level === "success" && "text-success")}>
                        {l.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                disabled={deleting || run!.status === "running"}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await api.delete(`/runs/${runId}`);
                    qc.invalidateQueries({ queryKey: ["runs"] });
                    onOpenChange(false);
                  } catch (err) {
                    toast.error(errorMessage(err));
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                <Trash2 /> Delete this run
              </Button>
            </div>
          </div>
        )}
        <ArtifactViewer artifact={viewing} gallery={run?.artifacts} onOpenChange={(o) => !o && setViewing(null)} onNavigate={setViewing} />
      </DialogContent>
    </Dialog>
  );
}
