import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { PackageInfo } from "@/lib/types";
import { useWorkbench } from "@/stores/workbench";
import { PanelHeader } from "./panel-header";

const BUILTINS = new Set(["fs", "path", "os", "crypto", "http", "https", "url", "util", "events", "stream", "zlib", "child_process", "readline", "assert", "buffer", "querystring", "net", "dns", "timers"]);

/** Bare module names the project's files require or import. */
function requiredPackages(code: string): string[] {
  const found = new Set<string>();
  const re = /(?:require\(\s*|from\s+|import\(\s*|import\s+)['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(re)) {
    const spec = m[1];
    if (/^[./]/.test(spec) || spec.startsWith("node:")) continue;
    const parts = spec.split("/");
    const name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
    if (!BUILTINS.has(name)) found.add(name);
  }
  return [...found];
}

export function PackagesPanel() {
  const qc = useQueryClient();
  const files = useWorkbench((s) => s.files);
  const packages = useQuery({ queryKey: ["packages"], queryFn: () => api.get<PackageInfo[]>("/system/packages") });
  const [name, setName] = useState("");

  const install = useMutation({
    mutationFn: (pkg: string) => api.post<PackageInfo[]>("/system/packages", { name: pkg }),
    onSuccess: (data, pkg) => {
      qc.setQueryData(["packages"], data);
      setName("");
      toast.success(`Installed ${pkg}`);
    },
    onError: (err) => toast.error("Install failed", { description: errorMessage(err) }),
  });

  const missing = useMemo(() => {
    const have = new Set((packages.data ?? []).map((p) => p.name));
    return requiredPackages(files.map((f) => f.code).join("\n")).filter((n) => !have.has(n));
  }, [files, packages.data]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) install.mutate(name.trim());
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Packages" />
      <form onSubmit={submit} className="grid gap-1.5 border-b p-3">
        <label htmlFor="pkg-name" className="text-xs text-muted-foreground">Install from npm</label>
        <div className="flex gap-1">
          <Input id="pkg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="dayjs or lodash@4" className="h-8 font-mono text-xs" />
          <Button type="submit" size="sm" disabled={!name.trim() || install.isPending}>
            {install.isPending && <Spinner />} Install
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Packages are shared by every script on this server. A missing package is also installed the first time a script requires it.</p>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {missing.length > 0 && (
          <section className="mb-4">
            <h3 className="text-xs font-semibold">Used by this project, not installed</h3>
            <ul className="mt-1.5 grid gap-1">
              {missing.map((m) => (
                <li key={m} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs">{m}</span>
                  <Button size="xs" variant="outline" disabled={install.isPending} onClick={() => install.mutate(m)}>Install</Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <h3 className="text-xs font-semibold">Available</h3>
        {packages.isPending ? (
          <div className="mt-2 grid gap-1.5"><Skeleton className="h-5" /><Skeleton className="h-5" /><Skeleton className="h-5" /></div>
        ) : packages.isError ? (
          <p className="mt-2 text-xs text-danger">{packages.error.message}</p>
        ) : (
          <ul className="mt-1.5 grid gap-1">
            {packages.data.map((p) => (
              <li key={p.name} className="flex items-baseline justify-between gap-2 font-mono text-xs">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-muted-foreground">{p.source === "bundled" ? `built in ${p.version}` : p.version}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
