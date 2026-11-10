const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS boards (
     id TEXT PRIMARY KEY,
     slug TEXT NOT NULL UNIQUE,
     title TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS posts (
     id TEXT PRIMARY KEY,
     board_id TEXT NOT NULL,
     body TEXT NOT NULL DEFAULT '',
     color TEXT NOT NULL DEFAULT 'white',
     author TEXT NOT NULL,
     owner TEXT NOT NULL,
     link_url TEXT,
     link_title TEXT,
     link_desc TEXT,
     link_image TEXT,
     pinned INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS posts_board ON posts (board_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS files (
     id TEXT PRIMARY KEY,
     post_id TEXT,
     r2_key TEXT NOT NULL,
     name TEXT NOT NULL,
     type TEXT NOT NULL,
     size INTEGER NOT NULL,
     uploader TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS files_post ON files (post_id)`,
  `CREATE TABLE IF NOT EXISTS surveys (
     id TEXT PRIMARY KEY,
     board_id TEXT NOT NULL,
     title TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     questions TEXT NOT NULL,
     is_open INTEGER NOT NULL DEFAULT 1,
     show_results INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS surveys_board ON surveys (board_id)`,
  `CREATE TABLE IF NOT EXISTS responses (
     id TEXT PRIMARY KEY,
     survey_id TEXT NOT NULL,
     respondent TEXT NOT NULL,
     name TEXT NOT NULL,
     answers TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     UNIQUE (survey_id, respondent)
   )`,
];

let ready: Promise<unknown> | null = null;

// 별도 마이그레이션 단계 없이 배포되도록, isolate 당 한 번 스키마를 보장한다
export function ensureSchema(db: D1Database): Promise<unknown> {
  ready ??= db.batch(STATEMENTS.map((sql) => db.prepare(sql))).catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}
