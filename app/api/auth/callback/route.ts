import type { NextRequest } from "next/server";
import {
  authSecret,
  cookieHeader,
  createSession,
  googleConfig,
  isAllowed,
  safeEqual,
  SESSION_COOKIE,
  siteOrigin,
  STATE_COOKIE,
} from "@/lib/auth";

/** Google يعيد الزائر هنا بعد اختيار حسابه */
export async function GET(request: NextRequest) {
  const origin = siteOrigin(request);
  const fail = (error: string, email?: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/login?error=${error}${email ? `&email=${encodeURIComponent(email)}` : ""}`,
        "Set-Cookie": cookieHeader(STATE_COOKIE, "", { maxAge: 0 }),
      },
    });

  const google = googleConfig();
  const secret = authSecret();
  if (!google || !secret) return fail("config");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const savedState = request.cookies.get(STATE_COOKIE)?.value ?? "";
  if (!code || !savedState || !safeEqual(state, savedState)) return fail("state");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: google.clientId,
        client_secret: google.clientSecret,
        redirect_uri: `${origin}/api/auth/callback`,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const token = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenRes.ok || !token.access_token) throw new Error(token.error ?? `token HTTP ${tokenRes.status}`);

    const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const user = (await userRes.json()) as { email?: string; email_verified?: boolean };
    if (!userRes.ok || !user.email || !user.email_verified) throw new Error("userinfo");

    if (!isAllowed(user.email)) {
      console.warn("[auth] denied:", user.email);
      return fail("not_allowed", user.email);
    }

    console.log("[auth] login:", user.email);
    const session = await createSession(secret, user.email);
    const headers = new Headers({ Location: `${origin}/` });
    headers.append("Set-Cookie", cookieHeader(SESSION_COOKIE, session.value, { expires: session.expires }));
    headers.append("Set-Cookie", cookieHeader(STATE_COOKIE, "", { maxAge: 0 }));
    return new Response(null, { status: 302, headers });
  } catch (e) {
    console.error("[auth] callback error:", e);
    return fail("google");
  }
}
