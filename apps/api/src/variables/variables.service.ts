import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq, inArray } from "drizzle-orm";
import { decryptText, encryptText, MASK } from "../common/crypto.js";
import { newId } from "../common/ids.js";
import { type Database, InjectDb } from "../database/database.module.js";
import { envVars, envWorkspaces } from "../database/schema.js";

export interface VarInput {
  id?: string;
  key: string;
  value: string;
  isSecret: boolean;
}

@Injectable()
export class VariablesService {
  constructor(@InjectDb() private readonly db: Database) {}

  /** Every user has a "Default" workspace whose variables apply to every run. */
  private async ensureDefault(userId: string) {
    const existing = await this.db.select().from(envWorkspaces).where(eq(envWorkspaces.userId, userId));
    if (existing.length) return existing;
    const [ws] = await this.db.insert(envWorkspaces).values({ id: newId(), userId, name: "Default" }).returning();
    return [ws];
  }

  async list(userId: string) {
    const workspaces = await this.ensureDefault(userId);
    const vars = await this.db
      .select()
      .from(envVars)
      .where(inArray(envVars.workspaceId, workspaces.map((w) => w.id)))
      .orderBy(asc(envVars.position));
    return workspaces
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((ws, i) => ({
        id: ws.id,
        name: ws.name,
        isDefault: i === 0,
        vars: vars
          .filter((v) => v.workspaceId === ws.id)
          .map((v) => ({ id: v.id, key: v.key, isSecret: v.isSecret, value: v.isSecret ? MASK : decryptText(v.valueEnc) })),
      }));
  }

  private async owned(userId: string, workspaceId: string) {
    const [ws] = await this.db.select().from(envWorkspaces).where(eq(envWorkspaces.id, workspaceId)).limit(1);
    if (!ws) throw new NotFoundException("Variable set not found.");
    if (ws.userId !== userId) throw new ForbiddenException();
    return ws;
  }

  async create(userId: string, name: string) {
    await this.ensureDefault(userId);
    await this.db.insert(envWorkspaces).values({ id: newId(), userId, name: name.trim() });
    return this.list(userId);
  }

  async rename(userId: string, workspaceId: string, name: string) {
    await this.owned(userId, workspaceId);
    await this.db.update(envWorkspaces).set({ name: name.trim() }).where(eq(envWorkspaces.id, workspaceId));
    return this.list(userId);
  }

  async remove(userId: string, workspaceId: string) {
    await this.owned(userId, workspaceId);
    const all = await this.list(userId);
    if (all.find((w) => w.id === workspaceId)?.isDefault) throw new ForbiddenException("The default set cannot be deleted.");
    await this.db.delete(envWorkspaces).where(eq(envWorkspaces.id, workspaceId));
    return this.list(userId);
  }

  /** Replace the set's variables. A masked secret value keeps what is already stored. */
  async replaceVars(userId: string, workspaceId: string, incoming: VarInput[]) {
    await this.owned(userId, workspaceId);
    const current = await this.db.select().from(envVars).where(eq(envVars.workspaceId, workspaceId));
    const byId = new Map(current.map((v) => [v.id, v]));
    const rows = incoming.map((v, position) => {
      const prev = v.id ? byId.get(v.id) : undefined;
      const valueEnc = v.value === MASK && prev ? prev.valueEnc : encryptText(v.value);
      return { id: prev?.id ?? newId(), workspaceId, key: v.key.trim(), valueEnc, isSecret: v.isSecret, position };
    });
    await this.db.transaction(async (tx) => {
      await tx.delete(envVars).where(eq(envVars.workspaceId, workspaceId));
      if (rows.length) await tx.insert(envVars).values(rows);
    });
    return this.list(userId);
  }

  /** Plain key/value map for a run: default set first, then the chosen set on top. */
  async resolve(userId: string, workspaceId?: string | null) {
    const workspaces = await this.ensureDefault(userId);
    const ordered = workspaces.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const ids = [ordered[0].id];
    if (workspaceId && workspaceId !== ordered[0].id && ordered.some((w) => w.id === workspaceId)) ids.push(workspaceId);
    const env: Record<string, string> = {};
    const secrets: string[] = [];
    for (const id of ids) {
      const vars = await this.db.select().from(envVars).where(eq(envVars.workspaceId, id)).orderBy(asc(envVars.position));
      for (const v of vars) {
        if (!v.key) continue;
        const value = decryptText(v.valueEnc);
        env[v.key] = value;
        if (v.isSecret) secrets.push(value);
      }
    }
    return { env, secrets };
  }
}
