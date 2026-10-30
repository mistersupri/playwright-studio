import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PromptDialog } from "@/components/prompt-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { EnvVar, EnvWorkspace } from "@/lib/types";
import { useWorkbench } from "@/stores/workbench";
import { PanelHeader } from "./panel-header";

const MASK = "••••••••";
type Row = EnvVar & { key: string; revealed?: boolean };

export function VariablesPanel() {
  const qc = useQueryClient();
  const sets = useQuery({ queryKey: ["variables"], queryFn: () => api.get<EnvWorkspace[]>("/variables") });
  const workspaceId = useWorkbench((s) => s.settings.workspaceId);
  const updateSettings = useWorkbench((s) => s.updateSettings);
  const [dialog, setDialog] = useState<"create" | "rename" | "delete" | null>(null);

  const current = useMemo(() => {
    const list = sets.data ?? [];
    return list.find((w) => w.id === workspaceId) ?? list.find((w) => w.isDefault) ?? null;
  }, [sets.data, workspaceId]);

  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => setRows(current?.vars.map((v) => ({ ...v })) ?? []), [current]);
  const dirty = JSON.stringify(rows.map(({ revealed: _r, ...v }) => v)) !== JSON.stringify(current?.vars ?? []);

  const setData = (data: EnvWorkspace[]) => qc.setQueryData(["variables"], data);

  const save = useMutation({
    mutationFn: () =>
      api.put<EnvWorkspace[]>(`/variables/${current!.id}/vars`, {
        vars: rows.filter((r) => r.key.trim()).map(({ id, key, value, isSecret }) => ({ id, key: key.trim(), value, isSecret })),
      }),
    onSuccess: (data) => {
      setData(data);
      toast.success("Variables saved");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Variables">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Variable set actions" disabled={!current}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setDialog("create")}>
              <Plus /> New set
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog("rename")}>
              <Pencil /> Rename set
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={current?.isDefault} onSelect={() => setDialog("delete")}>
              <Trash2 /> Delete set
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PanelHeader>

      {sets.isPending ? (
        <div className="grid gap-2 p-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : sets.isError ? (
        <div className="p-3 text-xs">
          <p className="text-danger">{sets.error.message}</p>
          <Button variant="outline" size="xs" className="mt-2" onClick={() => sets.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="border-b p-3">
            <label className="text-xs text-muted-foreground" htmlFor="var-set">
              Used for runs
            </label>
            <Select value={current?.id} onValueChange={(id) => updateSettings({ workspaceId: id })}>
              <SelectTrigger id="var-set" size="sm" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sets.data.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                    {w.isDefault && <span className="text-muted-foreground">(base)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Read them with <code className="font-mono">process.env.NAME</code>.
              {!current?.isDefault && " Values here override the Default set."}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No variables in this set yet.</p>
            ) : (
              <ul className="grid gap-3">
                {rows.map((row, i) => (
                  <li key={row.id ?? `new-${i}`} className="grid gap-1.5 rounded-md border p-2">
                    <div className="flex items-center gap-1">
                      <Input
                        value={row.key}
                        onChange={(e) => update(i, { key: e.target.value.replace(/\s/g, "_") })}
                        placeholder="NAME"
                        aria-label="Variable name"
                        className="h-7 font-mono text-xs"
                      />
                      <Button variant="ghost" size="icon-xs" aria-label={`Remove ${row.key || "variable"}`} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                        <X />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        value={row.value}
                        type={row.isSecret && !row.revealed ? "password" : "text"}
                        onFocus={() => row.value === MASK && update(i, { value: "" })}
                        onBlur={() => row.value === "" && row.id && current?.vars.find((v) => v.id === row.id)?.value === MASK && update(i, { value: MASK })}
                        onChange={(e) => update(i, { value: e.target.value })}
                        placeholder="value"
                        aria-label={`Value of ${row.key || "variable"}`}
                        className="h-7 font-mono text-xs"
                      />
                      {row.isSecret && row.value !== MASK && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={row.revealed ? "Hide value" : "Show value"}
                          onClick={() => update(i, { revealed: !row.revealed })}
                        >
                          {row.revealed ? <EyeOff /> : <Eye />}
                        </Button>
                      )}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox checked={row.isSecret} onCheckedChange={(v) => update(i, { isSecret: v === true })} />
                      Secret: hidden after saving and redacted from logs
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="outline" size="xs" className="mt-3" onClick={() => setRows((r) => [...r, { key: "", value: "", isSecret: false }])}>
              <Plus /> Add variable
            </Button>
          </div>

          <div className="flex items-center justify-end gap-2 border-t p-2">
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setRows(current?.vars.map((v) => ({ ...v })) ?? [])}>
                Discard
              </Button>
            )}
            <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Spinner />} Save variables
            </Button>
          </div>
        </>
      )}

      <PromptDialog
        open={dialog === "create"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="New variable set"
        description="Use sets for different environments, like staging and production."
        label="Name"
        placeholder="Staging"
        submitLabel="Create set"
        onSubmit={async (name) => {
          const data = await api.post<EnvWorkspace[]>("/variables", { name });
          setData(data);
          const created = data.find((w) => w.name === name && !sets.data?.some((s) => s.id === w.id));
          if (created) updateSettings({ workspaceId: created.id });
        }}
      />
      <PromptDialog
        open={dialog === "rename"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Rename variable set"
        label="Name"
        initialValue={current?.name}
        submitLabel="Rename"
        onSubmit={async (name) => {
          setData(await api.patch<EnvWorkspace[]>(`/variables/${current!.id}`, { name }));
        }}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete "${current?.name}"?`}
        description="Its variables are deleted. Schedules that used this set fall back to Default."
        confirmLabel="Delete set"
        onConfirm={async () => {
          setData(await api.delete<EnvWorkspace[]>(`/variables/${current!.id}`));
          updateSettings({ workspaceId: null });
        }}
      />
    </div>
  );
}
