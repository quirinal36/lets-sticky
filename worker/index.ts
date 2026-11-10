import { Hono } from "hono";
import type { Context } from "hono";
import {
  COLORS,
  MAX_FILE_SIZE,
  MAX_FILES_PER_POST,
  type Answers,
  type BoardDetail,
  type BoardSummary,
  type FileInfo,
  type NoteColor,
  type Post,
  type Question,
  type Survey,
} from "../shared/types";
import { clearAdminCookie, isAdmin, issueAdminCookie, passwordMatches } from "./auth";
import { ensureSchema } from "./schema";
import { fetchLinkPreview, firstUrl } from "./preview";

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ADMIN_PASSWORD?: string;
}

type Ctx = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>();

const ID_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
function newId(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ID_CHARS[b % ID_CHARS.length];
  return out;
}

function clientId(c: Ctx): string | null {
  const id = c.req.header("x-client-id") ?? "";
  return /^[A-Za-z0-9_-]{16,64}$/.test(id) ? id : null;
}

function fail(c: Ctx, status: 400 | 401 | 403 | 404 | 413, message: string) {
  return c.json({ error: message }, status);
}

async function readJson(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const data = await c.req.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "서버 오류가 발생했습니다." }, 500);
});

app.use("*", async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

// ── 관리자 ─────────────────────────────────────────────

app.get("/api/me", async (c) => c.json({ admin: await isAdmin(c) }));

app.put("/api/me/name", async (c) => {
  const me = clientId(c);
  if (!me) return fail(c, 400, "잘못된 요청입니다.");
  const name = text((await readJson(c)).name, 30);
  if (!name) return fail(c, 400, "이름을 입력하세요.");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE posts SET author = ? WHERE owner = ?").bind(name, me),
    c.env.DB.prepare("UPDATE responses SET name = ? WHERE respondent = ?").bind(name, me),
  ]);
  return c.json({ ok: true });
});

app.post("/api/admin/login", async (c) => {
  const { password } = await readJson(c);
  const expected = c.env.ADMIN_PASSWORD;
  if (!expected || typeof password !== "string" || !(await passwordMatches(password, expected))) {
    return fail(c, 401, "비밀번호가 올바르지 않습니다.");
  }
  await issueAdminCookie(c, expected);
  return c.json({ admin: true });
});

app.post("/api/admin/logout", (c) => {
  clearAdminCookie(c);
  return c.json({ admin: false });
});

// ── 보드 ───────────────────────────────────────────────

