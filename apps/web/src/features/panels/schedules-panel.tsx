import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useCanEdit } from "@/hooks/use-project";
import { api, errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { EnvWorkspace, Schedule } from "@/lib/types";
import { cn } from "@/lib/utils";
import { runOptions, useIsDirty, useWorkbench } from "@/stores/workbench";
import { useChannels } from "@/features/settings/notifications-tab";
import { useSettingsDialog } from "@/features/settings/settings-store";
import { PanelHeader } from "./panel-header";

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const CRON_EXAMPLES = [
  { cron: "0 8 * * 1-5", label: "Weekdays at 08:00" },
  { cron: "*/30 * * * *", label: "Every 30 minutes" },
  { cron: "0 0 1 * *", label: "First day of the month" },
];

/** Live preview of the next run times, from the server's own cron parser. */
function useCronPreview(cron: string, timezone: string, enabled: boolean) {
  const [debounced, setDebounced] = useState(cron);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(cron.trim()), 300);
    return () => clearTimeout(t);
  }, [cron]);
  return useQuery({
    queryKey: ["cron-preview", debounced, timezone],
    queryFn: () => api.post<{ next: string[] }>("/schedules/preview", { cron: debounced, timezone }),
    enabled: enabled && debounced.length > 0,
    retry: false,
  });
}

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
  const isOwner = useCanEdit();
  const dirty = useIsDirty();
  const schedules = useQuery({ queryKey: ["schedules"], queryFn: () => api.get<Schedule[]>("/schedules") });
  const sets = useQuery({ queryKey: ["variables"], queryFn: () => api.get<EnvWorkspace[]>("/variables") });

  const [type, setType] = useState<Schedule["type"]>("repeat");
  const [cron, setCron] = useState("0 8 * * 1-5");
  const [timezone, setTimezone] = useState(LOCAL_TZ);
  const [notifyOn, setNotifyOn] = useState<Schedule["notifyOn"]>("never");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const channels = useChannels();
  const showSettings = useSettingsDialog((s) => s.show);
  const preview = useCronPreview(cron, timezone, type === "cron");
  // supportedValuesOf leaves out plain "UTC", which is what many servers and browsers report.
  const timezones = useMemo(
    () => [...new Set([LOCAL_TZ, ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [])])],
    [],
  );
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
        cron: type === "cron" ? cron.trim() : undefined,
        timezone,
        notifyOn,
        channelIds: notifyOn === "never" ? [] : channelIds,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        // The schedule keeps today's run settings (browser, device, proxy, data file…).
        runOptions: runOptions(useWorkbench.getState().settings, project!.id),
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
    if (notifyOn !== "never" && channelIds.length === 0) {
      setError("Pick at least one channel to notify, or choose Never.");
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
            <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-0.5" role="radiogroup" aria-label="Schedule type">
              {(["repeat", "cron", "once"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => setType(t)}
                  className={cn("rounded px-2 py-1 text-xs", type === t ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}
                >
                  {t === "repeat" ? "Repeat" : t === "cron" ? "Cron" : "Once"}
                </button>
              ))}
            </div>
            {type === "cron" ? (
              <div className="grid gap-2">
                <div className="grid gap-1">
                  <Label htmlFor="sched-cron" className="text-xs">Cron expression</Label>
                  <Input id="sched-cron" value={cron} onChange={(e) => setCron(e.target.value)} className="h-8 font-mono text-xs" spellCheck={false} />
                  <div className="flex flex-wrap gap-1">
                    {CRON_EXAMPLES.map((ex) => (
                      <button key={ex.cron} type="button" onClick={() => setCron(ex.cron)} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                        {ex.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="sched-tz" className="text-xs">Time zone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="sched-tz" size="sm" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {timezones.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md bg-muted/60 px-2 py-1.5 text-xs" aria-live="polite">
                  {preview.isFetching && !preview.data ? (
                    <span className="text-muted-foreground">Working out the next runs…</span>
                  ) : preview.isError ? (
                    <span className="text-danger">{preview.error.message}</span>
                  ) : preview.data ? (
                    <>
                      <span className="text-muted-foreground">Next runs</span>
                      <ul className="mt-0.5 font-mono tabular">
                        {preview.data.next.map((d) => (
                          <li key={d}>{new Date(d).toLocaleString(undefined, { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              </div>
            ) : type === "once" ? (
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
            <div className="grid gap-1">
              <Label htmlFor="sched-notify" className="text-xs">Notify</Label>
              <Select value={notifyOn} onValueChange={(v) => setNotifyOn(v as Schedule["notifyOn"])}>
                <SelectTrigger id="sched-notify" size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="failure">When a run fails</SelectItem>
                  <SelectItem value="always">After every run</SelectItem>
                </SelectContent>
              </Select>
              {notifyOn !== "never" &&
                (channels.data?.channels.length ? (
                  <ul className="mt-1 grid gap-1">
                    {channels.data.channels.map((c) => (
                      <li key={c.id}>
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={channelIds.includes(c.id)}
                            onCheckedChange={(v) => setChannelIds((ids) => (v ? [...ids, c.id] : ids.filter((i) => i !== c.id)))}
                          />
                          {c.name}
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No channels yet.{" "}
                    <button type="button" className="underline underline-offset-2" onClick={() => showSettings("notifications")}>
                      Add one in Settings
                    </button>
                  </p>
                ))}
              {notifyOn === "failure" && <p className="text-xs text-muted-foreground">While it keeps failing you hear about it at most once an hour.</p>}
            </div>
            {error && <p className="text-xs text-danger" role="alert">{error}</p>}
            <Button type="submit" size="sm" disabled={create.isPending || !project}>
              {create.isPending && <Spinner />} Add schedule
            </Button>
          </form>
        ) : (
          <p className="border-b p-3 text-xs text-muted-foreground">Only the owner and editors of a project can schedule it. Make a copy to schedule your own.</p>
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
                    {s.type === "repeat"
                      ? INTERVALS.find((i) => i.value === s.interval)?.label
                      : s.type === "cron"
                        ? <span className="font-mono">{s.cron}{s.timezone ? ` (${s.timezone})` : ""}</span>
                        : `Once, ${new Date(s.runAt!).toLocaleString()}`}
                    {s.notifyOn !== "never" && ` · notifies ${s.notifyOn === "failure" ? "on failure" : "every run"}`}
                  </p>
                  <p className={cn("mt-0.5 text-xs tabular", s.status === "active" ? "text-foreground" : "text-muted-foreground")}>
                    {s.status === "completed"
                      ? `Ran ${formatRelative(s.lastRunAt)}`
                      : s.status === "paused"
                        ? "Paused"
                        : `Next run ${formatRelative(s.nextRunAt)}`}
                    {s.lastStatus && s.status !== "completed" && (
                      <span className={cn("ml-1", s.lastStatus === "success" ? "text-success" : "text-danger")}>
                        · last {s.lastStatus === "success" ? "passed" : s.lastStatus}
                      </span>
                    )}
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
