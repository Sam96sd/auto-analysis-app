/**
 * جلب بيانات الشموع (OHLCV) من مزودات متعددة مع احتياطي:
 *   1) Twelve Data  — إذا وُجد TWELVE_DATA_API_KEY (سعر فوري XAU/USD).
 *   2) Yahoo Finance — بدون مفتاح (الذهب/الفضة عبر العقود الآجلة GC=F / SI=F).
 *   3) بيانات تجريبية — عند فشل المزودين، مع تنبيه واضح في الواجهة.
 */
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

const HOUR = 3_600_000;
const CACHE_TTL_MS = 55_000;
const cache = new Map<string, { at: number; data: MarketData }>();

export async function fetchMarketData(asset: AssetConfig): Promise<MarketData> {
  const hit = cache.get(asset.key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const errors: string[] = [];
  const key = process.env.TWELVE_DATA_API_KEY?.trim();

  if (key) {
    try {
      const data = await fromTwelveData(asset, key);
      cache.set(asset.key, { at: Date.now(), data });
      return data;
    } catch (e) {
      errors.push(`Twelve Data: ${(e as Error).message}`);
    }
  }

  if (process.env.DISABLE_YAHOO !== "1") {
    try {
      const data = await fromYahoo(asset);
      cache.set(asset.key, { at: Date.now(), data });
      return data;
    } catch (e) {
      errors.push(`Yahoo: ${(e as Error).message}`);
    }
  }

  const data = demoData(asset);
  data.sourceNote =
    "⚠️ بيانات تجريبية (غير حقيقية) — تعذّر الاتصال بمزودي البيانات" +
    (errors.length ? ` (${errors.join(" | ")})` : "");
  console.warn("[market-data] fallback to demo:", errors.join(" | "));
  return data;
}

/* ---------------------------------- Twelve Data ---------------------------------- */

interface TDValue { datetime: string; open: string; high: string; low: string; close: string; volume?: string }
interface TDResponse { status?: string; code?: number; message?: string; values?: TDValue[] }

async function tdSeries(symbol: string, interval: string, size: number, key: string): Promise<Candle[]> {
  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}&outputsize=${size}&timezone=UTC&order=ASC&apikey=${key}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as TDResponse;
  if (json.status === "error" || !json.values) throw new Error(json.message ?? "استجابة غير صالحة");
  const candles = json.values
    .map((v) => ({
      t: Date.parse(v.datetime.length <= 10 ? `${v.datetime}T00:00:00Z` : `${v.datetime.replace(" ", "T")}Z`),
      o: +v.open,
      h: +v.high,
      l: +v.low,
      c: +v.close,
      v: v.volume ? +v.volume : 0,
    }))
    .filter((k) => Number.isFinite(k.t) && Number.isFinite(k.c));
  return candles.sort((a, b) => a.t - b.t);
}

async function fromTwelveData(asset: AssetConfig, key: string): Promise<MarketData> {
  const [m15, h1, h4, d1] = await Promise.all([
    tdSeries(asset.twelveSymbol, "15min", 300, key),
    tdSeries(asset.twelveSymbol, "1h", 300, key),
    tdSeries(asset.twelveSymbol, "4h", 300, key),
    tdSeries(asset.twelveSymbol, "1day", 300, key),
  ]);
  assertEnough(m15, h1, h4, d1);
  return {
    source: "twelvedata",
    sourceNote: "بيانات حية من Twelve Data (سعر فوري)",
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
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; auto-analysis-app/1.0)", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as YahooChart;
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
  return { candles, price: r.meta?.regularMarketPrice };
}

async function fromYahoo(asset: AssetConfig): Promise<MarketData> {
  const [quarter, hourly, daily] = await Promise.all([
    yahooSeries(asset.yahooSymbol, "15m", "10d"),
    yahooSeries(asset.yahooSymbol, "1h", "60d"),
    yahooSeries(asset.yahooSymbol, "1d", "2y"),
  ]);
  const h1 = hourly.candles;
  const h4 = aggregate(h1, 4 * HOUR);
  const d1 = daily.candles;
  const m15 = quarter.candles;
  assertEnough(m15, h1, h4, d1);
  const price = quarter.price ?? hourly.price ?? m15[m15.length - 1].c;
  const futures = asset.yahooSymbol.endsWith("=F");
  return {
    source: "yahoo",
    sourceNote: futures
      ? `بيانات Yahoo Finance (عقود ${asset.yahooSymbol} الآجلة — قد تختلف قليلاً عن السعر الفوري وقد تتأخر حتى 15 دقيقة)`
      : "بيانات Yahoo Finance (قد تتأخر حتى 15 دقيقة)",
    price,
    m15,
    h1,
    h4,
    d1,
  };
}

/** تجميع شموع الساعة إلى شموع أكبر (مثل H4) حسب حدود توقيت UTC */
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

/* ---------------------------------- Demo ---------------------------------- */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** سلسلة سعرية اصطناعية ثابتة لكل ساعة (لا تتغير عشوائياً مع كل تحديث) */
export function demoData(asset: AssetConfig): MarketData {
  const Q = 15 * 60_000;
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
  // حركة بسيطة داخل الدقيقة الحالية حتى يبدو السعر حياً
  const lastC = m15All[m15All.length - 1];
  lastC.c += Math.sin(Date.now() / 60_000) * asset.demoPrice * 0.0004;
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