app.get("/api/boards", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT b.id, b.slug, b.title, b.created_at,
            (SELECT COUNT(*) FROM posts p WHERE p.board_id = b.id) AS post_count,
            (SELECT COUNT(*) FROM surveys s WHERE s.board_id = b.id) AS survey_count
       FROM boards b ORDER BY b.created_at DESC`,
  ).all<Record<string, unknown>>();
  const boards: BoardSummary[] = results.map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    createdAt: r.created_at as number,
    postCount: r.post_count as number,
    surveyCount: r.survey_count as number,
  }));
  return c.json({ boards });
});

app.post("/api/boards", async (c) => {
  if (!(await isAdmin(c))) return fail(c, 403, "관리자만 보드를 만들 수 있습니다.");
  const title = text((await readJson(c)).title, 80);
  if (!title) return fail(c, 400, "보드 이름을 입력하세요.");
  const board = { id: newId(), slug: newId(6), title };
  await c.env.DB.prepare("INSERT INTO boards (id, slug, title, created_at) VALUES (?, ?, ?, ?)")
    .bind(board.id, board.slug, board.title, Date.now())
    .run();
  return c.json({ board });
});

app.patch("/api/boards/:id", async (c) => {
  if (!(await isAdmin(c))) return fail(c, 403, "권한이 없습니다.");
  const title = text((await readJson(c)).title, 80);
  if (!title) return fail(c, 400, "보드 이름을 입력하세요.");
  await c.env.DB.prepare("UPDATE boards SET title = ? WHERE id = ?").bind(title, c.req.param("id")).run();
  return c.json({ ok: true });
});

app.delete("/api/boards/:id", async (c) => {
  if (!(await isAdmin(c))) return fail(c, 403, "권한이 없습니다.");
  const id = c.req.param("id");
  const { results } = await c.env.DB.prepare("SELECT f.r2_key FROM files f JOIN posts p ON p.id = f.post_id WHERE p.board_id = ?")
    .bind(id)
    .all<{ r2_key: string }>();
  await deleteObjects(
    c.env,
    results.map((r) => r.r2_key),
  );
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM files WHERE post_id IN (SELECT id FROM posts WHERE board_id = ?)").bind(id),
    c.env.DB.prepare("DELETE FROM posts WHERE board_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM responses WHERE survey_id IN (SELECT id FROM surveys WHERE board_id = ?)").bind(id),
    c.env.DB.prepare("DELETE FROM surveys WHERE board_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM boards WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

app.get("/api/boards/:slug", async (c) => {
  const db = c.env.DB;
  const board = await db
    .prepare("SELECT id, slug, title FROM boards WHERE slug = ?")
    .bind(c.req.param("slug"))
    .first<{ id: string; slug: string; title: string }>();
  if (!board) return fail(c, 404, "보드를 찾을 수 없습니다.");

  const admin = await isAdmin(c);
  const me = clientId(c);
  const [postRows, fileRows, surveyRows, responseRows] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT * FROM posts WHERE board_id = ? ORDER BY pinned DESC, created_at DESC").bind(board.id),
    db
      .prepare(
        `SELECT f.id, f.post_id, f.name, f.type, f.size FROM files f
           JOIN posts p ON p.id = f.post_id WHERE p.board_id = ? ORDER BY f.created_at, f.rowid`,
      )
      .bind(board.id),
    db.prepare("SELECT * FROM surveys WHERE board_id = ? ORDER BY created_at DESC").bind(board.id),
    db
      .prepare(
        `SELECT r.* FROM responses r JOIN surveys s ON s.id = r.survey_id
          WHERE s.board_id = ? ORDER BY r.created_at`,
      )
      .bind(board.id),
  ]);

  const filesByPost = new Map<string, FileInfo[]>();
  for (const f of fileRows.results) {
    const list = filesByPost.get(f.post_id as string) ?? [];
    list.push({ id: f.id as string, name: f.name as string, type: f.type as string, size: f.size as number });
    filesByPost.set(f.post_id as string, list);
  }

  const posts: Post[] = postRows.results.map((p) => ({
    id: p.id as string,
    body: p.body as string,
    color: p.color as NoteColor,
    author: p.author as string,
    pinned: !!p.pinned,
    createdAt: p.created_at as number,
    mine: !!me && p.owner === me,
    link: p.link_url
      ? {
          url: p.link_url as string,
          title: (p.link_title as string) || null,
          description: (p.link_desc as string) || null,
          image: (p.link_image as string) || null,
        }
      : null,
    files: filesByPost.get(p.id as string) ?? [],
  }));

  const surveys: Survey[] = surveyRows.results.map((s) => {
    const rows = responseRows.results.filter((r) => r.survey_id === s.id);
    const mine = me ? rows.find((r) => r.respondent === me) : undefined;
    const showResults = !!s.show_results;
    const canSeeResults = admin || (showResults && !!mine);
    return {
      id: s.id as string,
      title: s.title as string,
      description: s.description as string,
      questions: JSON.parse(s.questions as string) as Question[],
      isOpen: !!s.is_open,
      showResults,
      createdAt: s.created_at as number,
      responseCount: rows.length,
      myAnswers: mine ? (JSON.parse(mine.answers as string) as Answers) : null,
      responses: canSeeResults
        ? rows.map((r) => ({
            ...(admin ? { name: r.name as string } : {}),
            answers: JSON.parse(r.answers as string) as Answers,
            createdAt: r.created_at as number,
          }))
        : null,
    };
  });

  const detail: BoardDetail = { board, posts, surveys };
  return c.json(detail);
});

// ── 게시물 ─────────────────────────────────────────────

app.post("/api/boards/:slug/posts", async (c) => {
  const me = clientId(c);
  if (!me) return fail(c, 400, "잘못된 요청입니다.");
  const db = c.env.DB;
  const board = await db.prepare("SELECT id FROM boards WHERE slug = ?").bind(c.req.param("slug")).first<{ id: string }>();
  if (!board) return fail(c, 404, "보드를 찾을 수 없습니다.");

  const data = await readJson(c);
  const body = text(data.body, 5000);
  const author = text(data.author, 30);
  const color: NoteColor = COLORS.includes(data.color as NoteColor) ? (data.color as NoteColor) : "white";
  const fileIds = Array.isArray(data.fileIds)
    ? data.fileIds.filter((v): v is string => typeof v === "string").slice(0, MAX_FILES_PER_POST)
    : [];
  if (!author) return fail(c, 400, "이름을 입력하세요.");
  if (!body && fileIds.length === 0) return fail(c, 400, "내용을 입력하거나 파일을 첨부하세요.");

  const id = newId();
  const link = firstUrl(body);
  const statements = [
    db
      .prepare(
        `INSERT INTO posts (id, board_id, body, color, author, owner, link_url, pinned, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .bind(id, board.id, body, color, author, me, link, Date.now()),
    // 본인이 올린, 아직 어디에도 붙지 않은 파일만 연결한다
    ...fileIds.map((fileId) =>
      db.prepare("UPDATE files SET post_id = ? WHERE id = ? AND uploader = ? AND post_id IS NULL").bind(id, fileId, me),
    ),
  ];
  await db.batch(statements);
  if (link) c.executionCtx.waitUntil(saveLinkPreview(db, id, link));
  return c.json({ id });
});

