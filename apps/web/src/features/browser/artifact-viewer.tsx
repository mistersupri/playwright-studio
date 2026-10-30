import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronLeft, ChevronRight, Columns2, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatBytes, formatRelative } from "@/lib/format";
import type { Artifact } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ImageCompare } from "./image-compare";
import { traceViewerUrl } from "@/lib/artifacts";

interface Props {
  artifact: Artifact | null;
  /** Siblings to step through with the arrow keys (images only). */
  gallery?: Artifact[];
  /** Images this one can be compared with; defaults to the gallery. */
  compareWith?: Artifact[];
  onOpenChange: (open: boolean) => void;
  onNavigate?: (a: Artifact) => void;
}

export function ArtifactViewer({ artifact, gallery = [], compareWith, onOpenChange, onNavigate }: Props) {
  const [comparing, setComparing] = useState(false);
  useEffect(() => setComparing(false), [artifact?.id]);
  const comparable = (compareWith ?? gallery).filter((a) => a.kind === "screenshot" && a.id !== artifact?.id);
  const images = gallery.filter((a) => a.kind === "screenshot");
  const index = artifact ? images.findIndex((a) => a.id === artifact.id) : -1;
  const step = (delta: number) => {
    if (index < 0 || images.length < 2) return;
    onNavigate?.(images[(index + delta + images.length) % images.length]);
  };

  useEffect(() => {
    if (!artifact || artifact.kind !== "screenshot" || comparing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Dialog open={artifact !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[min(1100px,calc(100vw-2rem))] max-w-none flex-col gap-3 p-4 sm:max-w-none">
        {artifact && (
          <>
            <DialogHeader className="flex-row items-start justify-between gap-4 pr-8 text-left">
              <div className="min-w-0">
                <DialogTitle className="truncate font-mono text-sm">{artifact.name}</DialogTitle>
                <DialogDescription className="tabular">
                  {formatBytes(artifact.size)} · {formatRelative(artifact.createdAt)}
                </DialogDescription>
              </div>
              <div className="flex shrink-0 gap-2">
              {artifact.kind === "screenshot" && comparable.length > 0 && (
                <Button variant="outline" size="sm" aria-pressed={comparing} onClick={() => setComparing((c) => !c)}>
                  <Columns2 /> {comparing ? "Back to image" : "Compare"}
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <a href={`${artifact.url}?download=1`} download={artifact.name}>
                  <Download /> Download
                </a>
              </Button>
              </div>
            </DialogHeader>
            <div className="relative min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40">
              {comparing ? <ImageCompare base={artifact} candidates={comparable} /> : <Body artifact={artifact} />}
              {artifact.kind === "screenshot" && images.length > 1 && !comparing && (
                <>
                  <Button variant="secondary" size="icon" aria-label="Previous image" className="absolute top-1/2 left-2 -translate-y-1/2" onClick={() => step(-1)}>
                    <ChevronLeft />
                  </Button>
                  <Button variant="secondary" size="icon" aria-label="Next image" className="absolute top-1/2 right-2 -translate-y-1/2" onClick={() => step(1)}>
                    <ChevronRight />
                  </Button>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-background/80 px-2 py-0.5 font-mono text-xs tabular">
                    {index + 1} / {images.length}
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({ artifact }: { artifact: Artifact }) {
  switch (artifact.kind) {
    case "screenshot":
      return <img src={artifact.url} alt={artifact.name} className="mx-auto max-h-[75dvh] object-contain" />;
    case "pdf":
      return <iframe title={artifact.name} src={artifact.url} className="h-[75dvh] w-full bg-white" />;
    case "video":
      return <video src={artifact.url} controls className="mx-auto max-h-[75dvh]" />;
    case "excel":
      return <SheetPreview artifact={artifact} />;
    case "trace":
      return (
        <Centered>
          <span className="grid gap-3">
            <span>A Playwright trace: every action with DOM snapshots, network requests and console output.</span>
            <Button asChild className="mx-auto">
              <a href={traceViewerUrl(artifact)} target="_blank" rel="noreferrer">
                <Activity /> Open in trace viewer
              </a>
            </Button>
          </span>
        </Centered>
      );
    default:
      return <TextPreview artifact={artifact} />;
  }
}

function SheetPreview({ artifact }: { artifact: Artifact }) {
  const q = useQuery({
    queryKey: ["sheets", artifact.id],
    queryFn: () => api.get<{ name: string; rows: unknown[][] }[]>(`/artifacts/${artifact.id}/sheets`),
  });
  const [active, setActive] = useState(0);
  if (q.isPending) return <Centered><Spinner /> Reading workbook</Centered>;
  if (q.isError) return <Centered>Could not read this workbook: {q.error.message}</Centered>;
  const sheet = q.data[active];
  if (!sheet) return <Centered>The workbook has no sheets.</Centered>;
  return (
    <div className="flex h-full flex-col">
      {q.data.length > 1 && (
        <div className="flex gap-1 border-b p-1.5" role="tablist">
          {q.data.map((s, i) => (
            <button
              key={s.name}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn("rounded px-2.5 py-1 text-xs", i === active ? "bg-background font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {sheet.rows.length === 0 ? (
        <Centered>This sheet is empty.</Centered>
      ) : (
        <div className="overflow-auto">
          <table className="w-max min-w-full border-collapse font-mono text-xs tabular">
            <tbody>
              {sheet.rows.map((row, r) => (
                <tr key={r} className={cn(r === 0 && "bg-background font-medium")}>
                  <td className="border-r border-b px-2 py-1 text-right text-muted-foreground select-none">{r + 1}</td>
                  {row.map((cell, c) => (
                    <td key={c} className="max-w-xs truncate border-r border-b px-2 py-1">
                      {cell === null || cell === undefined ? "" : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {sheet.rows.length >= 200 && <p className="p-2 text-xs text-muted-foreground">Showing the first 200 rows. Download for the rest.</p>}
        </div>
      )}
    </div>
  );
}

const TEXT_TYPES = /^(text\/|application\/(json|xml))/;

function TextPreview({ artifact }: { artifact: Artifact }) {
  const previewable = TEXT_TYPES.test(artifact.mimeType) && artifact.size < 2_000_000;
  const q = useQuery({
    queryKey: ["artifact-text", artifact.id],
    queryFn: () => fetch(artifact.url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.statusText)))),
    enabled: previewable,
  });
  if (!previewable) return <Centered>No preview for this file type. Download it to open it.</Centered>;
  if (q.isPending) return <Centered><Spinner /> Loading</Centered>;
  if (q.isError) return <Centered>Could not load the file.</Centered>;
  let text = q.data;
  if (artifact.mimeType === "application/json") {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2);
    } catch {}
  }
  return <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">{text}</pre>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-60 items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">{children}</div>;
}
