/**
 * جلب بيانات الشموع (OHLCV) مع احتياطي وذاكرة مشتركة بين كل الزوار.
 *
 *   1) Twelve Data  — طلبان فقط لكل أصل: شموع 15 دقيقة (5000 شمعة، تُشتق منها H1 و H4)
 *                     + الشموع اليومية. تُحفظ في ذاكرة Next.js المشتركة:
 *                     15 دقيقة كل دقيقتين، واليومي كل ساعة ⇐ الاستهلاك لا يزيد بزيادة الزوار.
 *   2) Binance      — احتياطي مجاني بلا مفتاح (الذهب عبر PAXG، البيتكوين، اليورو).
 *   3) Yahoo Finance — احتياطي أخير (مفيد للفضة).
 *   البيانات التجريبية تعمل فقط أثناء التطوير المحلي، وفي الإنتاج يظهر خطأ واضح.
 */
import { unstable_cache } from "next/cache";
import type { AssetConfig } from "./assets";
import type { Candle, DataSource } from "./types";

export interface MarketData {
  source: DataSource;
  sourceNote: string;
  price: number;
  m15: Candle[];
  h1: Candle[];
  h4: Candle[];
  d1: Candle[];
}

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** مدة صلاحية البيانات في الذاكرة المشتركة */
const TD_INTRADAY_TTL_S = 120;
const TD_DAILY_TTL_S = 3600;
const BINANCE_TTL_S = 60;
const YAHOO_TTL_S = 120;

/** رقم «نافذة زمنية» يدخل في مفتاح الذاكرة: كل نافذة جديدة = جلب جديد مرة واحدة فقط لكل الزوار */
const bucket = (seconds: number) => Math.floor(Date.now() / (seconds * 1000));

export class MarketDataUnavailableError extends Error {}

/** آخر بيانات ناجحة لكل أصل — تُعرض (مع تنبيه) إذا فشلت كل المصادر مؤقتاً */
const LAST_GOOD_MAX_AGE_MS = 15 * MINUTE;
const lastGood = new Map<string, { at: number; data: MarketData }>();

export async function fetchMarketData(asset: AssetConfig): Promise<MarketData> {
  try {
    const data = await fetchFromProviders(asset);
    if (data.source !== "demo") lastGood.set(asset.key, { at: Date.now(), data });
    return data;
  } catch (e) {
    const prev = lastGood.get(asset.key);
    if (prev && Date.now() - prev.at < LAST_GOOD_MAX_AGE_MS) {
      const mins = Math.max(1, Math.round((Date.now() - prev.at) / MINUTE));
      return { ...prev.data, sourceNote: `${prev.data.sourceNote} — ⚠️ آخر بيانات متوفرة منذ ${mins} دقيقة (المصادر غير متاحة مؤقتاً)` };
    }
    throw e;
  }
}

async function fetchFromProviders(asset: AssetConfig): Promise<MarketData> {
  const errors: string[] = [];
  const key = process.env.TWELVE_DATA_API_KEY?.trim();

  if (key) {
    // عند وجود البيانات في الذاكرة المشتركة لا يُستهلك أي رصيد؛ وعند نفاد الحد يفشل الطلب سريعاً دون استهلاك
    try {
      return await fromTwelveData(asset);
    } catch (e) {
      errors.push(`Twelve Data: ${(e as Error).message}`);
    }
  }

  if (asset.binanceSymbol && process.env.DISABLE_BINANCE !== "1") {
    try {
      return await fromBinance(asset);
    } catch (e) {
      errors.push(`Binance: ${(e as Error).message}`);
    }
  }

  if (process.env.DISABLE_YAHOO !== "1") {
    try {
      return await fromYahoo(asset);
    } catch (e) {
      errors.push(`Yahoo: ${(e as Error).message}`);
    }
  }

  console.warn(`[market-data] ${asset.key} all providers failed:`, errors.join(" | "));

  if (process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1") {
    const data = demoData(asset);
    data.sourceNote = `⚠️ بيانات تجريبية (غير حقيقية) — تعذّر الاتصال بمزودي البيانات (${errors.join(" | ") || "لا يوجد مزود مفعّل"})`;
    return data;
  }
  throw new MarketDataUnavailableError(
    "تعذّر جلب بيانات السوق حالياً (قد يكون حد الطلبات المجاني قد نفد مؤقتاً). حاول بعد دقيقة.",
  );
}

/* ---------------------------------- أدوات ---------------------------------- */

