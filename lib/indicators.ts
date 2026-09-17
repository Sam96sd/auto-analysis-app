/**
 * مكتبة مؤشرات فنية خفيفة بدون اعتماديات خارجية.
 * كل دالة تُرجع مصفوفة بنفس طول المدخلات، والقيم غير المتاحة تكون NaN.
 */
import type { Candle } from "./types";

const nanArray = (n: number) => new Array<number>(n).fill(NaN);

export function sma(values: number[], period: number): number[] {
  const out = nanArray(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA تبدأ من أول قيمة صالحة (غير NaN) وتُهيّأ بمتوسط بسيط */
export function ema(values: number[], period: number): number[] {
  const out = nanArray(values.length);
  const start = values.findIndex((v) => !Number.isNaN(v));
  if (start < 0 || values.length - start < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = start; i < start + period; i++) seed += values[i];
  let prev = seed / period;
  out[start + period - 1] = prev;
  for (let i = start + period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** RSI بطريقة Wilder */
export function rsi(closes: number[], period = 14): number[] {
  const out = nanArray(closes.length);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const calc = () => (avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = calc();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = calc();
  }
  return out;
}

function trueRange(c: Candle[]): number[] {
  return c.map((k, i) =>
    i === 0 ? k.h - k.l : Math.max(k.h - k.l, Math.abs(k.h - c[i - 1].c), Math.abs(k.l - c[i - 1].c)),
  );
}

/** ATR بطريقة Wilder */
export function atr(c: Candle[], period = 14): number[] {
  const out = nanArray(c.length);
  if (c.length <= period) return out;
  const tr = trueRange(c);
  let prev = 0;
  for (let i = 1; i <= period; i++) prev += tr[i];
  prev /= period;
  out[period] = prev;
  for (let i = period + 1; i < c.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** ADX مع +DI و -DI بطريقة Wilder */
export function adx(c: Candle[], period = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const n = c.length;
  const res = { adx: nanArray(n), plusDI: nanArray(n), minusDI: nanArray(n) };
  if (n < period * 2 + 1) return res;
  const tr = trueRange(c);
  const pdm = new Array<number>(n).fill(0);
  const mdm = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = c[i].h - c[i - 1].h;
    const down = c[i - 1].l - c[i].l;
    pdm[i] = up > down && up > 0 ? up : 0;
    mdm[i] = down > up && down > 0 ? down : 0;
  }
  let sTR = 0, sP = 0, sM = 0;
  for (let i = 1; i <= period; i++) {
    sTR += tr[i];
    sP += pdm[i];
    sM += mdm[i];
  }
  const dx = nanArray(n);
  for (let i = period; i < n; i++) {
    if (i > period) {
      sTR = sTR - sTR / period + tr[i];
      sP = sP - sP / period + pdm[i];
      sM = sM - sM / period + mdm[i];
    }
    const p = sTR === 0 ? 0 : (100 * sP) / sTR;
    const m = sTR === 0 ? 0 : (100 * sM) / sTR;
    res.plusDI[i] = p;
    res.minusDI[i] = m;
    dx[i] = p + m === 0 ? 0 : (100 * Math.abs(p - m)) / (p + m);
  }
  const first = period * 2 - 1;
  let prev = 0;
  for (let i = period; i <= first; i++) prev += dx[i];
  prev /= period;
  res.adx[first] = prev;
  for (let i = first + 1; i < n; i++) {
    prev = (prev * (period - 1) + dx[i]) / period;
    res.adx[i] = prev;
  }
  return res;
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = closes.map((_, i) => f[i] - s[i]);
  const sig = ema(line, signal);
  const hist = line.map((v, i) => v - sig[i]);
  return { line, signal: sig, hist };
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper = nanArray(closes.length);
  const lower = nanArray(closes.length);
  for (let i = period - 1; i < closes.length; i++) {
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(v / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { upper, middle: mid, lower };
}

/** نقاط الارتكاز الكلاسيكية من شمعة يومية مكتملة */
export function classicPivots(h: number, l: number, c: number) {
  const p = (h + l + c) / 3;
  return {
    p,
    r1: 2 * p - l,
    s1: 2 * p - h,
    r2: p + (h - l),
    s2: p - (h - l),
    r3: h + 2 * (p - l),
    s3: l - 2 * (h - p),
  };
}

/** القمم والقيعان (Fractals) بنافذة k شمعة على كل جانب */
export function swingPoints(c: Candle[], k = 3) {
  const highs: { i: number; price: number }[] = [];
  const lows: { i: number; price: number }[] = [];
  for (let i = k; i < c.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (c[j].h >= c[i].h) isHigh = false;
      if (c[j].l <= c[i].l) isLow = false;
    }
    if (isHigh) highs.push({ i, price: c[i].h });
    if (isLow) lows.push({ i, price: c[i].l });
  }
  return { highs, lows };
}

export const last = (arr: number[]): number | null => {
  const v = arr[arr.length - 1];
  return v === undefined || Number.isNaN(v) ? null : v;
};
