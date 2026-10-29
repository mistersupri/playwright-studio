import { Logger } from "@nestjs/common";
import { type OnGatewayConnection, type OnGatewayDisconnect, WebSocketGateway } from "@nestjs/websockets";
import type { IncomingMessage } from "node:http";
import { WebSocket } from "ws";
import type { SessionUser } from "../auth/auth.decorators.js";
import { SessionService } from "../auth/session.service.js";
import { newId } from "../common/ids.js";
import { ProjectsService } from "../projects/projects.service.js";

interface Peer {
  socket: WebSocket;
  clientId: string;
  user: SessionUser;
  room: string | null;
  cursor?: { line: number; column: number; file: string };
}

const COLORS = ["#d9480f", "#2b8a3e", "#1971c2", "#c2255c", "#5f3dc4", "#e67700", "#0b7285"];
const colorFor = (id: string) => COLORS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];

/**
 * Presence and live edits for people viewing the same project.
 * Messages are JSON: join, cursor, code, workspace, workspace:request.
 */
@WebSocketGateway({ path: "/ws" })
export class CollabGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(CollabGateway.name);
  private readonly peers = new Map<WebSocket, Peer>();

  constructor(
    private readonly sessions: SessionService,
    private readonly projects: ProjectsService,
  ) {}

  async handleConnection(socket: WebSocket, req: IncomingMessage) {
    const user = await this.sessions.resolve(this.sessions.tokenFrom(req));
    if (!user) {
      socket.close(4401, "unauthorized");
      return;
    }
    const peer: Peer = { socket, clientId: newId(8), user, room: null };
    this.peers.set(socket, peer);
    socket.send(JSON.stringify({ type: "welcome", clientId: peer.clientId }));
    socket.on("message", (raw) => void this.onMessage(peer, raw.toString()));
  }

  handleDisconnect(socket: WebSocket) {
    const peer = this.peers.get(socket);
    this.peers.delete(socket);
    if (peer?.room) this.broadcastPresence(peer.room);
  }

  private roomPeers(room: string) {
    return [...this.peers.values()].filter((p) => p.room === room);
  }

  private broadcastPresence(room: string) {
    const peers = this.roomPeers(room);
    const presences = peers.map((p) => ({
      id: p.clientId,
      name: p.user.name,
      color: colorFor(p.user.id),
      cursor: p.cursor,
    }));
    for (const p of peers) this.sendTo(p, { type: "presence", presences });
  }

  private sendTo(peer: Peer, msg: unknown) {
    if (peer.socket.readyState === WebSocket.OPEN) peer.socket.send(JSON.stringify(msg));
  }

  private async onMessage(peer: Peer, raw: string) {
    let msg: { type?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "join" && typeof msg.projectId === "string") {
      try {
        await this.projects.readable(msg.projectId, peer.user.id);
      } catch {
        this.sendTo(peer, { type: "error", message: "You cannot open this project." });
        return;
      }
      const previous = peer.room;
      peer.room = msg.projectId;
      peer.cursor = undefined;
      if (previous && previous !== peer.room) this.broadcastPresence(previous);
      this.broadcastPresence(peer.room);
      const other = this.roomPeers(peer.room).find((p) => p !== peer);
      if (other) this.sendTo(other, { type: "workspace:request", to: peer.clientId });
      return;
    }
    if (msg.type === "leave") {
      const previous = peer.room;
      peer.room = null;
      if (previous) this.broadcastPresence(previous);
      return;
    }
    if (!peer.room) return;
    if (msg.type === "cursor") {
      peer.cursor = msg.cursor as Peer["cursor"];
      this.broadcastPresence(peer.room);
      return;
    }
    if (msg.type === "code" || msg.type === "workspace") {
      const targets = this.roomPeers(peer.room).filter((p) => p !== peer && (!msg.to || p.clientId === msg.to));
      for (const p of targets) this.sendTo(p, { ...msg, from: peer.clientId });
    }
  }
}
