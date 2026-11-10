import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "./index";

const COOKIE = "sticky_admin";
const MAX_AGE = 60 * 60 * 24 * 30;

type Ctx = Context<{ Bindings: Env }>;

const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 길이 차이가 드러나지 않도록 양쪽을 같은 키로 해시한 뒤 비교한다
export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  const salt = crypto.randomUUID();
  return safeEqual(await hmac(salt, input), await hmac(salt, expected));
}

export async function issueAdminCookie(c: Ctx, secret: string) {
  const expires = String(Date.now() + MAX_AGE * 1000);
  setCookie(c, COOKIE, `${expires}.${await hmac(secret, expires)}`, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearAdminCookie(c: Ctx) {
  deleteCookie(c, COOKIE, { path: "/" });
}

export async function isAdmin(c: Ctx): Promise<boolean> {
  const secret = c.env.ADMIN_PASSWORD;
  const [expires, signature] = (getCookie(c, COOKIE) ?? "").split(".");
  if (!secret || !expires || !signature) return false;
  if (!(Number(expires) > Date.now())) return false;
  return safeEqual(signature, await hmac(secret, expires));
}
