import { MoreHorizontal, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TEMPLATES } from "@/data/templates";
import { NewFileDialog, RenameFileDialog } from "@/features/editor/file-dialogs";
import { useRunControls } from "@/hooks/use-run-controls";
import { cn } from "@/lib/utils";
import { isActive, useRun } from "@/stores/run";
import { useWorkbench } from "@/stores/workbench";
import { PanelHeader } from "./panel-header";

export function FilesPanel() {
  const files = useWorkbench((s) => s.files);
  const activeFile = useWorkbench((s) => s.activeFile);
  const setActiveFile = useWorkbench((s) => s.setActiveFile);
  const deleteFile = useWorkbench((s) => s.deleteFile);
  const addFile = useWorkbench((s) => s.addFile);
  const running = useRun((s) => isActive(s.phase));
  const { start } = useRunControls();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  function addTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id)!;
    let name = `${t.id}.js`;
    for (let i = 2; files.some((f) => f.name === name); i++) name = `${t.id}-${i}.js`;
    addFile(name, t.code);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Files">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="New file" onClick={() => setCreating(true)}>
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New file</TooltipContent>
        </Tooltip>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="py-1">
          {files.map((f) => (
            <li key={f.name} className={cn("group flex items-center pr-1", f.name === activeFile && "bg-accent")}>
              <button
                onClick={() => setActiveFile(f.name)}
                className="min-w-0 flex-1 truncate py-1.5 pl-3 text-left font-mono text-xs focus-visible:underline focus-visible:outline-none"
                aria-current={f.name === activeFile ? "true" : undefined}
              >
                {f.name}
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Run ${f.name}`}
                    disabled={running}
                    onClick={() => start(f.name)}
                    className="lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
                  >
                    <Play />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Run this file</TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label={`More actions for ${f.name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setRenaming(f.name)}>
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" disabled={files.length === 1} onSelect={() => setDeleting(f.name)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>

        <section className="mt-2 border-t px-3 pt-3 pb-4" aria-labelledby="examples-heading">
          <h3 id="examples-heading" className="text-xs font-semibold">Examples</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Adds the example as a new file in this project.</p>
          <ul className="mt-2 grid gap-1">
            {TEMPLATES.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => addTemplate(t.id)}
                  className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span className="block text-xs font-medium">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">{t.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <NewFileDialog open={creating} onOpenChange={setCreating} />
      <RenameFileDialog file={renaming} onOpenChange={(o) => !o && setRenaming(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting}?`}
        description="The file is removed from the project when you save. Earlier versions keep a copy."
        confirmLabel="Delete file"
        onConfirm={() => {
          if (deleting) deleteFile(deleting);
        }}
      />
    </div>
  );
}
