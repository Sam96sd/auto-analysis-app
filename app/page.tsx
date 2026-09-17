"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExtendedAnalysis, ExtraIndicators, MultiTimeframe, ReportBody, ReportHeader } from "@/components/Report";
import type { AnalysisReport, AssetKey, Timeframe } from "@/lib/types";

const ASSET_OPTIONS: { key: AssetKey; label: string; symbol: string }[] = [
  { key: "XAU_USD", label: "الذهب", symbol: "XAU/USD" },
  { key: "XAG_USD", label: "الفضة", symbol: "XAG/USD" },
  { key: "BTC_USD", label: "البيتكوين", symbol: "BTC/USD" },
  { key: "EUR_USD", label: "اليورو", symbol: "EUR/USD" },
];
const TF_OPTIONS: { key: Timeframe; label: string }[] = [
  { key: "H1", label: "ساعة" },
  { key: "H4", label: "4 ساعات" },
  { key: "D1", label: "يومي" },
];
const REFRESH_MS = 60_000;

type Panel = "extra" | "mtf" | "extended";

/** يجلب التقرير من API Route الخاص بالتطبيق */
async function fetchMarketData(asset: AssetKey, tf: Timeframe, signal?: AbortSignal): Promise<AnalysisReport> {
  const res = await fetch(`/api/analysis?asset=${asset}&tf=${tf}`, { cache: "no-store", signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json as AnalysisReport;
}

function useLocalClock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const format = new Intl.DateTimeFormat("ar", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      numberingSystem: "latn",
      timeZoneName: "short",
    });
    const tick = () => setNow(format.format(new Date()));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now;
}

