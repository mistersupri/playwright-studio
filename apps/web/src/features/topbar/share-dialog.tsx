import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useIsOwner } from "@/hooks/use-project";
import { api, errorMessage } from "@/lib/api";
import type { Project, ProjectMember } from "@/lib/types";
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
            People need an account on this server. Members can open the project even while it is private, and anyone viewing it at the same time sees edits live.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-3 rounded-md border p-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Public on this server</span>
            <span className="block text-xs text-muted-foreground">
              {project?.isPrivate
                ? "Only you and the people below can open it."
                : "Anyone signed in can open, run and copy it. Only you and editors below can save changes. Variables and files stay private."}
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
        {project?.isPrivate && <p className="text-xs text-muted-foreground">Make the project public to share the link with everyone, or add people below.</p>}
        <Members />
      </DialogContent>
    </Dialog>
  );
}

const ROLE_LABEL = { owner: "Owner", editor: "Can edit", viewer: "Can view and run" } as const;

function Members() {
  const project = useWorkbench((s) => s.project);
  const isOwner = useIsOwner();
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const members = useQuery({
    queryKey: ["members", project?.id],
    queryFn: () => api.get<ProjectMember[]>(`/projects/${project!.id}/members`),
    enabled: Boolean(project),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => api.post<ProjectMember[]>(`/projects/${project!.id}/members`, { email, role }),
    onSuccess: (list) => {
      qc.setQueryData(["members", project?.id], list);
      setEmail("");
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.delete(`/projects/${project!.id}/members/${userId}`),
    onSuccess: (_d, userId) => {
      if (userId === me.data?.id) {
        toast.success("You left the project");
        qc.invalidateQueries({ queryKey: ["projects"] });
        navigate("/", { replace: true });
        return;
      }
      qc.invalidateQueries({ queryKey: ["members", project?.id] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (email.trim()) add.mutate();
  }

  return (
    <section className="grid gap-2 border-t pt-4" aria-labelledby="members-heading">
      <h3 id="members-heading" className="text-sm font-medium">People with access</h3>
      {members.isPending ? (
        <p className="text-xs text-muted-foreground">Loading</p>
      ) : members.isError ? (
        <p className="text-xs text-danger">{members.error.message}</p>
      ) : (
        <ul className="grid gap-1">
          {members.data.map((m) => (
            <li key={m.userId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{m.name}{m.userId === me.data?.id && " (you)"}</span>
                <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABEL[m.role]}</span>
              {m.role !== "owner" && (isOwner || m.userId === me.data?.id) && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={m.userId === me.data?.id ? "Leave project" : `Remove ${m.name}`}
                  onClick={() => remove.mutate(m.userId)}
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isOwner && (
        <form onSubmit={submit} className="mt-1 grid gap-1.5">
          <div className="flex gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              aria-label="Email of the person to add"
              className="h-8"
            />
            <Select value={role} onValueChange={(v) => setRole(v as "editor" | "viewer")}>
              <SelectTrigger size="sm" className="w-44 shrink-0" aria-label="Access"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Can edit</SelectItem>
                <SelectItem value="viewer">Can view and run</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={!email.trim() || add.isPending}>Add</Button>
          </div>
          {error && <p className="text-xs text-danger" role="alert">{error}</p>}
        </form>
      )}
    </section>
  );
}
