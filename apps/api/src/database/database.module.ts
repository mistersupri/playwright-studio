import { Global, Inject, Logger, Module, type OnApplicationShutdown } from "@nestjs/common";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { API_ROOT, config } from "../config.js";
import * as schema from "./schema.js";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export const DB = Symbol("DB");
export const InjectDb = () => Inject(DB);

const MIGRATIONS = path.join(API_ROOT, "drizzle");
const logger = new Logger("Database");
let close: () => Promise<void> = async () => {};

async function connect(): Promise<Database> {
  if (config.databaseUrl) {
    const { default: pg } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    close = () => pool.end();
    const host = new URL(config.databaseUrl).host;
    logger.log(`Connected to PostgreSQL at ${host}`);
    return db as unknown as Database;
  }

  // No DATABASE_URL: run an embedded Postgres (PGlite) stored in the data dir.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(config.paths.pglite);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  close = () => client.close();
  logger.warn(`DATABASE_URL is not set, using embedded PGlite at ${config.paths.pglite}`);
  return db as unknown as Database;
}

@Global()
@Module({
  providers: [{ provide: DB, useFactory: connect }],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await close();
  }
}
