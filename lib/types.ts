export type Candle = {
  /** بداية الشمعة بالميلي ثانية (UTC) */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type Timeframe = "M15" | "H1" | "H4" | "D1";

export type AssetKey = "XAU_USD" | "XAG_USD" | "BTC_USD" | "EUR_USD";

export type DataSource = "twelvedata" | "binance" | "yahoo" | "demo";

export type Mark = "✅" | "⚠️" | "❌";

export interface TimeframeSnapshot {
  tf: Timeframe;
  close: number;
  ema20: number | null;
  ema50: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  atr: number | null;
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  bias: "صاعد" | "هابط" | "عرضي";
}

export interface Level {
  price: number;
  source: string;
  distancePct: number;
}

export interface AnalysisReport {
  asset: { key: AssetKey; name: string; symbol: string; decimals: number };
  source: DataSource;
  sourceNote: string;
  generatedAt: string;
  lastCandleAt: string;
  primaryTf: Timeframe;
  price: number;
  changePct: number;

  summary: {
    trend: "صاعد" | "هابط" | "عرضي";
    momentum: string;
    volatility: { atr: number; atrPct: number; label: string };
    marketState: string;
    confluence: number;
    direction: "صاعد" | "هابط";
    components: { name: string; mark: Mark; note: string }[];
    session: { name: string; liquidity: string; note: string; marketOpen: boolean };
  };

  zones: {
    pivot: number;
    nearestSupport: Level;
    nearestResistance: Level;
    nextSupports: Level[];
    nextResistances: Level[];
    liquidityNarrative: string;
  };

  scenarios: { bullish: string; bearish: string };
  recommendation: { wait: boolean; title: string; text: string; tone: "wait" | "caution" | "ok" };
  justification: string;
  extended: string[];
  timeframes: TimeframeSnapshot[];
  fibonacci: { swingHigh: number; swingLow: number; levels: { ratio: string; price: number }[] };
}
