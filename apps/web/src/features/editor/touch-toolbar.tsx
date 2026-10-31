import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ClipboardPaste,
  Copy,
  IndentDecrease,
  Keyboard,
  MoveDown,
  MoveUp,
  Redo2,
  Scissors,
  Search,
  TextCursorInput,
  Undo2,
} from "lucide-react";
import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { monaco } from "@/lib/monaco";
import { cn } from "@/lib/utils";

type MonacoEditor = monaco.editor.IStandaloneCodeEditor;

// Characters that sit on a second or third keyboard page on phones but show up on every line of a script.
const SYMBOLS = ["(", ")", "{", "}", "[", "]", "'", '"', "`", ";", ".", "=>", "=", "!", "<", ">", "&", "|", "$", "/"];

/**
 * The shortcuts a hardware keyboard gives you, as buttons: selection growth (Ctrl+D, Ctrl+L),
 * caret keys that can extend a selection, clipboard, and the symbols that are slow to reach.
 * Every button keeps the editor's focus, so the on-screen keyboard stays where it is.
 */
export function TouchToolbar({ editor }: { editor: MonacoEditor | null }) {
  const [selecting, setSelecting] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!editor) return;
    setTyping(editor.hasTextFocus());
    const a = editor.onDidFocusEditorText(() => setTyping(true));
    const b = editor.onDidBlurEditorText(() => setTyping(false));
    return () => {
      a.dispose();
      b.dispose();
    };
  }, [editor]);

  if (!editor) return null;
  const run = (id: string, payload: unknown = null) => editor.trigger("touch", id, payload);
  const move = (dir: "Left" | "Right" | "Up" | "Down") => run(`cursor${dir}${selecting ? "Select" : ""}`);

  async function copy(cut: boolean) {
    const model = editor!.getModel();
    if (!model) return;
    // Like VS Code: with nothing selected, copy and cut work on the whole line.
    if (editor!.getSelections()?.every((s) => s.isEmpty())) run("expandLineSelection");
    const text = (editor!.getSelections() ?? []).map((s) => model.getValueInRange(s)).join(model.getEOL());
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error("The browser blocked the clipboard", { description: "Long-press the selection to copy it instead." });
      return;
    }
    if (cut) {
      editor!.pushUndoStop();
      editor!.executeEdits("touch-cut", (editor!.getSelections() ?? []).map((range) => ({ range, text: "" })));
      editor!.pushUndoStop();
    }
  }

  async function paste() {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast.error("The browser blocked the clipboard", { description: "Long-press in the editor and choose Paste instead." });
      return;
    }
    if (text) run("paste", { text, pasteOnNewLine: false, multicursorText: null, mode: null });
  }

  return (
    <div
      role="toolbar"
      aria-label="Editing keys"
      className="flex h-11 shrink-0 touch-pan-x items-stretch overflow-x-auto overscroll-x-contain border-b bg-panel [scrollbar-width:none]"
    >
      <Group>
        <Key label={typing ? "Hide keyboard" : "Show keyboard"} pressed={typing} onPress={() => (typing ? blurEditor() : editor.focus())}>
          <Keyboard />
        </Key>
        <Key label="Undo" onPress={() => run("undo")}>
          <Undo2 />
        </Key>
        <Key label="Redo" onPress={() => run("redo")}>
          <Redo2 />
        </Key>
      </Group>

      <Group>
        <Key label="Select with arrows" pressed={selecting} onPress={() => setSelecting((v) => !v)}>
          <TextCursorInput />
        </Key>
        <Key label="Left" repeat onPress={() => move("Left")}>
          <ArrowLeft />
        </Key>
        <Key label="Down" repeat onPress={() => move("Down")}>
          <ArrowDown />
        </Key>
        <Key label="Up" repeat onPress={() => move("Up")}>
          <ArrowUp />
        </Key>
        <Key label="Right" repeat onPress={() => move("Right")}>
          <ArrowRight />
        </Key>
      </Group>

      <Group>
        <Key label="Expand selection to word, then string, then block" text onPress={() => run("editor.action.smartSelect.expand")}>
          Word
        </Key>
        <Key label="Select line (Ctrl+L)" text onPress={() => run("expandLineSelection")}>
          Line
        </Key>
        <Key label="Add next match to the selection (Ctrl+D)" text onPress={() => run("editor.action.addSelectionToNextFindMatch")}>
          Next
        </Key>
        <Key label="Select all" text onPress={() => run("editor.action.selectAll")}>
          All
        </Key>
        <Key
          label="Back to one cursor (Esc)"
          text
          onPress={() => {
            run("removeSecondaryCursors");
            run("cancelSelection");
          }}
        >
          Esc
        </Key>
      </Group>

      <Group>
        <Key label="Copy (the line, when nothing is selected)" onPress={() => void copy(false)}>
          <Copy />
        </Key>
        <Key label="Cut (the line, when nothing is selected)" onPress={() => void copy(true)}>
          <Scissors />
        </Key>
        <Key label="Paste" onPress={() => void paste()}>
          <ClipboardPaste />
        </Key>
      </Group>

      <Group>
        <Key label="Indent or accept suggestion (Tab)" text onPress={() => run("tab")}>
          Tab
        </Key>
        <Key label="Outdent (Shift+Tab)" onPress={() => run("editor.action.outdentLines")}>
          <IndentDecrease />
        </Key>
        <Key label="Toggle comment (Ctrl+/)" text onPress={() => run("editor.action.commentLine")}>
          {"//"}
        </Key>
        <Key label="Move line up (Alt+Up)" onPress={() => run("editor.action.moveLinesUpAction")}>
          <MoveUp />
        </Key>
        <Key label="Move line down (Alt+Down)" onPress={() => run("editor.action.moveLinesDownAction")}>
          <MoveDown />
        </Key>
        <Key label="Find (Ctrl+F)" onPress={() => run("actions.find")}>
          <Search />
        </Key>
      </Group>

      <Group last>
        {SYMBOLS.map((s) => (
          <Key key={s} label={`Type ${s}`} text onPress={() => run("type", { text: s })}>
            {s}
          </Key>
        ))}
      </Group>
    </div>
  );
}

