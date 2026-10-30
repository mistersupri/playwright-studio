import { Ban, Copy, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatTime } from "@/lib/format";
import type { LogLevel, LogLine, LogSource, NetworkEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRun } from "@/stores/run";

const LEVEL_CLASS: Record<LogLevel, string> = {
  log: "text-foreground",
  info: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  error: "text-danger",
};

const SOURCE_LABEL: Record<LogSource, string> = { script: "script", browser: "page", system: "runner" };

export function ConsolePanel() {
  const [tab, setTab] = useState("output");
  const networkCount = useRun((s) => s.network.length);
  const cookieCount = useRun((s) => s.cookies.length);
  const errorCount = useRun((s) => s.logs.filter((l) => l.level === "error").length);

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col gap-0 bg-panel">
      <div className="flex h-9 shrink-0 items-center border-b px-1.5">
        <TabsList variant="line" className="h-9 gap-1">
          <TabsTrigger value="output" className="px-2 text-xs">
            Console
            {errorCount > 0 && <span className="font-mono text-[11px] text-danger tabular">{errorCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="network" className="px-2 text-xs">
            Network
            {networkCount > 0 && <span className="font-mono text-[11px] text-muted-foreground tabular">{networkCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="cookies" className="px-2 text-xs">
            Cookies
            {cookieCount > 0 && <span className="font-mono text-[11px] text-muted-foreground tabular">{cookieCount}</span>}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="output" className="min-h-0 flex-1">
        <LogView />
      </TabsContent>
      <TabsContent value="network" className="min-h-0 flex-1">
        <NetworkView />
      </TabsContent>
      <TabsContent value="cookies" className="min-h-0 flex-1">
        <CookieView />
      </TabsContent>
    </Tabs>
  );
}

/** Keeps a list pinned to the bottom unless the reader scrolled up. */
function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [dep]);
  const onScroll = () => {
    const el = ref.current;
    if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };
  return { ref, onScroll };
}

type LevelFilter = "all" | "warning" | "error";

function LogView() {
  const logs = useRun((s) => s.logs);
  const clear = useRun((s) => s.clearLogs);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [sources, setSources] = useState<Record<LogSource, boolean>>({ script: true, browser: true, system: true });

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return logs.filter(
      (l) =>
        sources[l.source] &&
        (level === "all" || (level === "error" ? l.level === "error" : l.level === "error" || l.level === "warning")) &&
        (!q || l.message.toLowerCase().includes(q)),
    );
  }, [logs, query, level, sources]);

  const { ref, onScroll } = useStickToBottom(visible.length);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-2 py-1.5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter output"
          aria-label="Filter output"
          className="h-7 w-44 text-xs"
        />
        <div className="flex items-center" role="group" aria-label="Level">
          {(["all", "warning", "error"] as const).map((l) => (
            <button
              key={l}
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
              className={cn(
                "rounded px-2 py-1 text-xs",
                level === l ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l === "all" ? "All" : l === "warning" ? "Warnings" : "Errors"}
            </button>
          ))}
        </div>
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <div className="flex items-center" role="group" aria-label="Sources">
          {(Object.keys(SOURCE_LABEL) as LogSource[]).map((s) => (
            <button
              key={s}
              aria-pressed={sources[s]}
              onClick={() => setSources((prev) => ({ ...prev, [s]: !prev[s] }))}
              className={cn(
                "rounded px-2 py-1 font-mono text-xs",
                sources[s] ? "text-foreground" : "text-muted-foreground line-through",
              )}
            >
              {SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Copy output"
                disabled={visible.length === 0}
                onClick={() => {
                  navigator.clipboard.writeText(visible.map((l) => `${formatTime(l.at)} [${SOURCE_LABEL[l.source]}] ${l.message}`).join("\n"));
                  toast.success("Output copied");
                }}
              >
                <Copy />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy output</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Clear output" onClick={clear} disabled={logs.length === 0}>
                <Ban />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear output</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div ref={ref} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto py-1 font-mono text-xs leading-5" role="log" aria-live="polite">
        {visible.length === 0 ? (
          <p className="px-3 py-2 font-sans text-muted-foreground">
            {logs.length === 0 ? "Output from console.log, the page and the runner appears here." : "No lines match the filter."}
          </p>
        ) : (
          visible.map((l, i) => <LogRow key={i} line={l} />)
        )}
      </div>
    </div>
  );
}

function LogRow({ line }: { line: LogLine }) {
  return (
    <div className={cn("flex gap-3 px-3 hover:bg-accent/40", line.level === "error" && "bg-danger/5")}>
      <span className="shrink-0 text-muted-foreground tabular select-none">{formatTime(line.at)}</span>
      <span className="w-12 shrink-0 text-muted-foreground select-none">{SOURCE_LABEL[line.source]}</span>
      <span className={cn("min-w-0 flex-1 break-words whitespace-pre-wrap", LEVEL_CLASS[line.level])}>{line.message}</span>
    </div>
  );
}

const TYPES = ["all", "document", "xhr", "fetch", "script", "stylesheet", "image", "font"] as const;

function statusClass(n: NetworkEvent) {
  if (n.phase === "request") return "text-muted-foreground";
  if (!n.status || n.status >= 400) return "text-danger";
  if (n.status >= 300) return "text-warning";
  return "text-success";
}

function NetworkView() {
  const network = useRun((s) => s.network);
  const clear = useRun((s) => s.clearNetwork);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return network.filter(
      (n) =>
        (type === "all" || n.resourceType === type || (type === "xhr" && n.resourceType === "fetch")) &&
        (!q || n.url.toLowerCase().includes(q)),
    );
  }, [network, query, type]);
  const detail = network.find((n) => n.id === selected) ?? null;
  const { ref, onScroll } = useStickToBottom(visible.length);

  useEffect(() => {
    if (selected && !network.some((n) => n.id === selected)) setSelected(null);
  }, [network, selected]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-2 py-1.5">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter URLs" aria-label="Filter URLs" className="h-7 w-44 text-xs" />
        <div className="flex items-center overflow-x-auto" role="group" aria-label="Resource type">
          {TYPES.map((t) => (
            <button
              key={t}
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={cn("shrink-0 rounded px-2 py-1 text-xs", type === t ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {t === "all" ? "All" : t === "xhr" ? "Fetch/XHR" : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Clear requests" onClick={clear} disabled={network.length === 0}>
          <Ban />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div ref={ref} onScroll={onScroll} className="min-h-0 min-w-0 flex-1 overflow-y-auto font-mono text-xs">
          {visible.length === 0 ? (
            <p className="px-3 py-2 font-sans text-muted-foreground">
              {network.length === 0 ? "Requests the page makes during a run are listed here." : "No requests match the filter."}
            </p>
          ) : (
            <table className="w-full table-fixed">
              <tbody>
                {visible.map((n) => (
                  <tr
                    key={n.id}
                    onClick={() => setSelected(n.id === selected ? null : n.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelected(n.id))}
                    tabIndex={0}
                    aria-selected={n.id === selected}
                    className={cn("cursor-pointer border-b border-border/60 hover:bg-accent/40 focus-visible:bg-accent focus-visible:outline-none", n.id === selected && "bg-accent")}
                  >
                    <td className="w-14 px-3 py-1 text-muted-foreground">{n.method}</td>
                    <td className={cn("w-12 py-1 tabular", statusClass(n))}>{n.phase === "request" ? "…" : n.status || "ERR"}</td>
                    <td className="truncate py-1 pr-2" title={n.url}>{n.url}</td>
                    <td className="hidden w-20 py-1 text-muted-foreground sm:table-cell">{n.resourceType}</td>
                    <td className="w-16 py-1 pr-3 text-right text-muted-foreground tabular">{n.duration !== undefined ? `${n.duration} ms` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {detail && (
          <aside className="flex w-[min(28rem,55%)] shrink-0 flex-col border-l" aria-label="Request detail">
            <div className="flex items-center gap-2 border-b px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-xs" title={detail.url}>{detail.url}</span>
              <Button variant="ghost" size="icon-xs" aria-label="Close detail" onClick={() => setSelected(null)}>
                <X />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
                <dt className="text-muted-foreground">Status</dt>
                <dd className={statusClass(detail)}>{detail.status ?? "pending"} {detail.statusText}</dd>
                <dt className="text-muted-foreground">Type</dt>
                <dd>{detail.resourceType}</dd>
              </dl>
              {detail.headers && (
                <>
                  <h3 className="mt-4 mb-1 font-medium">Response headers</h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
                    {Object.entries(detail.headers).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="break-all">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              {detail.body !== undefined && (
                <>
                  <h3 className="mt-4 mb-1 font-medium">Body</h3>
                  <pre className="max-h-80 overflow-auto rounded border bg-background p-2 font-mono whitespace-pre-wrap">{detail.body.slice(0, 20_000)}</pre>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function CookieView() {
  const cookies = useRun((s) => s.cookies);
  if (cookies.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Cookies set during the run are listed here when the page navigates and when the run ends.</p>;
  }
  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-[640px] font-mono text-xs">
        <thead className="sticky top-0 bg-panel text-left text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-1.5 font-normal">Name</th>
            <th className="py-1.5 font-normal">Value</th>
            <th className="py-1.5 font-normal">Domain</th>
            <th className="py-1.5 font-normal">Path</th>
            <th className="py-1.5 pr-3 font-normal">Flags</th>
          </tr>
        </thead>
        <tbody>
          {cookies.map((c) => (
            <tr key={`${c.domain}${c.path}${c.name}`} className="border-b border-border/60">
              <td className="px-3 py-1">{c.name}</td>
              <td className="max-w-[16rem] truncate py-1" title={c.value}>{c.value}</td>
              <td className="py-1">{c.domain}</td>
              <td className="py-1">{c.path}</td>
              <td className="py-1 pr-3 text-muted-foreground">
                {[c.httpOnly && "HttpOnly", c.secure && "Secure", c.sameSite].filter(Boolean).join(" ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
