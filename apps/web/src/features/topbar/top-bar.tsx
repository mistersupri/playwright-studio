import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown, Copy, Download, History, Lock, LogOut, Moon, Pencil, Play, Save, Settings, Share2, Square, Sun, Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PromptDialog } from "@/components/prompt-dialog";
import { Wordmark } from "@/components/wordmark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSettingsDialog } from "@/features/settings/settings-store";
import { useMe, useSignOut } from "@/hooks/use-auth";
import { useCollab } from "@/hooks/use-collab";
import { useDuplicateProject, useIsOwner, useSaveProject } from "@/hooks/use-project";
import { useRunControls } from "@/hooks/use-run-controls";
import { api, errorMessage } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { isActive, useRun } from "@/stores/run";
import { useIsDirty, useWorkbench } from "@/stores/workbench";
import { ProjectSwitcher, useProjects } from "./project-switcher";
import { RunSettingsButton } from "./run-settings";
import { ShareDialog } from "./share-dialog";
import { VersionsDialog } from "./versions-dialog";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export function TopBar() {
  const project = useWorkbench((s) => s.project);
  const name = useWorkbench((s) => s.name);
  const setName = useWorkbench((s) => s.setName);
  const activeFile = useWorkbench((s) => s.activeFile);
  const autoSave = useWorkbench((s) => s.settings.autoSave);
  const updateSettings = useWorkbench((s) => s.updateSettings);
  const dirty = useIsDirty();
  const isOwner = useIsOwner();
  const phase = useRun((s) => s.phase);
  const running = isActive(phase);
  const controls = useRunControls();
  const save = useSaveProject();
  const duplicate = useDuplicateProject();
  const collab = useCollab();
  const me = useMe();
  const signOut = useSignOut();
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);
  const projects = useProjects();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [switcher, setSwitcher] = useState(false);
  const showSettings = useSettingsDialog((s) => s.show);
  const [dialog, setDialog] = useState<"rename" | "versions" | "share" | "delete" | null>(null);

  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${project!.id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
      const next = projects.data?.mine.find((p) => p.id !== project?.id);
      navigate(next ? `/?project=${next.id}` : "/", { replace: true });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Keyboard: Ctrl/Cmd+S saves, Ctrl/Cmd+Enter runs the open file.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isOwner && dirty && !save.isPending) save.mutate();
      } else if (mod && e.key === "Enter") {
        e.preventDefault();
        if (!isActive(useRun.getState().phase)) controls.start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOwner, dirty, save, controls]);

  // Autosave a moment after the last edit.
  useEffect(() => {
    if (!autoSave || !dirty || !isOwner || save.isPending) return;
    const t = window.setTimeout(() => save.mutate(), 1500);
    return () => window.clearTimeout(t);
  });

  async function downloadZip() {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const f of useWorkbench.getState().files) zip.file(f.name, f.code);
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(name || "project").replace(/[^\w.-]+/g, "-")}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const saveLabel = save.isPending ? "Saving" : dirty ? "Unsaved" : "Saved";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-panel px-2 sm:px-3">
      <Wordmark live={running} className="hidden shrink-0 sm:inline-flex" />
      <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />

      <div className="flex min-w-0 items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="min-w-0 max-w-[14rem] gap-1.5 px-2 sm:max-w-[20rem]">
              {project?.isPrivate === false ? null : <Lock className="text-muted-foreground" aria-label="Private" />}
              <span className="truncate font-medium">{name || "Untitled"}</span>
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuItem onSelect={() => setSwitcher(true)}>
              Open project <DropdownMenuShortcut>{MOD} K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!isOwner} onSelect={() => setDialog("rename")}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!project || duplicate.isPending} onSelect={() => project && duplicate.mutate(project.id)}>
              <Copy /> Make a copy
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!project} onSelect={() => setDialog("versions")}>
              <History /> Versions
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog("share")}>
              <Share2 /> Share
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={downloadZip}>
              <Download /> Download as .zip
            </DropdownMenuItem>
            {isOwner && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => updateSettings({ autoSave: !autoSave })}>
                  <Save /> {autoSave ? "Turn off autosave" : "Turn on autosave"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                  <Trash2 /> Delete project
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {isOwner ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => save.mutate()}
                disabled={!dirty || save.isPending}
                className={cn("gap-1.5 px-2 text-xs", dirty ? "text-foreground" : "text-muted-foreground")}
                aria-label={`${saveLabel}. Save project`}
              >
                {save.isPending ? <Spinner /> : <span aria-hidden className={cn("size-1.5 rounded-full", dirty ? "bg-warning" : "bg-muted-foreground/40")} />}
                <span className="hidden md:inline">{autoSave && !dirty ? "Autosave on" : saveLabel}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Save <Kbd className="ml-1">{MOD} S</Kbd>
            </TooltipContent>
          </Tooltip>
        ) : (
          project && (
            <Button size="sm" variant="outline" className="ml-1 hidden sm:inline-flex" onClick={() => duplicate.mutate(project.id)} disabled={duplicate.isPending}>
              <Copy /> Copy to edit
            </Button>
          )
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        {collab.others.length > 0 && (
          <div className="mr-1 hidden -space-x-1.5 sm:flex" aria-label={`${collab.others.length} other people here`}>
            {collab.others.slice(0, 4).map((p) => (
              <Tooltip key={p.id}>
                <TooltipTrigger asChild>
                  <span
                    className="grid size-6 place-items-center rounded-full border-2 border-panel text-[10px] font-semibold text-white"
                    style={{ background: p.color }}
                  >
                    {initials(p.name)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {p.name}
                  {p.cursor ? ` · ${p.cursor.file}:${p.cursor.line}` : ""}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        <RunSettingsButton />

        {running ? (
          <Button variant="outline" size="sm" onClick={controls.stop} disabled={phase === "starting"} className="min-w-[5.5rem]">
            <Square className="fill-current" /> Stop
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="signal" size="sm" onClick={() => controls.start()} disabled={!project} className="min-w-[5.5rem]">
                <Play className="fill-current" /> Run
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Run {activeFile} <Kbd className="ml-1">{MOD} ↵</Kbd>
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{theme === "dark" ? "Light theme" : "Dark theme"}</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Account" className="rounded-full">
              <Avatar className="size-7">
                {me.data?.avatarUrl && <AvatarImage src={me.data.avatarUrl} alt="" />}
                <AvatarFallback className="text-[11px]">{initials(me.data?.name ?? "")}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-medium">{me.data?.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{me.data?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => showSettings()}>
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={signOut}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ProjectSwitcher open={switcher} onOpenChange={setSwitcher} />
      <PromptDialog
        open={dialog === "rename"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Rename project"
        label="Project name"
        initialValue={name}
        submitLabel="Rename"
        validate={(v) => (v.length > 80 ? "Keep it under 80 characters." : null)}
        onSubmit={(v) => {
          setName(v);
          setTimeout(() => save.mutate(), 0);
        }}
      />
      <VersionsDialog open={dialog === "versions"} onOpenChange={(o) => !o && setDialog(null)} />
      <ShareDialog open={dialog === "share"} onOpenChange={(o) => !o && setDialog(null)} />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete “${project?.name}”?`}
        description="The project, its versions, schedules and files are deleted for good. Run history stays."
        confirmLabel="Delete project"
        onConfirm={() => remove.mutateAsync()}
      />
    </header>
  );
}
