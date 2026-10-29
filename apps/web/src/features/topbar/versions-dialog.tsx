import { DiffEditor } from "@monaco-editor/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { languageFor } from "@/lib/monaco";
import { useTheme } from "@/lib/theme";
import type { ProjectVersion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkbench } from "@/stores/workbench";

export function VersionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const projectId = useWorkbench((s) => s.project?.id);
  const files = useWorkbench((s) => s.files);
  const replaceFiles = useWorkbench((s) => s.replaceFiles);
  const theme = useTheme((s) => s.theme);
  const versions = useQuery({
    queryKey: ["versions", projectId],
    queryFn: () => api.get<ProjectVersion[]>(`/projects/${projectId}/versions`),
    enabled: open && Boolean(projectId),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<string>("");

  const version = versions.data?.find((v) => v.id === selected) ?? versions.data?.[0];
  useEffect(() => {
    if (version && !version.files.some((f) => f.name === file)) setFile(version.files[0]?.name ?? "");
  }, [version, file]);

  const names = version ? [...new Set([...version.files.map((f) => f.name), ...files.map((f) => f.name)])] : [];
  const before = version?.files.find((f) => f.name === file)?.code ?? "";
  const after = files.find((f) => f.name === file)?.code ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85dvh] w-[min(1200px,calc(100vw-2rem))] max-w-none flex-col gap-3 p-4 sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Versions</DialogTitle>
          <DialogDescription>Each save keeps a version (the last 20). Compare one with your editor, then restore it if you need it back.</DialogDescription>
        </DialogHeader>
        {versions.isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading versions</div>
        ) : versions.isError ? (
          <p className="text-sm text-danger">{versions.error.message}</p>
        ) : versions.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No versions yet. Save the project to create one.</p>
        ) : (
          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[14rem_1fr]">
            <ul className="max-h-40 overflow-y-auto rounded-md border md:max-h-none">
              {versions.data.map((v, i) => (
                <li key={v.id}>
                  <button
                    onClick={() => setSelected(v.id)}
                    className={cn("w-full px-3 py-2 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none", version?.id === v.id && "bg-accent")}
                  >
                    <span className="block font-medium">{i === 0 ? "Latest save" : formatRelative(v.createdAt)}</span>
                    <span className="block text-muted-foreground tabular">{new Date(v.createdAt).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex min-h-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {names.map((n) => (
                  <button
                    key={n}
                    onClick={() => setFile(n)}
                    className={cn("rounded px-2 py-1 font-mono text-xs", n === file ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    {n}
                  </button>
                ))}
                <span className="ml-auto text-xs text-muted-foreground">Left: version · Right: editor</span>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
                <DiffEditor
                  original={before}
                  modified={after}
                  originalModelPath={`version://${version?.id}/${file}`}
                  modifiedModelPath={`current://${file}`}
                  keepCurrentOriginalModel
                  keepCurrentModifiedModel
                  language={languageFor(file)}
                  theme={theme === "dark" ? "sb-dark" : "sb-light"}
                  options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, automaticLayout: true }}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    if (!version) return;
                    replaceFiles(version.files);
                    onOpenChange(false);
                    toast.success("Version restored in the editor", { description: "Save to keep it." });
                  }}
                >
                  Restore this version
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
