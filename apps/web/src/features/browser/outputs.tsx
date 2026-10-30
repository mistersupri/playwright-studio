import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Download, File, FileSpreadsheet, FileText, Folder, FolderInput, Image, MoreHorizontal, Trash2, Upload, Video } from "lucide-react";
import { type DragEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PromptDialog } from "@/components/prompt-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCanEdit } from "@/hooks/use-project";
import { api, errorMessage } from "@/lib/api";
import { traceViewerUrl } from "@/lib/artifacts";
import { formatBytes, formatRelative } from "@/lib/format";
import type { Artifact, ArtifactKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkbench } from "@/stores/workbench";
import { ArtifactViewer } from "./artifact-viewer";

const FILTERS: { id: "all" | ArtifactKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "screenshot", label: "Images" },
  { id: "pdf", label: "PDF" },
  { id: "excel", label: "Sheets" },
  { id: "video", label: "Video" },
  { id: "trace", label: "Traces" },
  { id: "file", label: "Other" },
  { id: "upload", label: "Inputs" },
];

const ICONS: Record<ArtifactKind, typeof File> = {
  screenshot: Image,
  pdf: FileText,
  excel: FileSpreadsheet,
  video: Video,
  trace: Activity,
  file: File,
  upload: Upload,
};

export function useArtifacts(projectId: string | undefined) {
  return useQuery({
    queryKey: ["artifacts", projectId],
    queryFn: () => api.get<Artifact[]>(`/artifacts?projectId=${encodeURIComponent(projectId!)}`),
    enabled: Boolean(projectId),
  });
}