function blurEditor() {
  (document.activeElement as HTMLElement | null)?.blur();
}

function Group({ children, last }: { children: ReactNode; last?: boolean }) {
  return <div className={cn("flex shrink-0 items-stretch px-0.5", !last && "border-r")}>{children}</div>;
}

/**
 * One key. It acts on pointer-down, before the finger lifts, like a hardware key, and never takes focus.
 * Keys marked `repeat` keep firing while held, the way an arrow key does.
 */
function Key({
  label,
  pressed,
  repeat,
  text,
  onPress,
  children,
}: {
  label: string;
  pressed?: boolean;
  repeat?: boolean;
  text?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const timer = useRef<number | undefined>(undefined);
  const stop = () => {
    window.clearTimeout(timer.current);
    window.clearInterval(timer.current);
    timer.current = undefined;
  };
  useEffect(() => stop, []);

  function down(e: ReactPointerEvent<HTMLButtonElement>) {
    // Keeps focus (and the on-screen keyboard) on the editor.
    e.preventDefault();
    if (e.button !== 0) return;
    onPress();
    if (!repeat) return;
    stop();
    timer.current = window.setTimeout(() => {
      timer.current = window.setInterval(onPress, 60);
    }, 380);
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onPointerDown={down}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      // Pointer-down already acted; a click with detail 0 comes from Enter or Space.
      onClick={(e) => e.detail === 0 && onPress()}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "pressable grid min-w-11 shrink-0 touch-manipulation place-items-center px-2 text-muted-foreground select-none focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none active:bg-accent active:text-foreground [&_svg]:size-4",
        text && "font-mono text-sm",
        pressed && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}