async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000), headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** تجميع شموع صغيرة إلى شموع أكبر حسب حدود توقيت UTC */
export function aggregate(candles: Candle[], bucketMs: number): Candle[] {
  const out: Candle[] = [];
  for (const k of candles) {
    const t = Math.floor(k.t / bucketMs) * bucketMs;
    const cur = out[out.length - 1];
    if (cur && cur.t === t) {
      cur.h = Math.max(cur.h, k.h);
      cur.l = Math.min(cur.l, k.l);
      cur.c = k.c;
      cur.v += k.v;
    } else {
      out.push({ ...k, t });
    }
  }
  return out;
}

function assertEnough(m15: Candle[], h1: Candle[], h4: Candle[], d1: Candle[]) {
  if (m15.length < 60 || h1.length < 60 || h4.length < 60 || d1.length < 60) {
    throw new Error(`بيانات تاريخية غير كافية (M15=${m15.length}, H1=${h1.length}, H4=${h4.length}, D1=${d1.length})`);
  }
}

/* ---------------------------------- Twelve Data ---------------------------------- */

interface TDValue { datetime: string; open: string; high: string; low: string; close: string; volume?: string }
interface TDResponse { status?: string; code?: number; message?: string; values?: TDValue[] }

async function tdSeries(symbol: string, interval: string, size: number): Promise<Candle[]> {
  const key = process.env.TWELVE_DATA_API_KEY?.trim() ?? "";
  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}&outputsize=${size}&timezone=UTC&order=ASC&apikey=${key}`;
  const json = await getJson<TDResponse>(url);
  // Twelve Data يُرجع أخطاء الحد (429) بحالة HTTP 200 داخل JSON — نرمي خطأ حتى لا يُحفظ في الذاكرة
  if (json.status === "error" || !json.values) throw new Error(json.message ?? `code ${json.code ?? "?"}`);
  return json.values
    .map((v) => ({
      t: Date.parse(v.datetime.length <= 10 ? `${v.datetime}T00:00:00Z` : `${v.datetime.replace(" ", "T")}Z`),
      o: +v.open,
      h: +v.high,
      l: +v.low,
      c: +v.close,
      v: v.volume ? +v.volume : 0,
    }))
    .filter((k) => Number.isFinite(k.t) && Number.isFinite(k.c))
    .sort((a, b) => a.t - b.t);
}

/** طلب 1: شموع 15 دقيقة (5000 شمعة ≈ 52 يوماً) — مشتركة لكل الزوار لمدة دقيقتين */
const tdIntradayCached = unstable_cache(
  (symbol: string, _bucket: number) => tdSeries(symbol, "15min", 5000),
  ["td-15min-v1"],
  { revalidate: TD_INTRADAY_TTL_S * 2 },
);

/** طلب 2: الشموع اليومية — مشتركة لكل الزوار لمدة ساعة */
const tdDailyCached = unstable_cache(
  (symbol: string, _bucket: number) => tdSeries(symbol, "1day", 400),
  ["td-1day-v1"],
  { revalidate: TD_DAILY_TTL_S * 2 },
);

async function fromTwelveData(asset: AssetConfig): Promise<MarketData> {
  const [m15, d1] = await Promise.all([
    tdIntradayCached(asset.twelveSymbol, bucket(TD_INTRADAY_TTL_S)),
    tdDailyCached(asset.twelveSymbol, bucket(TD_DAILY_TTL_S)),
  ]);
  const h1 = aggregate(m15, HOUR);
  const h4 = aggregate(m15, 4 * HOUR);
  assertEnough(m15, h1, h4, d1);
  return {
    source: "twelvedata",
    sourceNote: "بيانات حية من Twelve Data (سعر فوري، يتحدث كل دقيقتين)",
    price: m15[m15.length - 1].c,
    m15,
    h1,
    h4,
    d1,
  };
}

/* ---------------------------------- Binance ---------------------------------- */

/** [openTime, open, high, low, close, volume, closeTime, ...] */
type BinanceKline = [number, string, string, string, string, string, number, ...unknown[]];

async function binanceSeries(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  // نقطة البيانات العامة الرسمية الخاصة ببيانات السوق فقط (لا تحتاج مفتاحاً)
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const rows = await getJson<BinanceKline[]>(url);
  if (!Array.isArray(rows) || !rows.length) throw new Error("استجابة غير صالحة");
  return rows.map((r) => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
}

const binanceCached = unstable_cache(
  async (symbol: string, _bucket: number) => {
    const [m15, h1, h4, d1] = await Promise.all([
      binanceSeries(symbol, "15m", 1000),
      binanceSeries(symbol, "1h", 1000),
      binanceSeries(symbol, "4h", 500),
      binanceSeries(symbol, "1d", 500),
    ]);
    return { m15, h1, h4, d1 };
  },
  ["binance-v1"],
  { revalidate: BINANCE_TTL_S * 2 },
);

async function fromBinance(asset: AssetConfig): Promise<MarketData> {
  const { m15, h1, h4, d1 } = await binanceCached(asset.binanceSymbol!, bucket(BINANCE_TTL_S));
  assertEnough(m15, h1, h4, d1);
  return {
    source: "binance",
    sourceNote: `مصدر احتياطي: Binance (${asset.binanceNote})`,
    price: m15[m15.length - 1].c,
    m15,
    h1,
    h4,
    d1,
  };
}

/* ---------------------------------- Yahoo Finance ---------------------------------- */

interface YahooChart {
  chart?: {
    error?: { description?: string } | null;
    result?: {
      meta?: { regularMarketPrice?: number };
      timestamp?: number[];
      indicators?: { quote?: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume?: (number | null)[] }[] };
    }[];
  };
}

async function yahooSeries(symbol: string, interval: "15m" | "1h" | "1d", range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const json = await getJson<YahooChart>(url, {
    "User-Agent": "Mozilla/5.0 (compatible; auto-analysis-app/1.0)",
    Accept: "application/json",
  });
  const r = json.chart?.result?.[0];
  if (!r || !r.timestamp || !r.indicators?.quote?.[0]) {
    throw new Error(json.chart?.error?.description ?? "استجابة غير صالحة");
  }
  const q = r.indicators.quote[0];
  const candles: Candle[] = [];
  r.timestamp.forEach((ts, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || h == null || l == null || c == null) return;
    candles.push({ t: ts * 1000, o, h, l, c, v: q.volume?.[i] ?? 0 });
  });
  return { candles, price: r.meta?.regularMarketPrice ?? null };
}

const yahooCached = unstable_cache(
  async (symbol: string, _bucket: number) => {
    const [quarter, hourly, daily] = await Promise.all([
      yahooSeries(symbol, "15m", "10d"),
      yahooSeries(symbol, "1h", "60d"),
      yahooSeries(symbol, "1d", "2y"),
    ]);
    return { quarter, hourly, daily };
  },
  ["yahoo-v1"],
  { revalidate: YAHOO_TTL_S * 2 },
);

async function fromYahoo(asset: AssetConfig): Promise<MarketData> {
  const { quarter, hourly, daily } = await yahooCached(asset.yahooSymbol, bucket(YAHOO_TTL_S));
  const m15 = quarter.candles;
  const h1 = hourly.candles;
  const h4 = aggregate(h1, 4 * HOUR);
  const d1 = daily.candles;
  assertEnough(m15, h1, h4, d1);
  const futures = asset.yahooSymbol.endsWith("=F");
  return {
    source: "yahoo",
    sourceNote: futures
      ? `مصدر احتياطي: Yahoo Finance (عقود ${asset.yahooSymbol} الآجلة — قد تختلف قليلاً عن الفوري وتتأخر حتى 15 دقيقة)`
      : "مصدر احتياطي: Yahoo Finance (قد يتأخر حتى 15 دقيقة)",
    price: quarter.price ?? m15[m15.length - 1].c,
    m15,
    h1,
    h4,
    d1,
  };
}

/* ---------------------------------- Demo (للتطوير المحلي فقط) ---------------------------------- */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoData(asset: AssetConfig): MarketData {
  const Q = 15 * MINUTE;
  const nowQ = Math.floor(Date.now() / Q) * Q;
  const count = 96 * 400;
  const rand = mulberry32([...asset.key].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const vol = 0.0011;
  const raw: number[] = [];
  let p = 1;
  for (let i = 0; i < count; i++) {
    p *= 1 + (rand() - 0.5) * 2 * vol + Math.sin(i / 1200) * 0.0001;
    raw.push(p);
  }
  const scale = asset.demoPrice / raw[raw.length - 1];
  const m15All: Candle[] = raw.map((close, i) => {
    const c = close * scale;
    const o = (i ? raw[i - 1] : close) * scale;
    const wick = c * vol * rand();
    return { t: nowQ - (count - 1 - i) * Q, o, h: Math.max(o, c) + wick, l: Math.min(o, c) - wick, c, v: 0 };
  });
  const lastC = m15All[m15All.length - 1];
  lastC.c += Math.sin(Date.now() / MINUTE) * asset.demoPrice * 0.0004;
  lastC.h = Math.max(lastC.h, lastC.c);
  lastC.l = Math.min(lastC.l, lastC.c);
  const recent = m15All.slice(-96 * 60);
  return {
    source: "demo",
    sourceNote: "⚠️ بيانات تجريبية (غير حقيقية)",
    price: lastC.c,
    m15: m15All.slice(-96 * 5),
    h1: aggregate(recent, HOUR),
    h4: aggregate(recent, 4 * HOUR),
    d1: aggregate(m15All, 24 * HOUR),
  };
}
