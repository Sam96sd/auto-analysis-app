import { siteConfig } from "@/site.config";

const ERRORS: Record<string, string> = {
  not_allowed: "هذا الحساب غير مسموح له بالدخول.",
  state: "انتهت صلاحية محاولة الدخول، حاول مرة أخرى.",
  google: "تعذّر إكمال الدخول مع Google، حاول مرة أخرى.",
  config: "تسجيل الدخول غير مُعدّ بعد على الخادم.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const { error, email } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.google) : "";

  return (
    <main className="chat-wallpaper flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-5 rounded-3xl bg-tg-panel p-6 shadow-2xl">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-600 text-3xl">
            {siteConfig.botAvatar}
          </div>
          <h1 className="text-lg font-bold">{siteConfig.botName}</h1>
          <p className="text-sm text-tg-muted">🔒 الموقع خاص بالأعضاء المعتمدين فقط.</p>
        </div>

        {message && (
          <div className="space-y-1 rounded-xl bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-200">
            <p>{message}</p>
            {email && (
              <p dir="ltr" className="font-mono text-xs text-rose-300/80">
                {email}
              </p>
            )}
          </div>
        )}

        <a
          href="/api/auth/google"
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white py-3 font-bold text-slate-800 transition hover:bg-slate-100"
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          الدخول بحساب Google
        </a>

        <div className="space-y-2 border-t border-white/5 pt-4 text-center text-xs text-tg-muted">
          <p>{siteConfig.loginContactText}</p>
          {siteConfig.loginContactLink && (
            <a
              href={siteConfig.loginContactLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg bg-emerald-500/15 px-4 py-2 font-medium text-emerald-300 hover:bg-emerald-500/25"
            >
              💬 تواصل الآن
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
