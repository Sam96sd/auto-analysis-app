import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authSecret, googleConfig, readSession, SESSION_COOKIE } from "@/lib/auth";

/** يحمي كل صفحات الموقع وواجهة البيانات: الدخول بحساب Google مسموح في allowed-emails.ts فقط */
export async function proxy(request: NextRequest) {
  const secret = authSecret();
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (!secret || !googleConfig()) {
    // أثناء التطوير المحلي بدون إعدادات يبقى الموقع مفتوحاً
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    const msg = "الموقع مغلق: لم يتم ضبط AUTH_SECRET و GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في إعدادات الاستضافة.";
    return isApi
      ? Response.json({ error: msg }, { status: 503 })
      : new NextResponse(
          `<html dir="rtl"><body style="background:#0e1621;color:#fff;font-family:sans-serif;display:grid;place-items:center;height:100vh;padding:16px;text-align:center">${msg}</body></html>`,
          { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
        );
  }

  if (await readSession(secret, request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (isApi) {
    return Response.json({ error: "يجب تسجيل الدخول.", auth: true }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // كل المسارات ما عدا: صفحة الدخول، مسارات Google، ملفات Next الثابتة، الأيقونة و robots
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