export function Outputs() {
  const projectId = useWorkbench((s) => s.project?.id);
  const isOwner = useCanEdit();
  const qc = useQueryClient();
  const artifacts = useArtifacts(projectId);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [viewing, setViewing] = useState<Artifact | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [folder, setFolder] = useState<string>("all");
  const [moving, setMoving] = useState<Artifact | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["artifacts", projectId] });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        await api.post(`/artifacts/upload?projectId=${encodeURIComponent(projectId!)}`, form);
      }
    },
    onSuccess: (_d, files) => {
      refresh();
      toast.success(files.length === 1 ? `Uploaded ${files[0].name}` : `Uploaded ${files.length} files`, {
        description: "Read it in your script from uploads/<name>.",
      });
    },
    onError: (err) => toast.error("Upload failed", { description: errorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (a: Artifact) => api.delete(`/artifacts/${a.id}`),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });

  const move = useMutation({
    mutationFn: ({ a, folder }: { a: Artifact; folder: string | null }) => api.patch(`/artifacts/${a.id}`, { folder }),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });

  const folders = useMemo(
    () => [...new Set((artifacts.data ?? []).map((a) => a.folder).filter((f): f is string => Boolean(f)))].sort(),
    [artifacts.data],
  );
  const list = (artifacts.data ?? []).filter(
    (a) =>
      (filter === "all" || a.kind === filter) &&
      (folder === "all" || (folder === "none" ? !a.folder : a.folder === folder)),
  );
  const outputsCount = (artifacts.data ?? []).filter((a) => a.kind !== "upload").length;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files];
    if (files.length && isOwner) upload.mutate(files);
  };

  return (
    <div
      className={cn("relative flex h-full min-h-0 flex-col", dragging && "outline-2 -outline-offset-4 outline-signal outline-dashed")}
      onDragOver={(e) => {
        if (!isOwner) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="flex shrink-0 items-center border-b px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "shrink-0 rounded px-2 py-1 text-xs transition-colors duration-150",
              filter === f.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
          {folders.length > 0 && (
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger size="sm" className="h-7 max-w-36 border-none bg-transparent px-2 text-xs shadow-none" aria-label="Folder">
                <Folder className="size-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">All folders</SelectItem>
                <SelectItem value="none">No folder</SelectItem>
                {folders.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {isOwner && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-xs" variant="ghost" aria-label="Upload input file" onClick={() => fileInput.current?.click()} disabled={upload.isPending || !projectId}>
                  {upload.isPending ? <Spinner /> : <Upload />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Upload an input file</TooltipContent>
            </Tooltip>
          )}
          {outputsCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-xs" variant="ghost" aria-label="Clear outputs" onClick={() => setConfirmClear(true)}>
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear outputs</TooltipContent>
            </Tooltip>
          )}
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length) upload.mutate(files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {artifacts.isPending ? (
          <div className="grid gap-2 p-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : artifacts.isError ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyTitle>Could not load files</EmptyTitle>
              <EmptyDescription>{artifacts.error.message}</EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" size="sm" onClick={() => artifacts.refetch()}>
              Try again
            </Button>
          </Empty>
        ) : list.length === 0 ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyTitle>{filter === "upload" ? "No input files" : "Nothing here yet"}</EmptyTitle>
              <EmptyDescription>
                {filter === "upload"
                  ? "Drop a file here or upload one. Scripts read it from uploads/<name>."
                  : "Files your script writes with a relative path, like page.screenshot({ path: \"shot.png\" }), show up here."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {list.map((a) => {
              const Icon = ICONS[a.kind];
              return (
                <li key={a.id} className="group flex items-center gap-3 px-3 py-2 hover:bg-accent/50">
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none" onClick={() => setViewing(a)}>
                    {a.kind === "screenshot" ? (
                      <img src={a.url} alt="" loading="lazy" className="size-9 shrink-0 rounded border bg-muted object-cover" />
                    ) : (
                      <span className="grid size-9 shrink-0 place-items-center rounded border bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs group-focus-within:underline">
                        {a.kind === "upload" ? `uploads/${a.name}` : a.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground tabular">
                        {a.folder && <span className="mr-1 rounded bg-muted px-1 py-px">{a.folder}</span>}
                        {formatBytes(a.size)} · {formatRelative(a.createdAt)}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center opacity-100 transition-opacity duration-150 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a href={`${a.url}?download=1`} download={a.name} aria-label={`Download ${a.name}`}>
                        <Download />
                      </a>
                    </Button>
                    {a.kind === "trace" && (
                      <Button variant="ghost" size="icon-sm" asChild>
                        <a href={traceViewerUrl(a)} target="_blank" rel="noreferrer" aria-label={`Open ${a.name} in the trace viewer`}>
                          <Activity />
                        </a>
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${a.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Move to folder</DropdownMenuLabel>
                        {folders.filter((f) => f !== a.folder).map((f) => (
                          <DropdownMenuItem key={f} onSelect={() => move.mutate({ a, folder: f })}>
                            <Folder /> {f}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem onSelect={() => setMoving(a)}>
                          <FolderInput /> New folder…
                        </DropdownMenuItem>
                        {a.folder && (
                          <DropdownMenuItem onSelect={() => move.mutate({ a, folder: null })}>Remove from folder</DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => remove.mutate(a)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ArtifactViewer artifact={viewing} gallery={list} compareWith={artifacts.data} onOpenChange={(o) => !o && setViewing(null)} onNavigate={setViewing} />
      <PromptDialog
        open={moving !== null}
        onOpenChange={(o) => !o && setMoving(null)}
        title="New folder"
        description={moving ? `Moves ${moving.name} into it.` : undefined}
        label="Folder name"
        placeholder="Reports"
        submitLabel="Move"
        validate={(v) => (/^[\w .-]{1,60}$/.test(v) ? null : "Use letters, numbers, spaces, dots and dashes.")}
        onSubmit={async (name) => {
          if (moving) await move.mutateAsync({ a: moving, folder: name });
        }}
      />
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all outputs?"
        description={`This deletes ${outputsCount} file${outputsCount === 1 ? "" : "s"} produced by runs of this project. Input files you uploaded stay.`}
        confirmLabel="Delete outputs"
        onConfirm={async () => {
          await api.post("/artifacts/clear", { projectId, scope: "outputs" });
          refresh();
        }}
      />
    </div>
  );
}
