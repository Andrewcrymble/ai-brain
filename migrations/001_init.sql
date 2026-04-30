CREATE TABLE IF NOT EXISTS inputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input_id INTEGER REFERENCES inputs(id),
  action_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  external_id TEXT,
  status TEXT DEFAULT 'pending',
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  tags TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inputs_created ON inputs(created_at);
CREATE INDEX IF NOT EXISTS idx_inputs_hash ON inputs(content_hash);
CREATE INDEX IF NOT EXISTS idx_actions_created ON actions(created_at);
CREATE INDEX IF NOT EXISTS idx_actions_input ON actions(input_id);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
