import { useEffect } from "react";
import { create } from "zustand";
import type { ProjectFile } from "@/lib/types";
import { useWorkbench } from "@/stores/workbench";

export interface Peer {
  id: string;
  name: string;
  color: string;
  cursor?: { file: string; line: number; column: number };
}

const usePeers = create<{ peers: Peer[]; selfId: string | null }>(() => ({ peers: [], selfId: null }));

let socket: WebSocket | null = null;
let room: string | null = null;
let codeTimer: number | undefined;
let cursorTimer: number | undefined;
/** Last code received per file, so applying a remote edit is not sent back out. */
const lastRemote = new Map<string, string>();

function send(msg: unknown) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function onMessage(raw: MessageEvent) {
  const msg = JSON.parse(raw.data as string);
  const wb = useWorkbench.getState();
  switch (msg.type) {
    case "welcome":
      usePeers.setState({ selfId: msg.clientId });
      if (room) send({ type: "join", projectId: room });
      break;
    case "presence":
      usePeers.setState({ peers: msg.presences });
      break;
    case "workspace:request":
      send({ type: "workspace", to: msg.to, files: wb.files });
      break;
    case "workspace":
      for (const f of msg.files as ProjectFile[]) lastRemote.set(f.name, f.code);
      wb.replaceFiles(msg.files, true);
      break;
    case "code":
      lastRemote.set(msg.fileName, msg.code);
      if (wb.files.some((f) => f.name === msg.fileName)) wb.setCode(msg.fileName, msg.code, true);
      else wb.replaceFiles([...wb.files, { name: msg.fileName, code: msg.code }], true);
      break;
  }
}

function connect() {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  socket = new WebSocket(url);
  socket.onmessage = onMessage;
  socket.onclose = (e) => {
    socket = null;
    usePeers.setState({ peers: [] });
    // 4401 means the session ended; anything else is a dropped connection worth retrying.
    if (e.code !== 4401 && room) window.setTimeout(connect, 3000);
  };
}

/** Joins the collaboration room for the open project. Mount once in the workbench. */
export function useCollabRoom(projectId: string | null) {
  useEffect(() => {
    room = projectId;
    lastRemote.clear();
    if (!projectId) return;
    connect();
    send({ type: "join", projectId });
    return () => {
      send({ type: "leave" });
      room = null;
    };
  }, [projectId]);

  useEffect(
    () => () => {
      room = null;
      socket?.close();
    },
    [],
  );
}

export function useCollab() {
  const peers = usePeers((s) => s.peers);
  const selfId = usePeers((s) => s.selfId);
  return {
    others: peers.filter((p) => p.id !== selfId),
    sendCode(fileName: string, code: string) {
      if (lastRemote.get(fileName) === code) return;
      window.clearTimeout(codeTimer);
      codeTimer = window.setTimeout(() => send({ type: "code", fileName, code }), 120);
    },
    sendCursor(file: string, line: number, column: number) {
      window.clearTimeout(cursorTimer);
      cursorTimer = window.setTimeout(() => send({ type: "cursor", cursor: { file, line, column } }), 250);
    },
  };
}