async function saveLinkPreview(db: D1Database, postId: string, url: string) {
  const preview = await fetchLinkPreview(url);
  if (!preview) return;
  await db
    .prepare("UPDATE posts SET link_title = ?, link_desc = ?, link_image = ? WHERE id = ? AND link_url = ?")
    .bind(preview.title, preview.description, preview.image, postId, url)
    .run();
}

app.patch("/api/posts/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const post = await db
    .prepare("SELECT owner, link_url FROM posts WHERE id = ?")
    .bind(id)
    .first<{ owner: string; link_url: string | null }>();
  if (!post) return fail(c, 404, "게시물을 찾을 수 없습니다.");
  const admin = await isAdmin(c);
  const owner = clientId(c) === post.owner;
  if (!admin && !owner) return fail(c, 403, "권한이 없습니다.");

  const data = await readJson(c);
  const statements: D1PreparedStatement[] = [];
  let newLink: string | null = null;
  if (typeof data.body === "string") {
    const body = text(data.body, 5000);
    const link = firstUrl(body);
    if (link !== post.link_url) {
      newLink = link;
      statements.push(
        db.prepare("UPDATE posts SET link_url = ?, link_title = NULL, link_desc = NULL, link_image = NULL WHERE id = ?").bind(link, id),
      );
    }
    statements.push(db.prepare("UPDATE posts SET body = ? WHERE id = ?").bind(body, id));
  }
  if (COLORS.includes(data.color as NoteColor)) {
    statements.push(db.prepare("UPDATE posts SET color = ? WHERE id = ?").bind(data.color, id));
  }
  if (admin && typeof data.pinned === "boolean") {
    statements.push(db.prepare("UPDATE posts SET pinned = ? WHERE id = ?").bind(data.pinned ? 1 : 0, id));
  }
  if (statements.length) await db.batch(statements);
  if (newLink) c.executionCtx.waitUntil(saveLinkPreview(db, id, newLink));
  return c.json({ ok: true });
});

app.delete("/api/posts/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const post = await db.prepare("SELECT owner FROM posts WHERE id = ?").bind(id).first<{ owner: string }>();
  if (!post) return c.json({ ok: true });
  if (!(await isAdmin(c)) && clientId(c) !== post.owner) return fail(c, 403, "권한이 없습니다.");
  const { results } = await db.prepare("SELECT r2_key FROM files WHERE post_id = ?").bind(id).all<{ r2_key: string }>();
  await deleteObjects(
    c.env,
    results.map((r) => r.r2_key),
  );
  await db.batch([db.prepare("DELETE FROM files WHERE post_id = ?").bind(id), db.prepare("DELETE FROM posts WHERE id = ?").bind(id)]);
  return c.json({ ok: true });
});

// ── 파일 ───────────────────────────────────────────────

async function deleteObjects(env: Env, keys: string[]) {
  for (let i = 0; i < keys.length; i += 500) await env.FILES.delete(keys.slice(i, i + 500));
}

