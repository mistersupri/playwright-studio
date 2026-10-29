import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useMe } from "@/hooks/use-auth";
import { api, errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { UsageBar } from "./account-tab";
import { TabHeader } from "./tab-header";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  disabledAt: string | null;
  createdAt: string;
  hasPassword: boolean;
  usedBytes: number;
  projectCount: number;
}

export function AdminTab() {
  const qc = useQueryClient();
  const me = useMe();
  const data = useQuery({ queryKey: ["admin-users"], queryFn: () => api.get<{ users: AdminUser[]; quotaBytes: number }>("/admin/users") });
  const [temp, setTemp] = useState<{ user: AdminUser; password: string } | null>(null);

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: AdminUser["role"]; disabled?: boolean }) =>
      api.patch<{ users: AdminUser[]; quotaBytes: number }>(`/admin/users/${id}`, body),
    onSuccess: (d) => qc.setQueryData(["admin-users"], d),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const reset = useMutation({
    mutationFn: (u: AdminUser) => api.post<{ password: string }>(`/admin/users/${u.id}/password`).then((r) => ({ user: u, password: r.password })),
    onSuccess: setTemp,
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="grid gap-4">
      <TabHeader title="Users" description="Everyone with an account on this server. Disabling someone signs them out at once and keeps their projects." />
      {data.isPending ? (
        <div className="grid gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : data.isError ? (
        <p className="text-sm text-danger">{data.error.message}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {data.data.users.map((u) => {
            const self = u.id === me.data?.id;
            return (
              <li key={u.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium">
                    <span className="truncate">{u.name}</span>
                    {self && <span className="shrink-0 font-normal text-muted-foreground">(you)</span>}
                    {u.disabledAt && <span className="shrink-0 text-xs font-normal text-danger">Disabled</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email} · joined {formatRelative(u.createdAt)} · {u.projectCount} project{u.projectCount === 1 ? "" : "s"}
                  </p>
                  <div className="mt-1.5 max-w-60">
                    <UsageBar used={u.usedBytes} quota={data.data.quotaBytes} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={u.role} onValueChange={(role) => update.mutate({ id: u.id, role: role as AdminUser["role"] })} disabled={self}>
                    <SelectTrigger size="sm" className="w-28" aria-label={`Role of ${u.name}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      checked={!u.disabledAt}
                      disabled={self}
                      onCheckedChange={(on) => update.mutate({ id: u.id, disabled: !on })}
                      aria-label={`${u.name} can sign in`}
                    />
                    Active
                  </label>
                  <Button size="sm" variant="ghost" onClick={() => reset.mutate(u)} disabled={reset.isPending}>
                    <KeyRound /> Temporary password
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={temp !== null} onOpenChange={(o) => !o && setTemp(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Temporary password for {temp?.user.name}</DialogTitle>
            <DialogDescription>
              Pass it on privately. They are signed out everywhere and should choose a new password in Settings after signing in.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={temp?.password ?? ""} className="font-mono" aria-label="Temporary password" onFocus={(e) => e.target.select()} />
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(temp?.password ?? "");
                toast.success("Password copied");
              }}
            >
              <Copy /> Copy
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setTemp(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
