import { cookieHeader, SESSION_COOKIE, siteOrigin } from "@/lib/auth";

export async function GET(request: Request) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${siteOrigin(request)}/login`, "Set-Cookie": cookieHeader(SESSION_COOKIE, "", { maxAge: 0 }) },
  });
}