export default function Home() {
  const [asset, setAsset] = useState<AssetKey>("XAU_USD");
  const [tf, setTf] = useState<Timeframe>("H4");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const localTime = useLocalClock();
  const bottomRef = useRef<HTMLDivElement>(null);

  const requestKey = `${asset}|${tf}`;
  const reportKey = report ? `${report.asset.key}|${report.primaryTf}` : "";
  const loading = reportKey !== requestKey && error?.key !== requestKey;

  useEffect(() => {
    const ctrl = new AbortController();
    const key = `${asset}|${tf}`;
    fetchMarketData(asset, tf, ctrl.signal)
      .then((r) => {
        setReport(r);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError({ key, message: e.message });
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setRefreshing(false);
      });
    return () => ctrl.abort();
  }, [asset, tf, reloadKey]);

  useEffect(() => {
    if (!autoUpdate) return;
    const id = setInterval(() => setReloadKey((k) => k + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, [autoUpdate]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
  }, []);

  const togglePanel = (p: Panel) => {
    setPanels((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
  };

  const symbol = ASSET_OPTIONS.find((a) => a.key === asset)!.symbol;
  const showReport = report && !loading;
  const updatedAt = report
    ? new Date(report.generatedAt).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit", numberingSystem: "latn" })
    : "";

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col border-white/5 bg-tg-bg md:border-x">
      {/* رأس المحادثة */}
      <header className="z-10 flex items-center gap-3 bg-tg-panel px-3 py-2.5 shadow-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-600 text-xl">
          🤖
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold">بوت التحليل الفني الآلي</h1>
          <p className="truncate text-xs text-tg-accent">
            {loading || refreshing ? (
              <span className="typing">
                يكتب<span>.</span><span>.</span><span>.</span>
              </span>
            ) : (
              "متصل الآن"
            )}
          </p>
        </div>
        <button
          onClick={refresh}
          className="rounded-full p-2 text-lg text-tg-muted transition hover:bg-white/5 hover:text-white"
          title="تحديث التحليل"
          aria-label="تحديث التحليل"
        >
          🔄
        </button>
      </header>

      {/* اختيار الأصل والإطار الزمني */}
      <div className="flex flex-wrap items-center gap-2 border-b border-black/30 bg-tg-panel/70 px-3 py-2">
        <div className="flex gap-1 overflow-x-auto">
          {ASSET_OPTIONS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAsset(a.key)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs transition ${
                asset === a.key ? "bg-tg-accent font-bold text-slate-900" : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="mr-auto flex gap-1">
          {TF_OPTIONS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTf(t.key)}
              className={`rounded-md px-2 py-1 text-[11px] transition ${
                tf === t.key ? "bg-white/15 font-bold text-white" : "text-tg-muted hover:text-white"
              }`}
            >
              {t.key} <span className="hidden sm:inline">({t.label})</span>
            </button>
          ))}
        </div>
      </div>

      {/* منطقة الرسائل */}
      <main className="chat-wallpaper flex-1 overflow-y-auto px-2.5 py-4 sm:px-4">
        <div className="space-y-3">
          <div className="mx-auto w-fit rounded-full bg-black/30 px-3 py-1 text-[11px] text-slate-300">اليوم</div>

          {/* رسالة المستخدم */}
          <div className="flex justify-start">
            <div dir="ltr" className="max-w-[80%] rounded-2xl rounded-tr-sm bg-tg-user px-3 py-2 font-mono text-sm shadow">
              /analyze {symbol} {tf}
            </div>
          </div>

          {/* رسالة البوت */}
          <div className="flex justify-end">
            <div className="w-full max-w-[640px] rounded-2xl rounded-tl-sm bg-tg-bubble px-3.5 py-3 shadow sm:px-4">
              {showReport ? (
                <div key={reportKey} className="animate-fade-in space-y-4">
                  <ReportHeader r={report} localTime={localTime} />
                  <ReportBody r={report} />
                  <p className="text-left text-[10px] text-tg-muted">
                    آخر تحديث <span className="num">{updatedAt}</span> ✓✓
                  </p>
                </div>
              ) : error?.key === requestKey ? (
                <div className="space-y-2 text-sm">
                  <p className="text-rose-300">❌ {error.message}</p>
                  <button onClick={refresh} className="rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/15">
                    إعادة المحاولة
                  </button>
                </div>
              ) : (
                <div className="space-y-3 py-2">
                  <p className="text-sm text-tg-muted">
                    ⏳ جارٍ جلب بيانات السوق وحساب المؤشرات لـ <span className="num">{symbol}</span>…
                  </p>
                  {[80, 95, 60, 90, 70].map((w, i) => (
                    <div key={i} className="h-3 animate-pulse rounded bg-white/5" style={{ width: `${w}%` }} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* أزرار تفاعلية بأسلوب Inline Keyboard */}
          {showReport && (
            <div className="mr-auto grid w-full max-w-[640px] grid-cols-3 gap-1">
              {(
                [
                  ["extra", "⚡ مؤشرات مكملة"],
                  ["mtf", "🕐 فريمات متعددة"],
                  ["extended", "📖 توسيع التحليل"],
                ] as [Panel, string][]
              ).map(([p, label]) => (
                <button
                  key={p}
                  onClick={() => togglePanel(p)}
                  className={`rounded-lg px-1 py-2 text-[11.5px] font-medium backdrop-blur transition sm:text-xs ${
                    panels.includes(p) ? "bg-tg-accent/30 text-white" : "bg-tg-bubble/80 text-slate-200 hover:bg-tg-user"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {showReport &&
            panels.map((p) => (
              <div key={p} className="flex justify-end">
                <div className="animate-fade-in w-full max-w-[640px] rounded-2xl rounded-tl-sm bg-tg-bubble px-3.5 py-3 shadow sm:px-4">
                  {p === "extra" && <ExtraIndicators r={report} />}
                  {p === "mtf" && <MultiTimeframe r={report} />}
                  {p === "extended" && <ExtendedAnalysis r={report} />}
                </div>
              </div>
            ))}

          <p className="mx-auto max-w-lg px-4 pt-2 text-center text-[10px] leading-5 text-tg-muted">
            إخلاء مسؤولية: هذا التقرير مولَّد آلياً من مؤشرات فنية رياضية ولا يُعد نصيحة استثمارية. التداول بالرافعة المالية
            ينطوي على مخاطر عالية وقرار التداول مسؤولية المستخدم وحده.
          </p>
          <div ref={bottomRef} />
        </div>
      </main>

      {/* الشريط السفلي */}
      <footer className="flex items-center gap-3 bg-tg-panel px-3 py-2.5 text-xs">
        <label className="flex cursor-pointer items-center gap-2 text-tg-muted">
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(e) => setAutoUpdate(e.target.checked)}
            className="h-4 w-4 accent-sky-400"
          />
          تحديث تلقائي كل دقيقة
        </label>
        <span className="mr-auto truncate text-tg-muted">{report ? report.sourceNote.split(" (")[0] : ""}</span>
      </footer>
    </div>
  );
}
