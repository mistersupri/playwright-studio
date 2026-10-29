import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useMe } from "@/hooks/use-auth";
import { api, errorMessage } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { TabHeader } from "./tab-header";

export interface Usage {
  usedBytes: number;
  quotaBytes: number;
  retentionDays: number;
}

export function UsageBar({ used, quota }: { used: number; quota: number }) {
  const pct = quota ? Math.min(100, (used / quota) * 100) : 0;
  return (
    <div className="grid gap-1">
      {quota > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={quota} aria-valuenow={used} aria-label="Storage used">
          <div className={pct > 90 ? "h-full bg-danger" : "h-full bg-foreground/60"} style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="text-xs text-muted-foreground tabular">
        {formatBytes(used)} {quota ? `of ${formatBytes(quota)}` : "used, no limit set"}
      </p>
    </div>
  );
}

export function AccountTab() {
  const me = useMe();
  const usage = useQuery({ queryKey: ["usage"], queryFn: () => api.get<Usage>("/account/usage") });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => api.post("/auth/password", { current: current || undefined, next }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast.success("Password changed", { description: "Other browsers and devices were signed out." });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    change.mutate();
  }

  return (
    <div className="grid gap-6">
      <TabHeader title="Account" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{me.data?.name}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd>{me.data?.email}</dd>
        <dt className="text-muted-foreground">Role</dt>
        <dd>{me.data?.role === "admin" ? "Administrator" : "Member"}</dd>
      </dl>

      <section className="grid gap-2">
        <h4 className="text-sm font-medium">Storage</h4>
        {usage.data ? (
          <>
            <UsageBar used={usage.data.usedBytes} quota={usage.data.quotaBytes} />
            <p className="text-xs text-muted-foreground">
              {usage.data.retentionDays
                ? `Run history and run outputs older than ${usage.data.retentionDays} days are deleted automatically. Uploaded input files are kept.`
                : "Run history and outputs are kept until you delete them."}
            </p>
          </>
        ) : usage.isError ? (
          <p className="text-xs text-danger">{usage.error.message}</p>
        ) : (
          <Spinner className="text-muted-foreground" />
        )}
      </section>

      <form onSubmit={submit} className="grid max-w-sm gap-3">
        <h4 className="text-sm font-medium">Change password</h4>
        <div className="grid gap-1">
          <Label htmlFor="pw-current" className="text-xs">Current password</Label>
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <p className="text-xs text-muted-foreground">Leave empty if you only ever signed in with Google.</p>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="pw-next" className="text-xs">New password</Label>
          <Input id="pw-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <div>
          <Button type="submit" size="sm" disabled={change.isPending}>
            {change.isPending && <Spinner />} Change password
          </Button>
        </div>
      </form>
    </div>
  );
}
