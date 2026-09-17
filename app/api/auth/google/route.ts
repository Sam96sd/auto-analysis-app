import { authSecret, cookieHeader, googleConfig, randomToken, siteOrigin, STATE_COOKIE } from "@/lib/auth";

/** يبدأ تسجيل الدخول: تحويل الزائر إلى صفحة Google */
export async function GET(request: Request) {
  const google = googleConfig();
  const origin = siteOrigin(request);
  if (!google || !authSecret()) {
    return Response.redirect(`${origin}/login?error=config`, 302);
  }
  const state = randomToken();
  const params = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: `${origin}/api/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      "Set-Cookie": cookieHeader(STATE_COOKIE, state, { maxAge: 600 }),
    },
  });
}
