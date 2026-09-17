import type { AnalysisReport, Level, TimeframeSnapshot } from "@/lib/types";

export const fmt = (n: number | null | undefined, d: number) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function Num({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`num font-mono ${className}`}>{children}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 border-t border-white/5 pt-3.5 first:border-0 first:pt-0">
      <h3 className="text-[13px] font-bold text-tg-accent">{title}</h3>
      {children}
    </section>
  );
}

const trendColor = (t: string) => (t === "صاعد" ? "text-emerald-400" : t === "هابط" ? "text-rose-400" : "text-amber-300");

/* ------------------------------------------------------------------ */

export function ReportHeader({ r, localTime }: { r: AnalysisReport; localTime: string }) {
  const d = r.asset.decimals;
  const up = r.changePct >= 0;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">
          📊 تحليل <Num>{r.asset.symbol}</Num>
          <span className="mr-2 rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-normal text-tg-muted">إطار {r.primaryTf}</span>
        </h2>
        <SourceBadge r={r} />
      </div>
      <p className="text-xs text-tg-muted">🗓️ {localTime || "…"}</p>
      <div className="flex items-baseline gap-3">
        <Num className="text-3xl font-bold tracking-tight text-white">{fmt(r.price, d)}</Num>
        <Num className={`text-sm font-semibold ${up ? "text-emerald-400" : "text-rose-400"}`}>
          {up ? "▲ +" : "▼ "}
          {r.changePct.toFixed(2)}%
        </Num>
      </div>
    </div>
  );
}

