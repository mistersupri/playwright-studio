import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import type { Project, ProjectFile } from "@/lib/types";
import { useWorkbench } from "@/stores/workbench";
import { useMe } from "./use-auth";

export function useIsOwner() {
  const me = useMe();
  const ownerId = useWorkbench((s) => s.project?.ownerId);
  return Boolean(me.data && ownerId === me.data.id);
}

/** Owner or invited editor: may save, upload inputs and schedule. */
export function useCanEdit() {
  return useWorkbench((s) => s.project?.myRole === "owner" || s.project?.myRole === "editor");
}

export function useSaveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      const { project, name, files } = useWorkbench.getState();
      if (!project) throw new Error("No project is open.");
      return api.put<Project>(`/projects/${project.id}`, { name: name.trim() || "Untitled", files });
    },
    onSuccess: (p) => {
      const s = useWorkbench.getState();
      // Keep edits made while the request was in flight.
      s.markSaved(p);
      qc.setQueryData(["project", p.id], p);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["versions", p.id] });
    },
    onError: (err) => toast.error("Could not save", { description: errorMessage(err) }),
  });
}

export function useOpenProject() {
  const navigate = useNavigate();
  return (id: string) => navigate(`/?project=${encodeURIComponent(id)}`);
}

export function useCreateProject() {
  const qc = useQueryClient();
  const open = useOpenProject();
  return useMutation({
    mutationFn: (input: { name: string; files?: ProjectFile[] }) => api.post<Project>("/projects", input),
    onSuccess: (p) => {
      qc.setQueryData(["project", p.id], p);
      qc.invalidateQueries({ queryKey: ["projects"] });
      open(p.id);
    },
    onError: (err) => toast.error("Could not create the project", { description: errorMessage(err) }),
  });
}

export function useDuplicateProject() {
  const qc = useQueryClient();
  const open = useOpenProject();
  return useMutation({
    mutationFn: (id: string) => api.post<Project>(`/projects/${id}/duplicate`),
    onSuccess: (p) => {
      qc.setQueryData(["project", p.id], p);
      qc.invalidateQueries({ queryKey: ["projects"] });
      open(p.id);
      toast.success(`Copied to "${p.name}"`);
    },
    onError: (err) => toast.error("Could not copy the project", { description: errorMessage(err) }),
  });
}
