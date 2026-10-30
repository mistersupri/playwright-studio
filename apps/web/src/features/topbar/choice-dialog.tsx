import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRunControls } from "@/hooks/use-run-controls";
import { useRun } from "@/stores/run";

/** Answers a script's chooseElements(selector) call. */
export function ChoiceDialog() {
  const choice = useRun((s) => s.choice);
  const { choose } = useRunControls();
  const [picked, setPicked] = useState<number[]>([]);

  useEffect(() => setPicked(choice?.options.map((o) => o.index) ?? []), [choice]);
  if (!choice) return null;

  const all = picked.length === choice.options.length;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg" showCloseButton={false} onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Pick the elements to use</DialogTitle>
          <DialogDescription>
            The script is waiting. <code className="font-mono">{choice.selector}</code> matched {choice.options.length} element{choice.options.length === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground tabular">{picked.length} selected</span>
          <Button variant="ghost" size="xs" onClick={() => setPicked(all ? [] : choice.options.map((o) => o.index))}>
            {all ? "Select none" : "Select all"}
          </Button>
        </div>
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
          {choice.options.map((o) => (
            <li key={o.index}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-accent">
                <Checkbox
                  checked={picked.includes(o.index)}
                  onCheckedChange={(v) => setPicked((p) => (v ? [...p, o.index] : p.filter((i) => i !== o.index)))}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm break-words">{o.text}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {o.tagName}
                    {o.id && `#${o.id}`}
                    {o.classList && `.${o.classList.trim().split(/\s+/).join(".")}`}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={() => choose(picked)}>Continue with {picked.length}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
