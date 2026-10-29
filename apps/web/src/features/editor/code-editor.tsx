import Editor, { type OnMount } from "@monaco-editor/react";
import { AlignLeft, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCollab } from "@/hooks/use-collab";
import { api, errorMessage } from "@/lib/api";
import { languageFor, monaco } from "@/lib/monaco";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useRun } from "@/stores/run";
import { useBreakpoints, useWorkbench } from "@/stores/workbench";
import { NewFileDialog } from "./file-dialogs";

type MonacoEditor = monaco.editor.IStandaloneCodeEditor;

export function CodeEditor() {
  const files = useWorkbench((s) => s.files);
  const activeFile = useWorkbench((s) => s.activeFile);
  const setActiveFile = useWorkbench((s) => s.setActiveFile);
  const setCode = useWorkbench((s) => s.setCode);
  const toggleBreakpoint = useWorkbench((s) => s.toggleBreakpoint);
  const debug = useWorkbench((s) => s.settings.debug);
  const reveal = useWorkbench((s) => s.reveal);
  const theme = useTheme((s) => s.theme);
  const breakpoints = useBreakpoints(activeFile);
  const pausedLine = useRun((s) => (s.paused && s.pausedFile === activeFile ? s.pausedLine : null));
  const collab = useCollab();

  const editorRef = useRef<MonacoEditor | null>(null);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const hoverLine = useRef<number | null>(null);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [formatting, setFormatting] = useState(false);

  const file = files.find((f) => f.name === activeFile) ?? files[0];

  // Keep the latest values reachable from Monaco event handlers registered once on mount.
  const latest = useRef({ activeFile, toggleBreakpoint });
  latest.current = { activeFile, toggleBreakpoint };

  const paintDecorations = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const list: monaco.editor.IModelDeltaDecoration[] = breakpoints.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: { glyphMarginClassName: "bp-glyph", glyphMarginHoverMessage: { value: "Breakpoint (click to remove)" } },
    }));
    if (hoverLine.current && !breakpoints.includes(hoverLine.current)) {
      list.push({ range: new monaco.Range(hoverLine.current, 1, hoverLine.current, 1), options: { glyphMarginClassName: "bp-glyph-hint" } });
    }
    if (pausedLine) {
      list.push({ range: new monaco.Range(pausedLine, 1, pausedLine, 1), options: { isWholeLine: true, className: "bp-line" } });
    }
    decorations.current?.set(list);
  };

  useEffect(paintDecorations, [breakpoints, pausedLine, activeFile]);

  useEffect(() => {
    if (pausedLine) editorRef.current?.revealLineInCenterIfOutsideViewport(pausedLine);
  }, [pausedLine]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !reveal || reveal.file !== activeFile) return;
    // Wait a frame so a just-switched model is attached.
    requestAnimationFrame(() => {
      editor.revealLineInCenter(reveal.line);
      editor.setSelection(new monaco.Range(reveal.line, reveal.column, reveal.line, reveal.column + reveal.length));
      editor.focus();
    });
  }, [reveal, activeFile]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    decorations.current = editor.createDecorationsCollection();
    editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position) {
        latest.current.toggleBreakpoint(latest.current.activeFile, e.target.position.lineNumber);
      }
    });
    editor.onMouseMove((e) => {
      const line = e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ? (e.target.position?.lineNumber ?? null) : null;
      if (line !== hoverLine.current) {
        hoverLine.current = line;
        paintDecorations();
      }
    });
    editor.onMouseLeave(() => {
      hoverLine.current = null;
      paintDecorations();
    });
    editor.onDidChangeCursorPosition((e) => collab.sendCursor(latest.current.activeFile, e.position.lineNumber, e.position.column));
    paintDecorations();
  };

  async function format() {
    if (!file) return;
    setFormatting(true);
    try {
      const { code } = await api.post<{ code: string }>("/system/format", { code: file.code });
      setCode(file.name, code);
      collab.sendCode(file.name, code);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setFormatting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <div className="flex h-9 shrink-0 items-stretch border-b bg-panel">
        <div role="tablist" aria-label="Open files" className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {files.map((f) => (
            <button
              key={f.name}
              role="tab"
              aria-selected={f.name === activeFile}
              onClick={() => setActiveFile(f.name)}
              className={cn(
                "relative flex shrink-0 items-center px-3 font-mono text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:bg-accent focus-visible:outline-none",
                f.name === activeFile && "bg-editor text-foreground",
              )}
            >
              {f.name}
              {f.name === activeFile && <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-signal" />}
            </button>
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="New file"
                onClick={() => setNewFileOpen(true)}
                className="touch-target grid w-9 shrink-0 place-items-center text-muted-foreground hover:text-foreground focus-visible:bg-accent focus-visible:outline-none"
              >
                <Plus className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>New file</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex shrink-0 items-center gap-1 border-l px-1.5">
          {debug && (
            <span className="hidden px-1.5 text-xs text-muted-foreground sm:inline">Click the gutter to set breakpoints</span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Format file" onClick={format} disabled={formatting || !file}>
                {formatting ? <Spinner /> : <AlignLeft />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Format with Prettier</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {file ? (
          <Editor
            path={file.name}
            language={languageFor(file.name)}
            value={file.code}
            theme={theme === "dark" ? "sb-dark" : "sb-light"}
            onMount={onMount}
            onChange={(value) => {
              const code = value ?? "";
              if (code === file.code) return;
              setCode(file.name, code);
              collab.sendCode(file.name, code);
            }}
            loading={<Spinner className="text-muted-foreground" />}
            options={{
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              fontSize: 13,
              lineHeight: 20,
              glyphMargin: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              smoothScrolling: false,
              renderLineHighlight: "line",
              padding: { top: 12 },
              tabSize: 2,
              automaticLayout: true,
              fixedOverflowWidgets: true,
              scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
            }}
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
            <div>
              <p>This project has no files.</p>
              <Button className="mt-3" variant="outline" size="sm" onClick={() => setNewFileOpen(true)}>
                Add a file
              </Button>
            </div>
          </div>
        )}
      </div>
      <NewFileDialog open={newFileOpen} onOpenChange={setNewFileOpen} />
    </div>
  );
}
