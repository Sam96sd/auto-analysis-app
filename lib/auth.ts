/**
 * تسجيل الدخول بحساب Google + قائمة إيميلات مسموحة (allowed-emails.ts).
 * بدون مكتبات خارجية وبدون قاعدة بيانات: الجلسة كوكي موقّع بـ HMAC.
 * يعمل مع Web Crypto (متوافق مع proxy و API routes).
 */
import { allowedEmailsText } from "@/allowed-emails";

export const SESSION_COOKIE = "aa_session";
export const STATE_COOKIE = "aa_oauth_state";
export const SESSION_DAYS = 14;

export function authSecret(): string | null {
  const s = process.env.AUTH_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export const allowedEmails: ReadonlySet<string> = new Set(
  allowedEmailsText
    .split("\n")
    .map((line) => normalizeEmail(line.split("#")[0]))
    .filter((e) => e.includes("@")),
);

export const isAllowed = (email: string) => allowedEmails.has(normalizeEmail(email));

/* ---------------------------------- تشفير ---------------------------------- */

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (x) => x.toString(16).padStart(2, "0")).join("");
}

const b64url = (s: string) => btoa(String.fromCharCode(...enc.encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomToken(bytes = 24): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (x) => x.toString(16).padStart(2, "0")).join("");
}

/* ---------------------------------- الجلسة ---------------------------------- */

/** قيمة الكوكي: base64url(email).expiresMs.signature */
export async function createSession(secret: string, email: string, now = Date.now()) {
  const expires = now + SESSION_DAYS * 86_400_000;
  const e = normalizeEmail(email);
  const value = `${b64url(e)}.${expires}.${await hmacHex(secret, `session:${e}:${expires}`)}`;
  return { value, expires: new Date(expires) };
}

/** يُرجع الإيميل إذا كانت الجلسة صحيحة وغير منتهية والإيميل ما زال في القائمة */
export async function readSession(secret: string, value: string | undefined, now = Date.now()): Promise<string | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [emailPart, expStr, sig] = parts;
  const expires = Number(expStr);
  if (!Number.isFinite(expires) || expires < now) return null;
  let email: string;
  try {
    email = unb64url(emailPart);
  } catch {
    return null;
  }
  if (!safeEqual(sig, await hmacHex(secret, `session:${email}:${expires}`))) return null;
  return isAllowed(email) ? email : null;
}

export function cookieHeader(name: string, value: string, opts: { expires?: Date; maxAge?: number }) {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    opts.expires ? `Expires=${opts.expires.toUTCString()}` : "",
    opts.maxAge !== undefined ? `Max-Age=${opts.maxAge}` : "",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** عنوان الموقع (يمكن تثبيته بـ SITE_URL إن لزم) */
export function siteOrigin(request: Request): string {
  const fixed = process.env.SITE_URL?.trim().replace(/\/$/, "");
  return fixed || new URL(request.url).origin;
}
