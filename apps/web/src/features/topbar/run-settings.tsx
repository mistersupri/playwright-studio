import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useArtifacts } from "@/features/browser/outputs";
import { useIsOwner } from "@/hooks/use-project";
import { api, errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { Project } from "@/lib/types";
import { DEFAULT_SETTINGS, type RunSettings as Settings, useWorkbench } from "@/stores/workbench";

const VIEWPORTS = [
  { label: "Desktop 1280×720", width: 1280, height: 720 },
  { label: "Desktop 1920×1080", width: 1920, height: 1080 },
  { label: "Laptop 1366×768", width: 1366, height: 768 },
  { label: "Tablet 768×1024", width: 768, height: 1024 },
  { label: "Phone 390×844", width: 390, height: 844 },
];

const BROWSERS = [
  { id: "chromium", label: "Chromium" },
  { id: "firefox", label: "Firefox" },
  { id: "webkit", label: "WebKit (Safari engine)" },
] as const;

interface Diagnostics {
  browsers: Record<"chromium" | "firefox" | "webkit", boolean>;
}

/** Number of settings that differ from a plain run, shown on the button. */
function changedCount(s: Settings) {
  const d = DEFAULT_SETTINGS;
  return [
    s.debug, s.recordVideo, s.trace, s.stealth, s.binarizeCaptcha, s.useGeminiCaptcha,
    s.browser !== d.browser, Boolean(s.device), Boolean(s.locale), Boolean(s.timezoneId), Boolean(s.geolocation),
    Boolean(s.proxy), Boolean(s.data),
  ].filter(Boolean).length;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-b px-4 py-4 last:border-b-0">
      <h3 className="text-xs font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="-mx-2 flex cursor-pointer items-start gap-3 rounded-md px-2 py-1 hover:bg-accent">
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
    </label>
  );
}

