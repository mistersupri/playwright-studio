import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useIsOwner } from "@/hooks/use-project";
import { api, errorMessage } from "@/lib/api";
import type { Project } from "@/lib/types";
import { useWorkbench } from "@/stores/workbench";

export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const project = useWorkbench((s) => s.project);
  const markSaved = useWorkbench((s) => s.markSaved);
  const isOwner = useIsOwner();
  const qc = useQueryClient();
  const link = project ? `${location.origin}/?project=${project.id}` : "";

  const privacy = useMutation({
    mutationFn: (isPrivate: boolean) => api.patch<Project>(`/projects/${project!.id}`, { isPrivate }),
    onSuccess: (p) => {
      // Only the flag changed on the server; keep unsaved edits in the editor.
      markSaved({ ...useWorkbench.getState().project!, isPrivate: p.isPrivate, updatedAt: p.updatedAt });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share “{project?.name}”</DialogTitle>
          <DialogDescription>
            People need an account on this server to open the link. Anyone viewing a project at the same time sees edits live.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-3 rounded-md border p-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Public on this server</span>
            <span className="block text-xs text-muted-foreground">
              {project?.isPrivate
                ? "Only you can open it."
                : "Anyone signed in can open, run and copy it. Only you can save changes. Variables and files stay private."}
            </span>
          </span>
          <Switch
            checked={!project?.isPrivate}
            disabled={!isOwner || privacy.isPending}
            onCheckedChange={(pub) => privacy.mutate(!pub)}
            aria-label="Public on this server"
          />
        </label>
        <div className="flex gap-2">
          <Input readOnly value={link} aria-label="Project link" className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button
            variant="outline"
            disabled={project?.isPrivate}
            onClick={() => {
              navigator.clipboard.writeText(link);
              toast.success("Link copied");
            }}
          >
            <Copy /> Copy
          </Button>
        </div>
        {project?.isPrivate && <p className="text-xs text-muted-foreground">Make the project public to share the link.</p>}
      </DialogContent>
    </Dialog>
  );
}
