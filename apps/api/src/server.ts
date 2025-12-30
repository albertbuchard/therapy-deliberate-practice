import { serve } from "@hono/node-server";
import { createApiApp } from "./index";
import { createDbFromSqlite } from "./db/sqlite";
import { getRuntimeEnv } from "./env";

const dbPath = process.env.DB_PATH ?? "./infra/local.db";
const db = createDbFromSqlite(dbPath);
const runtimeEnv = getRuntimeEnv();

const app = createApiApp({ db, runtimeEnv });

serve({
  fetch: app.fetch,
  port: 8787
});
