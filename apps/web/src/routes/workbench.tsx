import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock, Code2, FileStack, History, MessageSquareCode, Monitor, Package, PanelLeftClose, PanelLeftOpen,
  Search, SquareTerminal, Variable, Video,
} from "lucide-react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrowserPanel } from "@/features/browser/browser-panel";
import { ConsolePanel } from "@/features/console/console-panel";
import { CodeEditor } from "@/features/editor/code-editor";
import { AiPanel } from "@/features/panels/ai-panel";
import { FilesPanel } from "@/features/panels/files-panel";
import { HistoryPanel } from "@/features/panels/history-panel";
import { PackagesPanel } from "@/features/panels/packages-panel";
import { RecorderPanel } from "@/features/panels/recorder-panel";
import { SchedulesPanel } from "@/features/panels/schedules-panel";
import { SearchPanel } from "@/features/panels/search-panel";
import { VariablesPanel } from "@/features/panels/variables-panel";
import { ChoiceDialog } from "@/features/topbar/choice-dialog";
import { TopBar } from "@/features/topbar/top-bar";
import { useCollabRoom } from "@/hooks/use-collab";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useRunStreamCleanup } from "@/hooks/use-run-controls";
import { api, ApiError } from "@/lib/api";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRun } from "@/stores/run";
import { type SidePanel, useIsDirty, useWorkbench } from "@/stores/workbench";

const PANELS: { id: SidePanel; label: string; icon: ComponentType<{ className?: string }>; body: ComponentType }[] = [
  { id: "files", label: "Files", icon: FileStack, body: FilesPanel },
  { id: "search", label: "Search", icon: Search, body: SearchPanel },
  { id: "variables", label: "Variables", icon: Variable, body: VariablesPanel },
  { id: "history", label: "Run history", icon: History, body: HistoryPanel },
  { id: "schedules", label: "Schedules", icon: CalendarClock, body: SchedulesPanel },
  { id: "packages", label: "Packages", icon: Package, body: PackagesPanel },
  { id: "ai", label: "Write with Gemini", icon: MessageSquareCode, body: AiPanel },
  { id: "recorder", label: "Chrome recorder", icon: Video, body: RecorderPanel },
];

/** Opens ?project=…, or the most recent project, or creates a first one. */
function useActiveProject() {
  const [params, setParams] = useSearchParams();
  const id = params.get("project");
  const qc = useQueryClient();
  const loadProject = useWorkbench((s) => s.loadProject);
  const loadedId = useRef<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (id) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await api.get<{ mine: { id: string }[] }>("/projects");
        let target = list.mine[0]?.id;
        if (!target) {
          const created = await api.post<Project>("/projects", { name: "My first script" });
          qc.setQueryData(["project", created.id], created);
          target = created.id;
        }
        if (!cancelled) setParams({ project: target }, { replace: true });
      } catch (err) {
        if (!cancelled) setBootError(err instanceof Error ? err.message : "Could not load your projects.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, qc, setParams]);

  const query = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.get<Project>(`/projects/${id}`),
    enabled: Boolean(id),
    staleTime: Infinity,
  });

  useEffect(() => {
    // Load into the editor once per project, so refetches never overwrite edits.
    if (query.data && loadedId.current !== query.data.id) {
      loadedId.current = query.data.id;
      loadProject(query.data);
    }
  }, [query.data, loadProject]);

  return { id, query, bootError };
}