export function RunSettingsButton() {
  const settings = useWorkbench((s) => s.settings);
  const update = useWorkbench((s) => s.updateSettings);
  const projectId = useWorkbench((s) => s.project?.id);
  const [open, setOpen] = useState(false);
  const count = changedCount(settings);
  const preset = VIEWPORTS.find((v) => v.width === settings.viewport.width && v.height === settings.viewport.height);

  const diagnostics = useQuery({ queryKey: ["diagnostics"], queryFn: () => api.get<Diagnostics>("/system/diagnostics"), enabled: open, staleTime: 5 * 60_000 });
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.get<{ name: string; width: number; height: number; mobile: boolean }[]>("/system/devices"),
    enabled: open,
    staleTime: Infinity,
  });
  const artifacts = useArtifacts(projectId);
  const dataFiles = (artifacts.data ?? []).filter((a) => a.kind === "upload" && /\.(csv|xlsx)$/i.test(a.name));
  const dataFile = settings.data && settings.data.projectId === projectId ? settings.data : null;
  const timezones = useMemo(() => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []), []);
  const [geoDraft, setGeoDraft] = useState(settings.geolocation ? `${settings.geolocation.latitude}, ${settings.geolocation.longitude}` : "");

  function saveGeo(value: string) {
    const m = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!value.trim()) update({ geolocation: null });
    else if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) update({ geolocation: { latitude: +m[1], longitude: +m[2] } });
    else toast.error("Location must be latitude, longitude, like -6.2, 106.8");
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Run settings">
          <SlidersHorizontal />
          <span className="hidden xl:inline">Run settings</span>
          {count > 0 && <span className="font-mono text-xs text-muted-foreground tabular">{count}</span>}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(26rem,100vw)] gap-0 overflow-y-auto p-0 sm:max-w-none">
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle>Run settings</SheetTitle>
          <SheetDescription>Apply to runs you start here. Schedules keep the settings they were created with.</SheetDescription>
        </SheetHeader>

        <Section title="Run">
          <div className="grid gap-1">
            <Label htmlFor="rs-timeout" className="text-xs">Time limit (seconds)</Label>
            <Input
              id="rs-timeout"
              type="number"
              min={5}
              max={3600}
              value={settings.timeoutSeconds}
              onChange={(e) => update({ timeoutSeconds: Math.max(5, Math.min(3600, Number(e.target.value) || 120)) })}
              className="h-8 font-mono text-xs"
            />
          </div>
          <Toggle label="Debugger" hint="Stop at breakpoints and slow each action down." checked={settings.debug} onChange={(v) => update({ debug: v })} />
          <Toggle label="Record video" hint="Save a .webm of the session to Files." checked={settings.recordVideo} onChange={(v) => update({ recordVideo: v })} />
          <Toggle label="Record trace" hint="Save a Playwright trace: every action with DOM snapshots, network and console." checked={settings.trace} onChange={(v) => update({ trace: v })} />
        </Section>

        <Section title="Browser">
          <div className="grid gap-1">
            <Label htmlFor="rs-browser" className="text-xs">Engine</Label>
            <Select value={settings.browser} onValueChange={(v) => update({ browser: v as Settings["browser"] })}>
              <SelectTrigger id="rs-browser" size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BROWSERS.map((b) => {
                  const missing = diagnostics.data && !diagnostics.data.browsers[b.id];
                  return (
                    <SelectItem key={b.id} value={b.id} disabled={missing}>
                      {b.label}
                      {missing && <span className="text-muted-foreground">(not installed)</span>}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="rs-device" className="text-xs">Device</Label>
              <Select value={settings.device ?? "none"} onValueChange={(v) => update({ device: v === "none" ? null : v })}>
                <SelectTrigger id="rs-device" size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">None (use viewport)</SelectItem>
                  {devices.data?.map((d) => (
                    <SelectItem key={d.name} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="rs-viewport" className="text-xs">Viewport</Label>
              <Select
                value={preset ? `${preset.width}x${preset.height}` : "custom"}
                disabled={Boolean(settings.device)}
                onValueChange={(v) => {
                  const p = VIEWPORTS.find((x) => `${x.width}x${x.height}` === v);
                  if (p) update({ viewport: { width: p.width, height: p.height } });
                }}
              >
                <SelectTrigger id="rs-viewport" size="sm" className="w-full"><SelectValue placeholder="Custom" /></SelectTrigger>
                <SelectContent>
                  {VIEWPORTS.map((v) => <SelectItem key={v.label} value={`${v.width}x${v.height}`}>{v.label}</SelectItem>)}
                  {!preset && <SelectItem value="custom">Custom</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="rs-locale" className="text-xs">Language</Label>
              <Input id="rs-locale" value={settings.locale} onChange={(e) => update({ locale: e.target.value.trim() })} placeholder="id-ID" className="h-8 font-mono text-xs" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="rs-tz" className="text-xs">Time zone</Label>
              <Select value={settings.timezoneId || "default"} onValueChange={(v) => update({ timezoneId: v === "default" ? "" : v })}>
                <SelectTrigger id="rs-tz" size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="default">Server default</SelectItem>
                  {timezones.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="rs-geo" className="text-xs">Location (latitude, longitude)</Label>
            <Input
              id="rs-geo"
              value={geoDraft}
              onChange={(e) => setGeoDraft(e.target.value)}
              onBlur={(e) => saveGeo(e.target.value)}
              placeholder="-6.2088, 106.8456"
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="rs-proxy" className="text-xs">Proxy</Label>
            <Input
              id="rs-proxy"
              value={settings.proxy}
              onChange={(e) => update({ proxy: e.target.value.trim() })}
              placeholder="http://user:pass@host:8080"
              autoComplete="off"
              className="h-8 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">The password is kept in this browser and hidden from run logs.</p>
          </div>
        </Section>

        <Section title="Data">
          <div className="grid gap-1">
            <Label htmlFor="rs-data" className="text-xs">Run once per row of</Label>
            <Select
              value={dataFile?.artifactId ?? "none"}
              onValueChange={(v) => {
                const a = dataFiles.find((f) => f.id === v);
                update({ data: a && projectId ? { projectId, artifactId: a.id, name: a.name } : null });
              }}
            >
              <SelectTrigger id="rs-data" size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nothing, run once</SelectItem>
                {dataFiles.map((a) => <SelectItem key={a.id} value={a.id} className="font-mono">{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {dataFiles.length === 0
                ? "Upload a .csv or .xlsx in Files to use it here."
                : <>The script reads the current row as <code className="font-mono">row.ColumnName</code>, plus <code className="font-mono">rowIndex</code> and <code className="font-mono">data</code>.</>}
            </p>
          </div>
          <Toggle label="Stop at the first failing row" hint="Otherwise every row runs and failures are summed up at the end." checked={settings.stopOnError} onChange={(v) => update({ stopOnError: v })} disabled={!dataFile} />
        </Section>

        <Section title="CAPTCHA and stealth">
          <Toggle label="Stealth mode" hint="Hide common automation fingerprints (Chromium only)." checked={settings.stealth} onChange={(v) => update({ stealth: v })} />
          <Toggle label="Clean CAPTCHA images" hint="High-contrast pass before OCR." checked={settings.binarizeCaptcha} onChange={(v) => update({ binarizeCaptcha: v })} />
          <Toggle label="Read CAPTCHAs with Gemini" hint="Falls back to Tesseract without a key." checked={settings.useGeminiCaptcha} onChange={(v) => update({ useGeminiCaptcha: v })} />
        </Section>

        <Section title="This project">
          <ProjectSession />
        </Section>
      </SheetContent>
    </Sheet>
  );
}

/** Per-project: keep cookies and local storage between runs so logins survive. */
function ProjectSession() {
  const project = useWorkbench((s) => s.project);
  const markSaved = useWorkbench((s) => s.markSaved);
  const isOwner = useIsOwner();
  const qc = useQueryClient();
  const session = useQuery({
    queryKey: ["session", project?.id],
    queryFn: () => api.get<{ keepSession: boolean; savedAt: string | null }>(`/projects/${project!.id}/session`),
    enabled: Boolean(project),
  });

  const toggle = useMutation({
    mutationFn: (keepSession: boolean) => api.patch<Project>(`/projects/${project!.id}`, { keepSession }),
    onSuccess: (p) => {
      markSaved({ ...useWorkbench.getState().project!, keepSession: p.keepSession });
      qc.invalidateQueries({ queryKey: ["session", project?.id] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const clear = useMutation({
    mutationFn: () => api.delete(`/projects/${project!.id}/session`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session", project?.id] });
      toast.success("Saved session cleared", { description: "The next run starts with an empty browser." });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!project) return null;
  return (
    <div>
      <label className="-mx-2 flex cursor-pointer items-start gap-3 rounded-md px-2 py-1 hover:bg-accent">
        <span className="min-w-0 flex-1">
          <span className="block text-sm">Keep browser session</span>
          <span className="block text-xs text-muted-foreground">
            This project reuses cookies and local storage from your last run, so you stay signed in.
            {!isOwner && " Only the owner can change this."}
          </span>
        </span>
        <Switch
          checked={project.keepSession}
          disabled={!isOwner || toggle.isPending}
          onCheckedChange={(v) => toggle.mutate(v)}
          className="mt-0.5"
        />
      </label>
      {session.data?.savedAt && (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular">Saved {formatRelative(session.data.savedAt)}</span>
          <Button variant="ghost" size="xs" onClick={() => clear.mutate()} disabled={clear.isPending}>
            Clear saved session
          </Button>
        </div>
      )}
    </div>
  );
}