// 게시되지 않고 하루 넘게 남은 업로드를 정리한다
async function sweepOrphans(env: Env) {
  const { results } = await env.DB.prepare("SELECT id, r2_key FROM files WHERE post_id IS NULL AND created_at < ? LIMIT 100")
    .bind(Date.now() - 24 * 60 * 60 * 1000)
    .all<{ id: string; r2_key: string }>();
  if (!results.length) return;
  await deleteObjects(
    env,
    results.map((r) => r.r2_key),
  );
  await env.DB.batch(results.map((r) => env.DB.prepare("DELETE FROM files WHERE id = ?").bind(r.id)));
}

app.put("/api/files", async (c) => {
  const me = clientId(c);
  if (!me) return fail(c, 400, "잘못된 요청입니다.");
  const size = Number(c.req.header("content-length"));
  if (!c.req.raw.body || !Number.isFinite(size) || size <= 0) return fail(c, 400, "빈 파일은 올릴 수 없습니다.");
  if (size > MAX_FILE_SIZE) return fail(c, 413, "파일이 너무 큽니다. (최대 95MB)");

  let name = "file";
  try {
    name =
      decodeURIComponent(c.req.header("x-file-name") ?? "")
        .replace(/[\\/\u0000-\u001f]/g, "_")
        .trim()
        .slice(0, 200) || "file";
  } catch {
    // 이름을 해석할 수 없으면 기본값을 쓴다
  }
  const type = (c.req.header("content-type") ?? "").split(";")[0].trim().slice(0, 100) || "application/octet-stream";
  const id = newId(16);
  const key = `files/${id}`;
  await c.env.FILES.put(key, c.req.raw.body, { httpMetadata: { contentType: type } });
  await c.env.DB.prepare(
    "INSERT INTO files (id, post_id, r2_key, name, type, size, uploader, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, key, name, type, size, me, Date.now())
    .run();
  c.executionCtx.waitUntil(sweepOrphans(c.env));
  const file: FileInfo = { id, name, type, size };
  return c.json({ file });
});

// 브라우저에서 바로 열어도 안전한 형식만 inline 으로 내보낸다
const INLINE_TYPES = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|quicktime)|audio\/[\w.+-]+|application\/pdf)$/;

app.get("/f/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT r2_key, name, type FROM files WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ r2_key: string; name: string; type: string }>();
  if (!row) return c.notFound();
  const object = await c.env.FILES.get(row.r2_key, { range: c.req.raw.headers });
  if (!object) return c.notFound();

  const inline = INLINE_TYPES.test(row.type) && c.req.query("dl") === undefined;
  const headers = new Headers({
    "content-type": inline ? row.type : "application/octet-stream",
    "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    "x-content-type-options": "nosniff",
    "cache-control": "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
    etag: object.httpEtag,
  });
  if (row.type !== "application/pdf") headers.set("content-security-policy", "default-src 'none'; sandbox");

  const range = object.range as { offset?: number; length?: number } | undefined;
  if (range && c.req.header("range")) {
    const offset = range.offset ?? 0;
    const length = range.length ?? object.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
});

// ── 설문 ───────────────────────────────────────────────

function parseQuestions(input: unknown): Question[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 30) return null;
  const questions: Question[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const q = raw as Record<string, unknown>;
    const type = q.type;
    if (type !== "single" && type !== "multi" && type !== "text" && type !== "scale") return null;
    const label = text(q.label, 300);
    if (!label) return null;
    const hasOptions = type === "single" || type === "multi";
    const options =
      hasOptions && Array.isArray(q.options) ? [...new Set(q.options.map((o) => text(o, 200)).filter(Boolean))].slice(0, 20) : [];
    if (hasOptions && options.length < 2) return null;
    questions.push({ id: newId(8), type, label, options, required: q.required !== false });
  }
  return questions;
}

function parseAnswers(questions: Question[], input: unknown): Answers | string {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const answers: Answers = {};
  for (const q of questions) {
    const value = raw[q.id];
    let answer: Answers[string] | undefined;
    if (q.type === "single") {
      if (typeof value === "string" && q.options.includes(value)) answer = value;
    } else if (q.type === "multi") {
      const picked = Array.isArray(value) ? q.options.filter((o) => value.includes(o)) : [];
      if (picked.length) answer = picked;
    } else if (q.type === "scale") {
      if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5) answer = value;
    } else {
      const t = text(value, 2000);
      if (t) answer = t;
    }
    if (answer === undefined) {
      if (q.required) return `"${q.label}" 문항에 응답해 주세요.`;
      continue;
    }
    answers[q.id] = answer;
  }
  return answers;
}

