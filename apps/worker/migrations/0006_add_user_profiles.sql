ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT 'Player';
ALTER TABLE users ADD COLUMN bio TEXT;

UPDATE users
SET display_name = 'Player ' || substr(id, 1, 6)
WHERE display_name IS NULL OR display_name = '' OR display_name = 'Player';