function SourceBadge({ r }: { r: AnalysisReport }) {
  const map = {
    twelvedata: { label: "بيانات حية", cls: "bg-emerald-500/15 text-emerald-300" },
    yahoo: { label: "بيانات حقيقية (قد تتأخر)", cls: "bg-sky-500/15 text-sky-300" },
    demo: { label: "وضع تجريبي", cls: "bg-amber-500/15 text-amber-300" },
  } as const;
  const s = map[r.source];
  return (
    <span title={r.sourceNote} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
      ● {s.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */

export function ReportBody({ r }: { r: AnalysisReport }) {
  const d = r.asset.decimals;
  const s = r.summary;
  const z = r.zones;
  const toneCls = {
    wait: "border-amber-400/30 bg-amber-400/5",
    caution: "border-orange-400/30 bg-orange-400/5",
    ok: "border-emerald-400/30 bg-emerald-400/5",
  }[r.recommendation.tone];

  return (
    <div className="space-y-4 text-[13.5px] leading-7">
      {r.source === "demo" && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-6 text-amber-200">{r.sourceNote}</p>
      )}

      <Section title="🧭 الخلاصة التنفيذية">
        <ul className="space-y-0.5">
          <li>• الاتجاه العام: <b className={trendColor(s.trend)}>{s.trend}</b></li>
          <li>• الزخم: <b>{s.momentum}</b></li>
          <li>
            • التذبذب (ATR): <Num className="font-bold">{fmt(s.volatility.atr, d)}</Num>{" "}
            <span className="text-tg-muted">(<Num>{s.volatility.atrPct}%</Num> — {s.volatility.label})</span>
          </li>
          <li>• حالة السوق: <b>{s.marketState}</b></li>
        </ul>

        <div className="rounded-lg bg-black/20 p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-tg-muted">درجة التوافق لدعم الاتجاه <b className={trendColor(s.direction)}>{s.direction}</b></span>
            <Num className="font-bold text-tg-accent">{s.confluence}%</Num>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-700 ${s.confluence >= 60 ? "bg-emerald-400" : "bg-amber-400"}`}
              style={{ width: `${s.confluence}%` }}
            />
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs text-tg-muted">التفكيك بالمكونات:</p>
          <ul className="space-y-1">
            {s.components.map((c) => (
              <li key={c.name} className="flex gap-2">
                <span aria-hidden>{c.mark}</span>
                <span>
                  <b>{c.name}</b> <span className="text-xs text-tg-muted">— {c.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="rounded-lg bg-white/5 px-3 py-2 text-xs leading-6">
          🕐 <b>ملاحظة الجلسة:</b> {s.session.name} — السيولة المتوقعة <b>{s.session.liquidity}</b>. {s.session.note}
        </p>
      </Section>

      <Section title="📍 المناطق المهمة">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <LevelCard label="المقاومة الأقرب" level={z.nearestResistance} d={d} tone="res" strong />
          <LevelCard label="الدعم الأقرب" level={z.nearestSupport} d={d} tone="sup" strong />
          {z.nextResistances.map((l, i) => (
            <LevelCard key={`r${i}`} label={`مقاومة تالية ${i + 1}`} level={l} d={d} tone="res" />
          ))}
          {z.nextSupports.map((l, i) => (
            <LevelCard key={`s${i}`} label={`دعم تالٍ ${i + 1}`} level={l} d={d} tone="sup" />
          ))}
        </div>
        <p className="text-xs leading-6 text-slate-300">
          💧 <b>منطقة السيولة:</b> {z.liquidityNarrative}
        </p>
      </Section>

      <Section title="🔀 السيناريوهات الشرطية">
        <div className="space-y-2">
          <p className="rounded-lg border-r-2 border-emerald-400 bg-emerald-400/5 px-3 py-2">
            <b className="text-emerald-400">📈 السيناريو الإيجابي: </b>
            {r.scenarios.bullish}
          </p>
          <p className="rounded-lg border-r-2 border-rose-400 bg-rose-400/5 px-3 py-2">
            <b className="text-rose-400">📉 السيناريو الهابط: </b>
            {r.scenarios.bearish}
          </p>
        </div>
      </Section>

      <Section title="🤔 هل الانتظار أفضل؟">
        <div className={`rounded-lg border px-3 py-2 ${toneCls}`}>
          <p className="font-bold">{r.recommendation.title}</p>
          <p className="text-xs leading-6 text-slate-300">{r.recommendation.text}</p>
        </div>
      </Section>

      <Section title="🧠 سبب الترجيح الفني">
        <p className="text-slate-300">{r.justification}</p>
      </Section>
    </div>
  );
}

function LevelCard({ label, level, d, tone, strong }: { label: string; level: Level; d: number; tone: "sup" | "res"; strong?: boolean }) {
  const color = tone === "res" ? "text-rose-300" : "text-emerald-300";
  return (
    <div className={`rounded-lg p-2 ${strong ? "bg-white/[0.07] ring-1 ring-white/10" : "bg-black/20"}`}>
      <div className="text-[11px] text-tg-muted">{label}</div>
      <Num className={`block text-sm font-bold ${color}`}>{fmt(level.price, d)}</Num>
      <div className="truncate text-[10px] text-tg-muted" title={level.source}>
        <Num>{level.distancePct}%</Num> · {level.source}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ExtraIndicators({ r }: { r: AnalysisReport }) {
  const d = r.asset.decimals;
  const p = r.timeframes.find((t) => t.tf === r.primaryTf)!;
  return (
    <div className="space-y-3 text-[13px]">
      <h3 className="font-bold text-tg-accent">⚡ مؤشرات مكملة — إطار {r.primaryTf}</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Kv k="MACD" v={fmt(p.macd, d)} />
        <Kv k="إشارة MACD" v={fmt(p.macdSignal, d)} />
        <Kv k="هيستوجرام" v={fmt(p.macdHist, d)} tone={(p.macdHist ?? 0) >= 0 ? "up" : "down"} />
        <Kv k="+DI / −DI" v={`${fmt(p.plusDI, 1)} / ${fmt(p.minusDI, 1)}`} />
        <Kv k="بولنجر العلوي" v={fmt(p.bbUpper, d)} />
        <Kv k="بولنجر السفلي" v={fmt(p.bbLower, d)} />
        <Kv k="نقطة الارتكاز اليومية" v={fmt(r.zones.pivot, d)} />
        <Kv k="SMA200 يومي" v={fmt(r.timeframes.find((t) => t.tf === "D1")?.sma200, d)} />
      </div>
      <div>
        <p className="mb-1 text-xs text-tg-muted">
          فيبوناتشي (آخر 100 شمعة: قمة <Num>{fmt(r.fibonacci.swingHigh, d)}</Num> — قاع <Num>{fmt(r.fibonacci.swingLow, d)}</Num>)
        </p>
        <div className="grid grid-cols-5 gap-1 text-center text-[11px]">
          {r.fibonacci.levels.map((l) => (
            <div key={l.ratio} className="rounded bg-black/20 p-1">
              <Num className="block text-tg-muted">{l.ratio}</Num>
              <Num className="block font-semibold">{fmt(l.price, d)}</Num>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kv({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-center justify-between rounded bg-black/20 px-2 py-1.5">
      <span className="text-tg-muted">{k}</span>
      <Num className={`font-semibold ${tone === "up" ? "text-emerald-400" : tone === "down" ? "text-rose-400" : ""}`}>{v}</Num>
    </div>
  );
}

export function MultiTimeframe({ r }: { r: AnalysisReport }) {
  const d = r.asset.decimals;
  const rows: { label: string; get: (t: TimeframeSnapshot) => React.ReactNode }[] = [
    { label: "الاتجاه", get: (t) => <b className={trendColor(t.bias)}>{t.bias}</b> },
    { label: "EMA20", get: (t) => <Num>{fmt(t.ema20, d)}</Num> },
    { label: "EMA50", get: (t) => <Num>{fmt(t.ema50, d)}</Num> },
    { label: "SMA200", get: (t) => <Num>{fmt(t.sma200, d)}</Num> },
    { label: "RSI 14", get: (t) => <Num>{fmt(t.rsi, 1)}</Num> },
    { label: "ADX 14", get: (t) => <Num>{fmt(t.adx, 1)}</Num> },
    { label: "ATR 14", get: (t) => <Num>{fmt(t.atr, d)}</Num> },
    { label: "MACD Hist", get: (t) => <Num className={(t.macdHist ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmt(t.macdHist, d)}</Num> },
  ];
  return (
    <div className="space-y-2 text-[13px]">
      <h3 className="font-bold text-tg-accent">🕐 قراءة متعددة الفريمات</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-tg-muted">
              <th className="p-1.5 text-right font-medium">المؤشر</th>
              {r.timeframes.map((t) => (
                <th key={t.tf} className="p-1.5 text-center font-medium">{t.tf === "D1" ? "يومي" : t.tf === "M15" ? "15د" : t.tf}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-white/5">
                <td className="p-1.5 text-tg-muted">{row.label}</td>
                {r.timeframes.map((t) => (
                  <td key={t.tf} className="p-1.5 text-center">{row.get(t)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ExtendedAnalysis({ r }: { r: AnalysisReport }) {
  return (
    <div className="space-y-2 text-[13px] leading-7">
      <h3 className="font-bold text-tg-accent">📖 التحليل الموسّع</h3>
      <ul className="space-y-1 text-slate-300">
        {r.extended.map((line, i) => (
          <li key={i}>• {line}</li>
        ))}
      </ul>
      <p className="text-[11px] text-tg-muted">مصدر البيانات: {r.sourceNote}</p>
    </div>
  );
}
