import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EXTENSION_FILES } from "@/data/extension-files";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./panel-header";

export function RecorderPanel() {
  const [selected, setSelected] = useState(0);
  const [packing, setPacking] = useState(false);

  async function download() {
    setPacking(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const folder = zip.folder("scriptbench-recorder")!;
      for (const f of EXTENSION_FILES) folder.file(f.name, f.code);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "scriptbench-recorder.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Could not build the zip", { description: String(err) });
    } finally {
      setPacking(false);
    }
  }

  const file = EXTENSION_FILES[selected];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Chrome recorder" />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="text-xs text-muted-foreground">
          A Chrome extension that records your clicks, typing and navigation in a normal browser tab and turns them into a Playwright script you can paste here.
        </p>
        <ol className="mt-3 grid list-decimal gap-1 pl-4 text-xs text-muted-foreground">
          <li>Download and unzip the bundle.</li>
          <li>Open <code className="font-mono text-foreground">chrome://extensions</code> and turn on Developer mode.</li>
          <li>Choose Load unpacked and select the unzipped folder.</li>
        </ol>
        <Button size="sm" className="mt-3 w-full" onClick={download} disabled={packing}>
          {packing ? <Spinner /> : <Download />} Download extension (.zip)
        </Button>

        <h3 className="mt-5 text-xs font-semibold">What is inside</h3>
        <div className="mt-1.5 flex flex-wrap gap-1" role="tablist" aria-label="Extension files">
          {EXTENSION_FILES.map((f, i) => (
            <button
              key={f.name}
              role="tab"
              aria-selected={i === selected}
              onClick={() => setSelected(i)}
              className={cn("rounded px-1.5 py-0.5 font-mono text-xs", i === selected ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {f.name}
            </button>
          ))}
        </div>
        <pre className="mt-2 max-h-80 overflow-auto rounded-md border bg-editor p-2 font-mono text-[11px] leading-4">{file.code}</pre>
      </div>
    </div>
  );
}
