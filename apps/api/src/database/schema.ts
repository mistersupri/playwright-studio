import { relations } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    googleSub: text("google_sub"),
    avatarUrl: text("avatar_url"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), uniqueIndex("users_google_sub_idx").on(t.googleSub)],
);

/** Files are stored as one encrypted JSON blob: [{ name, code }]. */
export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filesEnc: text("files_enc").notNull(),
    isPrivate: boolean("is_private").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_owner_idx").on(t.ownerId)],
);

export const projectVersions = pgTable(
  "project_versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filesEnc: text("files_enc").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("project_versions_project_idx").on(t.projectId)],
);

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    projectName: text("project_name").notNull(),
    entryFile: text("entry_file").notNull().default("main.js"),
    trigger: text("trigger", { enum: ["manual", "schedule"] }).notNull().default("manual"),
    status: text("status", { enum: ["running", "success", "failed", "stopped"] }).notNull(),
    error: text("error"),
    logsEnc: text("logs_enc"),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("runs_user_idx").on(t.userId, t.createdAt)],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => runs.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["screenshot", "pdf", "excel", "video", "upload", "file"] }).notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    /** Relative to the data dir. Outputs are encrypted at rest; uploads stay plain so scripts can read them. */
    storagePath: text("storage_path").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("artifacts_project_idx").on(t.userId, t.projectId)],
);

export const envWorkspaces = pgTable(
  "env_workspaces",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("env_workspaces_user_idx").on(t.userId)],
);

export const envVars = pgTable(
  "env_vars",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => envWorkspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueEnc: text("value_enc").notNull(),
    isSecret: boolean("is_secret").notNull().default(false),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("env_vars_workspace_idx").on(t.workspaceId)],
);

export const schedules = pgTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    entryFile: text("entry_file").notNull().default("main.js"),
    workspaceId: text("workspace_id").references(() => envWorkspaces.id, { onDelete: "set null" }),
    type: text("type", { enum: ["once", "repeat"] }).notNull(),
    runAt: timestamp("run_at", { withTimezone: true }),
    interval: text("interval", { enum: ["5m", "15m", "30m", "1h", "12h", "daily"] }),
    status: text("status", { enum: ["active", "paused", "completed"] }).notNull().default("active"),
    viewportWidth: integer("viewport_width").notNull().default(1280),
    viewportHeight: integer("viewport_height").notNull().default(720),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("schedules_next_idx").on(t.status, t.nextRunAt)],
);

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  geminiApiKeyEnc: text("gemini_api_key_enc"),
  geminiModel: text("gemini_model").notNull().default("gemini-2.5-flash"),
  captchaCount: integer("captcha_count").notNull().default(0),
});

export const projectsRelations = relations(projects, ({ one }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type ArtifactRow = typeof artifacts.$inferSelect;
export type Schedule = typeof schedules.$inferSelect;
