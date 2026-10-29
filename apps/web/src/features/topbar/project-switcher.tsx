import { useQuery } from "@tanstack/react-query";
import { Lock, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { PromptDialog } from "@/components/prompt-dialog";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { TEMPLATES } from "@/data/templates";
import { useCreateProject, useOpenProject } from "@/hooks/use-project";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { ProjectSummary } from "@/lib/types";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<{ mine: ProjectSummary[]; shared: ProjectSummary[] }>("/projects"),
  });
}

export function ProjectSwitcher({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const projects = useProjects();
  const openProject = useOpenProject();
  const create = useCreateProject();
  const [naming, setNaming] = useState<{ templateId?: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = (id: string) => {
    onOpenChange(false);
    openProject(id);
  };

  return (
    <>
      <CommandDialog open={open} onOpenChange={onOpenChange} title="Open a project" description="Search your projects and projects others made public.">
        <CommandInput placeholder="Find a project" />
        <CommandList>
          <CommandEmpty>{projects.isPending ? "Loading projects" : projects.isError ? projects.error.message : "No project matches."}</CommandEmpty>
          <CommandGroup heading="Create">
            <CommandItem onSelect={() => { onOpenChange(false); setNaming({}); }}>
              <Plus /> New empty project
            </CommandItem>
            {TEMPLATES.map((t) => (
              <CommandItem key={t.id} value={`template ${t.name}`} onSelect={() => { onOpenChange(false); setNaming({ templateId: t.id }); }}>
                <Plus className="opacity-0" /> New from “{t.name}”
              </CommandItem>
            ))}
          </CommandGroup>
          {projects.data && projects.data.mine.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Your projects">
                {projects.data.mine.map((p) => (
                  <CommandItem key={p.id} value={`${p.name} ${p.id}`} onSelect={() => go(p.id)}>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.isPrivate && <Lock className="text-muted-foreground" aria-label="Private" />}
                    <span className="text-xs text-muted-foreground tabular">{formatRelative(p.updatedAt)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {projects.data && projects.data.shared.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Public on this server">
                {projects.data.shared.map((p) => (
                  <CommandItem key={p.id} value={`${p.name} ${p.ownerName} ${p.id}`} onSelect={() => go(p.id)}>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.ownerName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
      <PromptDialog
        open={naming !== null}
        onOpenChange={(o) => !o && setNaming(null)}
        title="New project"
        label="Project name"
        initialValue={naming?.templateId ? TEMPLATES.find((t) => t.id === naming.templateId)?.name : ""}
        placeholder="Price tracker"
        submitLabel="Create project"
        onSubmit={async (name) => {
          const t = TEMPLATES.find((x) => x.id === naming?.templateId);
          await create.mutateAsync({ name, files: t ? [{ name: "main.js", code: t.code }] : undefined });
        }}
      />
    </>
  );
}
