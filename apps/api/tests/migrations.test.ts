import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import Database from "better-sqlite3";

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../worker/migrations"
);

const migrationSql = (name: string) =>
  readFileSync(path.join(migrationsDirectory, name), "utf8");

test("score trust migration promotes only positive hosted-provider provenance", () => {
  const sqlite = new Database(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE attempts (
        id TEXT PRIMARY KEY,
        completed_at INTEGER,
        model_info TEXT
      );
    `);
    const insert = sqlite.prepare(
      "INSERT INTO attempts (id, completed_at, model_info) VALUES (?, ?, ?)"
    );
    insert.run(
      "openai",
      1,
      JSON.stringify({ provider: { llm: { kind: "openai", model: "gpt-test" } } })
    );
    insert.run(
      "local",
      1,
      JSON.stringify({ provider: { llm: { kind: "local", model: "qwen-test" } } })
    );
    insert.run("missing", 1, null);
    insert.run("malformed", 1, "{not-json");

    sqlite.exec(migrationSql("0010_add_score_trust.sql"));
    const rows = sqlite
      .prepare("SELECT id, score_trust FROM attempts ORDER BY id")
      .all() as Array<{ id: string; score_trust: string }>;
    assert.deepEqual(rows, [
      { id: "local", score_trust: "local_unverified" },
      { id: "malformed", score_trust: "local_unverified" },
      { id: "missing", score_trust: "local_unverified" },
      { id: "openai", score_trust: "cloud_trusted" }
    ]);
  } finally {
    sqlite.close();
  }
});

test("minigame uniqueness migration reconciles legacy duplicates before indexing", () => {
  const sqlite = new Database(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE minigame_round_results (
        id TEXT PRIMARY KEY,
        round_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL
      );
      INSERT INTO minigame_round_results VALUES
        ('first-pair', 'round-1', 'player-1', 'attempt-1'),
        ('duplicate-pair', 'round-1', 'player-1', 'attempt-2'),
        ('duplicate-attempt', 'round-2', 'player-2', 'attempt-1'),
        ('unique', 'round-2', 'player-3', 'attempt-3');
    `);

    sqlite.exec(migrationSql("0011_unique_minigame_round_player.sql"));
    const rows = sqlite
      .prepare("SELECT id FROM minigame_round_results ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(rows, [{ id: "first-pair" }, { id: "unique" }]);
    assert.throws(() =>
      sqlite
        .prepare("INSERT INTO minigame_round_results VALUES (?, ?, ?, ?)")
        .run("new-pair-duplicate", "round-1", "player-1", "attempt-4")
    );
    assert.throws(() =>
      sqlite
        .prepare("INSERT INTO minigame_round_results VALUES (?, ?, ?, ?)")
        .run("new-attempt-duplicate", "round-3", "player-4", "attempt-1")
    );
  } finally {
    sqlite.close();
  }
});
