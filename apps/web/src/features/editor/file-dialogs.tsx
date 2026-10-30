import { PromptDialog } from "@/components/prompt-dialog";
import { useWorkbench } from "@/stores/workbench";

const VALID = /^[\w.\-/ ]+$/;

export function validateFileName(name: string, existing: string[], current?: string) {
  if (!VALID.test(name)) return "Use letters, numbers, spaces, dots, dashes and slashes.";
  if (name.startsWith("/") || name.split("/").includes("..")) return "Keep the file inside the project.";
  if (name !== current && existing.includes(name)) return "A file with that name already exists.";
  if (name === "package.json") return "package.json is managed by the runner.";
  return null;
}

export function NewFileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const files = useWorkbench((s) => s.files);
  const addFile = useWorkbench((s) => s.addFile);
  return (
    <PromptDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New file"
      description="Helper files can be loaded from your entry file with require('./name.js')."
      label="File name"
      placeholder="helpers.js"
      submitLabel="Create file"
      validate={(v) => validateFileName(v, files.map((f) => f.name))}
      onSubmit={(name) => addFile(name, name.endsWith(".js") ? "module.exports = {};\n" : "")}
    />
  );
}

export function RenameFileDialog({ file, onOpenChange }: { file: string | null; onOpenChange: (o: boolean) => void }) {
  const files = useWorkbench((s) => s.files);
  const renameFile = useWorkbench((s) => s.renameFile);
  return (
    <PromptDialog
      open={file !== null}
      onOpenChange={onOpenChange}
      title="Rename file"
      label="File name"
      initialValue={file ?? ""}
      submitLabel="Rename"
      validate={(v) => validateFileName(v, files.map((f) => f.name), file ?? undefined)}
      onSubmit={(name) => {
        if (file && name !== file) renameFile(file, name);
      }}
    />
  );
}