export function WorkbenchPage() {
  const { id, query, bootError } = useActiveProject();
  const project = useWorkbench((s) => s.project);
  const dirty = useIsDirty();
  useCollabRoom(project?.id ?? null);
  useRunStreamCleanup();

  useEffect(() => {
    document.title = project ? `${project.name} · ScriptBench` : "ScriptBench";
  }, [project]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const error = bootError ?? (query.isError ? query.error.message : null);
  if (error) {
    const forbidden = query.error instanceof ApiError && [403, 404].includes(query.error.status);
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-sm text-center">
          <p className="font-medium">{forbidden ? "You cannot open this project." : "The project did not load."}</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" variant="outline" onClick={() => (window.location.href = "/")}>
            Go to my projects
          </Button>
        </div>
      </div>
    );
  }
  if (!id || !project || project.id !== id) {
    return (
      <div className="grid h-full place-items-center" role="status" aria-label="Loading project">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <TopBar />
      <Layout />
      <ChoiceDialog />
    </div>
  );
}

function Rail({ onSelect, collapsed }: { onSelect: (id: SidePanel) => void; collapsed?: boolean }) {
  const panel = useWorkbench((s) => s.panel);
  return (
    <nav aria-label="Side panels" className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r bg-rail py-1.5">
      {PANELS.map((p) => {
        const Icon = p.icon;
        const active = panel === p.id && !collapsed;
        return (
          <Tooltip key={p.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onSelect(p.id)}
                aria-label={p.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "touch-target relative grid size-9 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active && "bg-accent text-foreground",
                )}
              >
                <Icon className="size-[18px]" />
                {active && <span aria-hidden className="absolute top-2 bottom-2 -left-1 w-0.5 rounded-full bg-foreground" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{p.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

function ActivePanel() {
  const panel = useWorkbench((s) => s.panel);
  const Body = (PANELS.find((p) => p.id === panel) ?? PANELS[0]).body;
  return (
    <div className="h-full min-w-0 bg-panel">
      <Body />
    </div>
  );
}

function Layout() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopLayout /> : <MobileLayout />;
}

function DesktopLayout() {
  const setPanel = useWorkbench((s) => s.setPanel);
  const panel = useWorkbench((s) => s.panel);
  const sideRef = useRef<PanelImperativeHandle | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const select = (id: SidePanel) => {
    const side = sideRef.current;
    if (id === panel && side && !side.isCollapsed()) {
      side.collapse();
      return;
    }
    setPanel(id);
    if (side?.isCollapsed()) side.expand();
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex flex-col">
        <Rail onSelect={select} collapsed={collapsed} />
      </div>
      <ResizablePanelGroup orientation="horizontal" id="sb-main">
        <ResizablePanel
          id="side"
          panelRef={sideRef}
          defaultSize="22%"
          minSize={220}
          maxSize="40%"
          collapsible
          collapsedSize={0}
          onResize={(size) => setCollapsed(size.asPercentage === 0)}
        >
          <ActivePanel />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="work" minSize="40%">
          <ResizablePanelGroup orientation="vertical" id="sb-work">
            <ResizablePanel id="top" defaultSize="68%" minSize="25%">
              <ResizablePanelGroup orientation="horizontal" id="sb-top">
                <ResizablePanel id="editor" defaultSize="58%" minSize="25%">
                  <CodeEditor />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel id="browser" defaultSize="42%" minSize="20%">
                  <BrowserPanel />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="console" defaultSize="32%" minSize={90} collapsible collapsedSize={0}>
              <ConsolePanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
      <SideToggle collapsed={collapsed} onToggle={() => (collapsed ? sideRef.current?.expand() : sideRef.current?.collapse())} />
    </div>
  );
}

function SideToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Show side panel" : "Hide side panel"}
          className="fixed bottom-2 left-1.5 z-10 grid size-8 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{collapsed ? "Show side panel" : "Hide side panel"}</TooltipContent>
    </Tooltip>
  );
}

type MobileView = "code" | "browser" | "console";

function MobileLayout() {
  const [view, setView] = useState<MobileView>("code");
  const [sheet, setSheet] = useState(false);
  const setPanel = useWorkbench((s) => s.setPanel);
  const panel = useWorkbench((s) => s.panel);
  const phase = useRun((s) => s.phase);
  const label = PANELS.find((p) => p.id === panel)?.label ?? "Panel";

  // Jump to the browser when a run starts, which is what people want to see on a phone.
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (prevPhase.current !== "starting" && phase === "starting") setView("browser");
    prevPhase.current = phase;
  }, [phase]);

  const VIEWS: { id: MobileView; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { id: "code", label: "Code", icon: Code2 },
    { id: "browser", label: "Browser", icon: Monitor },
    { id: "console", label: "Console", icon: SquareTerminal },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        {view === "code" && <CodeEditor />}
        {view === "browser" && <BrowserPanel />}
        {view === "console" && <ConsolePanel />}
      </div>
      <nav aria-label="Views" className="grid shrink-0 grid-cols-4 border-t bg-panel pb-[env(safe-area-inset-bottom)]">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              aria-current={view === v.id ? "page" : undefined}
              className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-xs", view === v.id ? "text-foreground" : "text-muted-foreground")}
            >
              <Icon className="size-5" />
              {v.label}
            </button>
          );
        })}
        <button onClick={() => setSheet(true)} className="flex h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground">
          <FileStack className="size-5" />
          Panels
        </button>
      </nav>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="left" className="w-[min(22rem,92vw)] gap-0 p-0 sm:max-w-none" aria-describedby={undefined} onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetTitle className="sr-only">{label}</SheetTitle>
          <div className="flex h-full min-h-0">
            <Rail onSelect={setPanel} />
            <div className="min-w-0 flex-1 pt-10">
              <ActivePanel />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
