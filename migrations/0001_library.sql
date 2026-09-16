CREATE TABLE IF NOT EXISTS library (
 id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0,
 data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_requests (
 id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, month TEXT NOT NULL,
 status TEXT NOT NULL, reserved REAL NOT NULL, cost REAL,
 result TEXT, error TEXT, created_at TEXT NOT NULL, finished_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_ai_request ON ai_requests((1)) WHERE status='running';
CREATE INDEX IF NOT EXISTS ai_month ON ai_requests(month);
