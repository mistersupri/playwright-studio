import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatRelative } from "@/lib/format";
import type { Artifact } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "slider" | "side" | "diff";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

/**
 * Pixel diff: changed pixels painted in the signal colour over a faded copy of the base.
 * Both images are drawn at the base size, so screenshots of different sizes still compare.
 */
async function diffImages(baseUrl: string, otherUrl: string) {
  const [a, b] = await Promise.all([loadImage(baseUrl), loadImage(otherUrl)]);
  const w = a.naturalWidth;
  const h = a.naturalHeight;
  const canvas = (img: HTMLImageElement) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    return { c, data: ctx.getImageData(0, 0, w, h) };
  };
  const ca = canvas(a);
  const cb = canvas(b);
  const out = ca.c.getContext("2d")!.createImageData(w, h);
  let changed = 0;
  for (let i = 0; i < ca.data.data.length; i += 4) {
    const d =
      Math.abs(ca.data.data[i] - cb.data.data[i]) +
      Math.abs(ca.data.data[i + 1] - cb.data.data[i + 1]) +
      Math.abs(ca.data.data[i + 2] - cb.data.data[i + 2]);
    if (d > 48) {
      changed++;
      out.data.set([232, 89, 12, 255], i);
    } else {
      const g = (ca.data.data[i] + ca.data.data[i + 1] + ca.data.data[i + 2]) / 3;
      const faded = 255 - (255 - g) * 0.25;
      out.data.set([faded, faded, faded, 255], i);
    }
  }
  ca.c.getContext("2d")!.putImageData(out, 0, 0);
  return { url: ca.c.toDataURL("image/png"), percent: (changed / (w * h)) * 100, sizeMismatch: a.naturalWidth !== b.naturalWidth || a.naturalHeight !== b.naturalHeight };
}

export function ImageCompare({ base, candidates }: { base: Artifact; candidates: Artifact[] }) {
  const others = useMemo(() => {
    const list = candidates.filter((c) => c.id !== base.id && c.kind === "screenshot");
    // Same file name from another run first: that is what people usually want to compare.
    return [...list.filter((c) => c.name === base.name), ...list.filter((c) => c.name !== base.name)];
  }, [candidates, base]);
  const [otherId, setOtherId] = useState(others[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("slider");
  const [split, setSplit] = useState(50);
  const [diff, setDiff] = useState<{ url: string; percent: number; sizeMismatch: boolean } | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const other = others.find((o) => o.id === otherId);

  useEffect(() => {
    setDiff(null);
    setDiffError(null);
    if (mode !== "diff" || !other) return;
    let cancelled = false;
    diffImages(base.url, other.url)
      .then((d) => !cancelled && setDiff(d))
      .catch((e: Error) => !cancelled && setDiffError(e.message));
    return () => {
      cancelled = true;
    };
  }, [mode, base.url, other]);

  if (others.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">There is no other image in this project to compare with yet.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-48 flex-1 gap-1">
          <Label htmlFor="cmp-other" className="text-xs">Compare with</Label>
          <Select value={otherId} onValueChange={setOtherId}>
            <SelectTrigger id="cmp-other" size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {others.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  <span className="font-mono">{o.name}</span>
                  <span className="text-muted-foreground">{formatRelative(o.createdAt)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex rounded-md bg-muted p-0.5" role="radiogroup" aria-label="Comparison view">
          {(["slider", "side", "diff"] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn("rounded px-2.5 py-1 text-xs", mode === m ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}
            >
              {m === "slider" ? "Slider" : m === "side" ? "Side by side" : "Difference"}
            </button>
          ))}
        </div>
      </div>

      {other && mode === "slider" && (
        <div className="grid min-h-0 flex-1 gap-2">
          <div className="relative min-h-0 overflow-hidden">
            <img src={other.url} alt={`Compared: ${other.name}`} className="mx-auto max-h-[62dvh] object-contain" />
            <img
              src={base.url}
              alt={`Current: ${base.name}`}
              className="absolute inset-0 mx-auto h-full w-full object-contain"
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
            aria-label="Move the divide between the two images"
            className="w-full accent-[var(--signal)]"
          />
          <p className="text-center text-xs text-muted-foreground">Left of the divide: this image. Right: the one you picked.</p>
        </div>
      )}

      {other && mode === "side" && (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
          {[base, other].map((a, i) => (
            <figure key={a.id} className="min-h-0">
              <img src={a.url} alt={a.name} className="max-h-[62dvh] w-full object-contain" />
              <figcaption className="mt-1 truncate text-center text-xs text-muted-foreground">
                {i === 0 ? "This image" : "Compared"} · {formatRelative(a.createdAt)}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {other && mode === "diff" && (
        <div className="grid min-h-0 flex-1 place-items-center gap-2">
          {diffError ? (
            <p className="text-sm text-danger">{diffError}</p>
          ) : !diff ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Comparing pixels</span>
          ) : (
            <>
              <img src={diff.url} alt="Pixels that differ, highlighted" className="max-h-[58dvh] object-contain" />
              <p className="text-sm tabular">
                <span className="font-medium">{diff.percent < 0.01 && diff.percent > 0 ? "<0.01" : diff.percent.toFixed(2)}%</span>{" "}
                <span className="text-muted-foreground">of pixels differ{diff.sizeMismatch ? " (images had different sizes and were scaled)" : ""}.</span>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
