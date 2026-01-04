CREATE TABLE IF NOT EXISTS minigame_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  game_type TEXT NOT NULL,
  visibility_mode TEXT NOT NULL,
  task_selection TEXT NOT NULL,
  settings TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE INDEX IF NOT EXISTS minigame_sessions_user_id_created_at_idx
  ON minigame_sessions (user_id, created_at);

CREATE TABLE IF NOT EXISTS minigame_teams (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS minigame_teams_session_id_idx
  ON minigame_teams (session_id);

CREATE TABLE IF NOT EXISTS minigame_players (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  team_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS minigame_players_session_id_idx
  ON minigame_players (session_id);

CREATE TABLE IF NOT EXISTS minigame_rounds (
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

CREATE INDEX IF NOT EXISTS minigame_rounds_session_id_position_idx
  ON minigame_rounds (session_id, position);

CREATE TABLE IF NOT EXISTS minigame_round_results (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  overall_score REAL NOT NULL,
  overall_pass INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS minigame_round_results_round_id_idx
  ON minigame_round_results (round_id);
