import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useIsOwner } from "@/hooks/use-project";
import { api, errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { EnvWorkspace, Schedule } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useIsDirty, useWorkbench } from "@/stores/workbench";
import { PanelHeader } from "./panel-header";

const INTERVALS: { value: NonNullable<Schedule["interval"]>; label: string }[] = [
  { value: "5m", label: "Every 5 minutes" },
  { value: "15m", label: "Every 15 minutes" },
  { value: "30m", label: "Every 30 minutes" },
  { value: "1h", label: "Every hour" },
  { value: "12h", label: "Every 12 hours" },
  { value: "daily", label: "Every day" },
];

function defaultTime() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SchedulesPanel() {
  const qc = useQueryClient();
  const project = useWorkbench((s) => s.project);
  const files = useWorkbench((s) => s.files);
  const viewport = useWorkbench((s) => s.settings.viewport);
  const isOwner = useIsOwner();
  const dirty = useIsDirty();
  const schedules = useQuery({ queryKey: ["schedules"], queryFn: () => api.get<Schedule[]>("/schedules") });
  const sets = useQuery({ queryKey: ["variables"], queryFn: () => api.get<EnvWorkspace[]>("/variables") });

  const [type, setType] = useState<"once" | "repeat">("repeat");
  const [runAt, setRunAt] = useState(defaultTime);
  const [interval, setFrequency] = useState<NonNullable<Schedule["interval"]>>("daily");
  const [entryFile, setEntryFile] = useState(files[0]?.name ?? "main.js");
  const [workspaceId, setWorkspaceId] = useState<string>("default");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["schedules"] });

  const create = useMutation({
    mutationFn: () =>
      api.post<Schedule>("/schedules", {
        projectId: project!.id,
        entryFile,
        workspaceId: workspaceId === "default" ? null : workspaceId,
        type,
        runAt: type === "once" ? new Date(runAt).toISOString() : undefined,
        interval: type === "repeat" ? interval : undefined,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      }),
    onSuccess: () => {
      refresh();
      toast.success("Schedule created");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const toggle = useMutation({
    mutationFn: (s: Schedule) => api.patch(`/schedules/${s.id}`, { status: s.status === "active" ? "paused" : "active" }),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (s: Schedule) => api.delete(`/schedules/${s.id}`),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (type === "once" && new Date(runAt).getTime() <= Date.now()) {
      setError("Pick a time in the future.");
      return;
    }
    create.mutate();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Schedules" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isOwner ? (
          <form onSubmit={submit} className="grid gap-3 border-b p-3">
            <p className="text-xs text-muted-foreground">
              Scheduled runs use the last saved version of <span className="font-medium text-foreground">{project?.name}</span>.
              {dirty && <span className="text-warning"> You have unsaved changes.</span>}
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5" role="radiogroup" aria-label="Schedule type">
              {(["repeat", "once"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => setType(t)}
                  className={cn("rounded px-2 py-1 text-xs", type === t ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}
                >
                  {t === "repeat" ? "Repeat" : "Once"}
                </button>
              ))}
            </div>
            {type === "once" ? (
              <div className="grid gap-1">
                <Label htmlFor="sched-time" className="text-xs">Run at</Label>
                <Input id="sched-time" type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} className="h-8 text-xs" required />
              </div>
            ) : (
              <div className="grid gap-1">
                <Label htmlFor="sched-interval" className="text-xs">Frequency</Label>
                <Select value={interval} onValueChange={(v) => setFrequency(v as typeof interval)}>
                  <SelectTrigger id="sched-interval" size="sm" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVALS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label htmlFor="sched-file" className="text-xs">File</Label>
                <Select value={entryFile} onValueChange={setEntryFile}>
                  <SelectTrigger id="sched-file" size="sm" className="w-full font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {files.map((f) => <SelectItem key={f.name} value={f.name} className="font-mono">{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="sched-vars" className="text-xs">Variables</Label>
                <Select value={workspaceId} onValueChange={setWorkspaceId}>
                  <SelectTrigger id="sched-vars" size="sm" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    {sets.data?.filter((w) => !w.isDefault).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {error && <p className="text-xs text-danger" role="alert">{error}</p>}
            <Button type="submit" size="sm" disabled={create.isPending || !project}>
              {create.isPending && <Spinner />} Add schedule
            </Button>
          </form>
        ) : (
          <p className="border-b p-3 text-xs text-muted-foreground">Only the owner of a project can schedule it. Make a copy to schedule your own.</p>
        )}

        <div className="p-3">
          <h3 className="text-xs font-semibold">All schedules</h3>
          {schedules.isPending ? (
            <div className="mt-2 grid gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          ) : schedules.isError ? (
            <p className="mt-2 text-xs text-danger">{schedules.error.message}</p>
          ) : schedules.data.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">Nothing scheduled.</p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {schedules.data.map((s) => (
                <li key={s.id} className="rounded-md border p-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{s.projectName}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{s.entryFile}</p>
                    </div>
                    {s.status !== "completed" && (
                      <Button variant="ghost" size="icon-xs" aria-label={s.status === "active" ? "Pause schedule" : "Resume schedule"} onClick={() => toggle.mutate(s)}>
                        {s.status === "active" ? <Pause /> : <Play />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-xs" aria-label="Delete schedule" onClick={() => remove.mutate(s)}>
                      <Trash2 />
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.type === "repeat" ? INTERVALS.find((i) => i.value === s.interval)?.label : `Once, ${new Date(s.runAt!).toLocaleString()}`}
                  </p>
                  <p className={cn("mt-0.5 text-xs tabular", s.status === "active" ? "text-foreground" : "text-muted-foreground")}>
                    {s.status === "completed"
                      ? `Ran ${formatRelative(s.lastRunAt)}`
                      : s.status === "paused"
                        ? "Paused"
                        : `Next run ${formatRelative(s.nextRunAt)}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
