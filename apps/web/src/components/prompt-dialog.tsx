import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel: string;
  /** Return an error message to keep the dialog open. */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void | Promise<void>;
}

export function PromptDialog(props: PromptDialogProps) {
  const { open, onOpenChange, initialValue = "" } = props;
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(null);
    }
  }, [open, initialValue]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    const problem = props.validate?.(trimmed) ?? (trimmed ? null : `${props.label} cannot be empty.`);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      await props.onSubmit(trimmed);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            {props.description && <DialogDescription>{props.description}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="prompt-input">{props.label}</Label>
            <Input
              id="prompt-input"
              value={value}
              placeholder={props.placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "prompt-error" : undefined}
              autoFocus
              autoComplete="off"
            />
            {error && (
              <p id="prompt-error" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {props.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
