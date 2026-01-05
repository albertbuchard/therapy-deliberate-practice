ALTER TABLE minigame_sessions ADD COLUMN last_active_at INTEGER;
ALTER TABLE minigame_sessions ADD COLUMN current_round_id TEXT;
ALTER TABLE minigame_sessions ADD COLUMN current_player_id TEXT;
ALTER TABLE minigame_sessions ADD COLUMN deleted_at INTEGER;

CREATE INDEX IF NOT EXISTS minigame_sessions_user_id_deleted_at_ended_at_last_active_at_idx
  ON minigame_sessions (user_id, deleted_at, ended_at, last_active_at);
