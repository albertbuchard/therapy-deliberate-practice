import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import {
  minigamePlayers,
  minigameRoundResults,
  minigameRounds,
  minigameSessions
} from "../src/db/schema";
import {
  listMinigameSessions,
  softDeleteMinigameSession,
  updateMinigameResume
} from "../src/services/minigameSessionsService";

const setupDb = () => {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE minigame_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      game_type TEXT NOT NULL,
      visibility_mode TEXT NOT NULL,
      task_selection TEXT NOT NULL,
      settings TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      ended_at INTEGER,
      last_active_at INTEGER,
      current_round_id TEXT,
      current_player_id TEXT,
      deleted_at INTEGER
    );
    CREATE TABLE minigame_players (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL,
      team_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE minigame_rounds (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      task_id TEXT NOT NULL,
      example_id TEXT NOT NULL,
      player_a_id TEXT NOT NULL,
      player_b_id TEXT,
      team_a_id TEXT,
      team_b_id TEXT,
      status TEXT NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    );
    CREATE TABLE minigame_round_results (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      overall_score REAL NOT NULL,
      overall_pass INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  const db = drizzle(sqlite);
  return { db, sqlite };
};

test("listMinigameSessions scopes by user and excludes deleted", async () => {
  const { db } = setupDb();
  const now = Date.now();
  await db.insert(minigameSessions).values([
    {
      id: "session-1",
      user_id: "user-1",
      game_type: "ffa",
      visibility_mode: "normal",
      task_selection: {},
      settings: {},
      created_at: now - 1000,
      ended_at: null,
      last_active_at: now - 500,
      current_round_id: null,
      current_player_id: null,
      deleted_at: null
    },
    {
      id: "session-2",
      user_id: "user-1",
      game_type: "ffa",
      visibility_mode: "normal",
      task_selection: {},
      settings: {},
      created_at: now - 900,
      ended_at: null,
      last_active_at: now - 400,
      current_round_id: null,
      current_player_id: null,
      deleted_at: now - 100
    },
    {
      id: "session-3",
      user_id: "user-2",
      game_type: "tdm",
      visibility_mode: "normal",
      task_selection: {},
      settings: {},
      created_at: now - 800,
      ended_at: null,
      last_active_at: now - 300,
      current_round_id: null,
      current_player_id: null,
      deleted_at: null
    }
  ]);
  await db.insert(minigamePlayers).values([
    { id: "player-1", session_id: "session-1", name: "Alpha", avatar: "a", team_id: null, created_at: now },
    { id: "player-2", session_id: "session-1", name: "Beta", avatar: "b", team_id: null, created_at: now }
  ]);
  await db.insert(minigameRounds).values([
    {
      id: "round-1",
      session_id: "session-1",
      position: 0,
      task_id: "task-1",
      example_id: "ex-1",
      player_a_id: "player-1",
      player_b_id: null,
      team_a_id: null,
      team_b_id: null,
      status: "completed",
      started_at: now - 200,
      completed_at: now - 100
    }
  ]);
  await db.insert(minigameRoundResults).values([
    {
      id: "result-1",
      round_id: "round-1",
      player_id: "player-1",
      attempt_id: "attempt-1",
      overall_score: 4,
      overall_pass: 1,
      created_at: now - 90
    }
  ]);

  const sessions = await listMinigameSessions(db, { userId: "user-1", status: "all", sort: "newest" });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.id, "session-1");
  assert.equal(sessions[0]?.players_count, 2);
  assert.deepEqual(sessions[0]?.progress, { completed: 1, total: 1 });
});

test("updateMinigameResume updates pointers and last_active_at", async () => {
  const { db } = setupDb();
  const now = Date.now();
  await db.insert(minigameSessions).values({
    id: "session-1",
    user_id: "user-1",
    game_type: "ffa",
    visibility_mode: "normal",
    task_selection: {},
    settings: {},
    created_at: now - 1000,
    ended_at: null,
    last_active_at: now - 900,
    current_round_id: null,
    current_player_id: null,
    deleted_at: null
  });

  const updated = await updateMinigameResume(db, {
    userId: "user-1",
    sessionId: "session-1",
    currentRoundId: "round-9",
    currentPlayerId: "player-9",
    lastActiveAt: now
  });
  assert.equal(updated, true);

  const [session] = await db
    .select()
    .from(minigameSessions)
    .where(eq(minigameSessions.id, "session-1"))
    .limit(1);
  assert.equal(session?.current_round_id, "round-9");
  assert.equal(session?.current_player_id, "player-9");
  assert.equal(session?.last_active_at, now);
});

test("softDeleteMinigameSession hides session from list", async () => {
  const { db } = setupDb();
  const now = Date.now();
  await db.insert(minigameSessions).values({
    id: "session-1",
    user_id: "user-1",
    game_type: "ffa",
    visibility_mode: "normal",
    task_selection: {},
    settings: {},
    created_at: now - 1000,
    ended_at: null,
    last_active_at: now - 900,
    current_round_id: null,
    current_player_id: null,
    deleted_at: null
  });

  const deleted = await softDeleteMinigameSession(db, { userId: "user-1", sessionId: "session-1" });
  assert.equal(deleted, true);

  const sessions = await listMinigameSessions(db, { userId: "user-1", status: "all", sort: "newest" });
  assert.equal(sessions.length, 0);
});