app.post("/api/boards/:slug/surveys", async (c) => {
  if (!(await isAdmin(c))) return fail(c, 403, "관리자만 설문을 만들 수 있습니다.");
  const board = await c.env.DB.prepare("SELECT id FROM boards WHERE slug = ?").bind(c.req.param("slug")).first<{ id: string }>();
  if (!board) return fail(c, 404, "보드를 찾을 수 없습니다.");
  const data = await readJson(c);
  const title = text(data.title, 120);
  const questions = parseQuestions(data.questions);
  if (!title) return fail(c, 400, "설문 제목을 입력하세요.");
  if (!questions) return fail(c, 400, "문항을 확인해 주세요. 선택형 문항은 보기가 2개 이상 필요합니다.");
  const id = newId();
  await c.env.DB.prepare(
    `INSERT INTO surveys (id, board_id, title, description, questions, is_open, show_results, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  )
    .bind(id, board.id, title, text(data.description, 1000), JSON.stringify(questions), data.showResults ? 1 : 0, Date.now())
    .run();
  return c.json({ id });
});

app.patch("/api/surveys/:id", async (c) => {
  if (!(await isAdmin(c))) return fail(c, 403, "권한이 없습니다.");
  const db = c.env.DB;
  const id = c.req.param("id");
  const data = await readJson(c);
  const statements: D1PreparedStatement[] = [];
  if (typeof data.isOpen === "boolean")
    statements.push(db.prepare("UPDATE surveys SET is_open = ? WHERE id = ?").bind(data.isOpen ? 1 : 0, id));
  if (typeof data.showResults === "boolean") {
    statements.push(db.prepare("UPDATE surveys SET show_results = ? WHERE id = ?").bind(data.showResults ? 1 : 0, id));
  }
  if (typeof data.title === "string") {
    const title = text(data.title, 120);
    if (!title) return fail(c, 400, "설문 제목을 입력하세요.");
    statements.push(db.prepare("UPDATE surveys SET title = ?, description = ? WHERE id = ?").bind(title, text(data.description, 1000), id));
  }
  if (data.questions !== undefined) {
    const questions = parseQuestions(data.questions);
    if (!questions) return fail(c, 400, "문항을 확인해 주세요. 선택형 문항은 보기가 2개 이상 필요합니다.");
    const count = await db.prepare("SELECT COUNT(*) AS n FROM responses WHERE survey_id = ?").bind(id).first<{ n: number }>();
    if (count && count.n > 0) return fail(c, 400, "이미 응답이 있는 설문은 문항을 바꿀 수 없습니다.");
    statements.push(db.prepare("UPDATE surveys SET questions = ? WHERE id = ?").bind(JSON.stringify(questions), id));
  }
  if (statements.length) await db.batch(statements);
  return c.json({ ok: true });
});

app.delete("/api/surveys/:id", async (c) => {
  if (!(await isAdmin(c))) return fail(c, 403, "권한이 없습니다.");
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM responses WHERE survey_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM surveys WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

app.post("/api/surveys/:id/responses", async (c) => {
  const me = clientId(c);
  if (!me) return fail(c, 400, "잘못된 요청입니다.");
  const db = c.env.DB;
  const id = c.req.param("id");
  const survey = await db
    .prepare("SELECT questions, is_open FROM surveys WHERE id = ?")
    .bind(id)
    .first<{ questions: string; is_open: number }>();
  if (!survey) return fail(c, 404, "설문을 찾을 수 없습니다.");
  if (!survey.is_open) return fail(c, 400, "마감된 설문입니다.");
  const data = await readJson(c);
  const name = text(data.name, 30);
  if (!name) return fail(c, 400, "이름을 입력하세요.");
  const answers = parseAnswers(JSON.parse(survey.questions) as Question[], data.answers);
  if (typeof answers === "string") return fail(c, 400, answers);
  await db
    .prepare(
      `INSERT INTO responses (id, survey_id, respondent, name, answers, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (survey_id, respondent) DO UPDATE SET name = excluded.name, answers = excluded.answers`,
    )
    .bind(newId(), id, me, name, JSON.stringify(answers), Date.now())
    .run();
  return c.json({ ok: true });
});

app.all("/api/*", (c) => fail(c, 404, "찾을 수 없습니다."));

export default app;
