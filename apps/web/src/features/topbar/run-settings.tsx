import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useIsOwner } from "@/hooks/use-project";
import { api, errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { Project } from "@/lib/types";
import { type RunSettings as Settings, useWorkbench } from "@/stores/workbench";

const VIEWPORTS = [
  { label: "Desktop 1280×720", width: 1280, height: 720 },
  { label: "Desktop 1920×1080", width: 1920, height: 1080 },
  { label: "Laptop 1366×768", width: 1366, height: 768 },
  { label: "Tablet 768×1024", width: 768, height: 1024 },
  { label: "Phone 390×844", width: 390, height: 844 },
];

const TOGGLES: { key: keyof Settings; label: string; hint: string }[] = [
  { key: "debug", label: "Debugger", hint: "Stop at breakpoints and slow each action down." },
  { key: "recordVideo", label: "Record video", hint: "Save a .webm of the session to Files." },
  { key: "stealth", label: "Stealth mode", hint: "Hide common automation fingerprints." },
  { key: "binarizeCaptcha", label: "Clean CAPTCHA images", hint: "High-contrast pass before OCR." },
  { key: "useGeminiCaptcha", label: "Read CAPTCHAs with Gemini", hint: "Falls back to Tesseract without a key." },
];

export function RunSettingsButton() {
  const settings = useWorkbench((s) => s.settings);
  const update = useWorkbench((s) => s.updateSettings);
  const enabled = TOGGLES.filter((t) => settings[t.key]).length;
  const preset = VIEWPORTS.find((v) => v.width === settings.viewport.width && v.height === settings.viewport.height);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Run settings">
          <SlidersHorizontal />
          <span className="hidden xl:inline">Run settings</span>
          {enabled > 0 && <span className="font-mono text-xs text-muted-foreground tabular">{enabled}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="grid gap-3 border-b p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="rs-timeout" className="text-xs">Time limit (s)</Label>
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
            <div className="grid gap-1">
              <Label htmlFor="rs-viewport" className="text-xs">Viewport</Label>
              <Select
                value={preset ? `${preset.width}x${preset.height}` : "custom"}
                onValueChange={(v) => {
                  const p = VIEWPORTS.find((x) => `${x.width}x${x.height}` === v);
                  if (p) update({ viewport: { width: p.width, height: p.height } });
                }}
              >
                <SelectTrigger id="rs-viewport" size="sm" className="w-full text-xs"><SelectValue placeholder="Custom" /></SelectTrigger>
                <SelectContent>
                  {VIEWPORTS.map((v) => <SelectItem key={v.label} value={`${v.width}x${v.height}`}>{v.label}</SelectItem>)}
                  {!preset && <SelectItem value="custom">Custom</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <ul className="grid gap-0.5 p-1.5">
          {TOGGLES.map((t) => (
            <li key={t.key}>
              <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.hint}</span>
                </span>
                <Switch checked={Boolean(settings[t.key])} onCheckedChange={(v) => update({ [t.key]: v })} className="mt-0.5" />
              </label>
            </li>
          ))}
        </ul>
        <ProjectSession />
      </PopoverContent>
    </Popover>
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
    <div className="border-t p-1.5">
      <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
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
        <div className="flex items-center justify-between gap-2 px-2 pb-1 text-xs text-muted-foreground">
          <span className="tabular">Saved {formatRelative(session.data.savedAt)}</span>
          <Button variant="ghost" size="xs" onClick={() => clear.mutate()} disabled={clear.isPending}>
            Clear saved session
          </Button>
        </div>
      )}
    </div>
  );
}
