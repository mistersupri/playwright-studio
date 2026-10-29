import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { ApiToken } from "@/lib/types";
import { useWorkbench } from "@/stores/workbench";
import { TabHeader } from "./tab-header";

export function TokensTab() {
  const qc = useQueryClient();
  const projectId = useWorkbench((s) => s.project?.id);
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => api.get<ApiToken[]>("/tokens") });
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post<{ token: string }>("/tokens", { name }),
    onSuccess: (d) => {
      setCreated(d.token);
      setName("");
      qc.invalidateQueries({ queryKey: ["tokens"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens"] }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const example = `curl -X POST ${location.origin}/api/v1/projects/${projectId ?? "PROJECT_ID"}/runs \\
  -H "Authorization: Bearer ${created ?? "sbt_…"}" \\
  -H "Content-Type: application/json" \\
  -d '{"wait": true}'`;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) create.mutate();
  }

  return (
    <div className="grid gap-5">
      <TabHeader
        title="API tokens"
        description="Let other systems (CI, n8n, a cron job) start runs and read results. A token acts as you, so keep it secret."
      />

      {created && (
        <div className="grid gap-2 rounded-md border border-signal/50 bg-signal/5 p-3" role="status">
          <p className="text-sm font-medium">Copy this token now. It will not be shown again.</p>
          <div className="flex gap-2">
            <Input readOnly value={created} className="h-8 font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="Your new token" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(created);
                toast.success("Token copied");
              }}
            >
              <Copy /> Copy
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="grid flex-1 gap-1">
          <Label htmlFor="token-name" className="text-xs">New token name</Label>
          <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="GitHub Actions" className="h-8" />
        </div>
        <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
          {create.isPending && <Spinner />} Create token
        </Button>
      </form>

      {tokens.isPending ? (
        <Skeleton className="h-12" />
      ) : tokens.isError ? (
        <p className="text-sm text-danger">{tokens.error.message}</p>
      ) : tokens.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tokens yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {tokens.data.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.name}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {t.prefix}… · {t.lastUsedAt ? `used ${formatRelative(t.lastUsedAt)}` : "never used"}
                </span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => revoke.mutate(t.id)} disabled={revoke.isPending}>
                <Trash2 /> Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <section className="grid gap-1.5">
        <h4 className="text-sm font-medium">Run this project from a script</h4>
        <pre className="overflow-x-auto rounded-md border bg-editor p-3 font-mono text-xs leading-5">{example}</pre>
        <p className="text-xs text-muted-foreground">
          With <code className="font-mono">"wait": true</code> the call returns when the run ends, with its status, log and files. The full reference is in docs/API.md.
        </p>
      </section>
    </div>
  );
}
