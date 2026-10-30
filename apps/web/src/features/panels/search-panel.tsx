import { CaseSensitive, Regex } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useWorkbench } from "@/stores/workbench";
import { PanelHeader } from "./panel-header";

interface Hit {
  file: string;
  line: number;
  column: number;
  length: number;
  text: string;
}

const MAX_HITS = 500;

export function SearchPanel() {
  const files = useWorkbench((s) => s.files);
  const revealAt = useWorkbench((s) => s.revealAt);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  const { hits, error } = useMemo(() => {
    if (!query) return { hits: [] as Hit[], error: null };
    let re: RegExp;
    try {
      re = new RegExp(useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "g" : "gi");
    } catch {
      return { hits: [], error: "That regular expression is not valid." };
    }
    const out: Hit[] = [];
    for (const f of files) {
      f.code.split("\n").forEach((text, i) => {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) && out.length < MAX_HITS) {
          out.push({ file: f.name, line: i + 1, column: m.index + 1, length: m[0].length, text });
          if (m[0].length === 0) re.lastIndex++;
        }
      });
    }
    return { hits: out, error: null };
  }, [files, query, caseSensitive, useRegex]);

  const grouped = useMemo(() => {
    const map = new Map<string, Hit[]>();
    for (const h of hits) map.set(h.file, [...(map.get(h.file) ?? []), h]);
    return [...map.entries()];
  }, [hits]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Search" />
      <div className="flex items-center gap-1 border-b p-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search in project" aria-label="Search in project" className="h-8 text-xs" autoFocus />
        <button
          aria-pressed={caseSensitive}
          aria-label="Match case"
          title="Match case"
          onClick={() => setCaseSensitive((v) => !v)}
          className={cn("grid size-8 shrink-0 place-items-center rounded-md", caseSensitive ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          <CaseSensitive className="size-4" />
        </button>
        <button
          aria-pressed={useRegex}
          aria-label="Use regular expression"
          title="Use regular expression"
          onClick={() => setUseRegex((v) => !v)}
          className={cn("grid size-8 shrink-0 place-items-center rounded-md", useRegex ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          <Regex className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {error ? (
          <p className="px-3 py-2 text-xs text-danger">{error}</p>
        ) : !query ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Searches every file in this project, including unsaved edits.</p>
        ) : hits.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
        ) : (
          <>
            <p className="px-3 py-1 text-xs text-muted-foreground tabular">
              {hits.length >= MAX_HITS ? `First ${MAX_HITS} matches` : `${hits.length} match${hits.length === 1 ? "" : "es"}`} in {grouped.length} file{grouped.length === 1 ? "" : "s"}
            </p>
            {grouped.map(([file, list]) => (
              <div key={file} className="mt-1">
                <p className="px-3 py-1 font-mono text-xs font-medium">{file}</p>
                <ul>
                  {list.map((h, i) => (
                    <li key={i}>
                      <button
                        onClick={() => revealAt(h.file, h.line, h.column, h.length)}
                        className="flex w-full gap-2 px-3 py-0.5 text-left font-mono text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      >
                        <span className="w-8 shrink-0 text-right text-muted-foreground tabular">{h.line}</span>
                        <span className="min-w-0 truncate">
                          {h.text.slice(Math.max(0, h.column - 21), h.column - 1).trimStart()}
                          <mark className="rounded-sm bg-signal/25 text-foreground">{h.text.slice(h.column - 1, h.column - 1 + h.length)}</mark>
                          {h.text.slice(h.column - 1 + h.length, h.column + 60)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
