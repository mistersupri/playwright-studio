import { useMutation, useQuery } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCollab } from "@/hooks/use-collab";
import { api, errorMessage } from "@/lib/api";
import type { AiSettings } from "@/lib/types";
import { useWorkbench } from "@/stores/workbench";
import { AiSettingsDialog } from "./ai-settings-dialog";
import { PanelHeader } from "./panel-header";

type Mode = "replace" | "append" | "prepend";

export function AiPanel() {
  const activeFile = useWorkbench((s) => s.activeFile);
  const settings = useQuery({ queryKey: ["ai-settings"], queryFn: () => api.get<AiSettings>("/ai/settings") });
  const collab = useCollab();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("replace");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [result, setResult] = useState<{ code: string; explanation: string; file: string; mode: Mode } | null>(null);

  const configured = settings.data?.hasKey || settings.data?.serverKey;

  const generate = useMutation({
    mutationFn: () => {
      const wb = useWorkbench.getState();
      const current = wb.files.find((f) => f.name === wb.activeFile)?.code ?? "";
      return api.post<{ code: string; explanation: string }>("/ai/generate", { prompt, currentCode: current, mode });
    },
    onSuccess: (data) => setResult({ ...data, file: activeFile, mode }),
    onError: (err) => toast.error("Generation failed", { description: errorMessage(err) }),
  });

  function apply() {
    if (!result) return;
    const wb = useWorkbench.getState();
    const current = wb.files.find((f) => f.name === result.file);
    if (!current) {
      toast.error(`${result.file} is no longer in the project.`);
      return;
    }
    const code =
      result.mode === "replace" ? result.code : result.mode === "append" ? `${current.code.trimEnd()}\n\n${result.code}\n` : `${result.code}\n\n${current.code}`;
    wb.setCode(result.file, code);
    wb.setActiveFile(result.file);
    collab.sendCode(result.file, code);
    setResult(null);
    toast.success(`Updated ${result.file}`, { description: "Undo with Ctrl+Z in the editor." });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (prompt.trim().length >= 3) generate.mutate();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Write with Gemini">
        <Button variant="ghost" size="icon-xs" aria-label="Gemini settings" onClick={() => setSettingsOpen(true)}>
          <Settings2 />
        </Button>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {settings.isSuccess && !configured && (
          <div className="mb-3 rounded-md border p-2.5 text-xs">
            <p>Add a Gemini API key to generate scripts.</p>
            <Button size="xs" variant="outline" className="mt-2" onClick={() => setSettingsOpen(true)}>
              Add API key
            </Button>
          </div>
        )}
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ai-prompt" className="text-xs">What should the script do?</Label>
            <Textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
              }}
              placeholder="Open news.ycombinator.com, collect the top 10 titles and links, and save them to stories.json"
              rows={5}
              className="text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ai-mode" className="text-xs">Put the result</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger id="ai-mode" size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="replace">In place of {activeFile}</SelectItem>
                <SelectItem value="append">At the end of {activeFile}</SelectItem>
                <SelectItem value="prepend">At the start of {activeFile}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" size="sm" disabled={generate.isPending || prompt.trim().length < 3 || !configured}>
            {generate.isPending && <Spinner />} Generate script
          </Button>
        </form>

        {result && (
          <section className="mt-4 grid gap-2 border-t pt-3" aria-label="Generated script">
            {result.explanation && <p className="text-xs text-muted-foreground">{result.explanation}</p>}
            <pre className="max-h-72 overflow-auto rounded-md border bg-editor p-2 font-mono text-xs leading-5">{result.code}</pre>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setResult(null)}>Discard</Button>
              <Button size="sm" onClick={apply}>Apply to {result.file}</Button>
            </div>
          </section>
        )}
      </div>
      <AiSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
