import { drizzle } from "drizzle-orm/d1";

export const createDbFromD1 = (db: D1Database) => drizzle(db);
