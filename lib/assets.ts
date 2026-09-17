import type { AssetKey } from "./types";

export interface AssetConfig {
  key: AssetKey;
  name: string;
  symbol: string;
  decimals: number;
  /** رمز Twelve Data */
  twelveSymbol: string;
  /** رمز Yahoo Finance (للذهب والفضة نستخدم العقود الآجلة لأن السعر الفوري غير متاح مجاناً) */
  yahooSymbol: string;
  /** هل يتداول الأصل 24/7 (العملات الرقمية) */
  alwaysOpen: boolean;
  /** سعر تقريبي يُستخدم فقط في الوضع التجريبي */
  demoPrice: number;
}

export const ASSETS: Record<AssetKey, AssetConfig> = {
  XAU_USD: {
    key: "XAU_USD",
    name: "الذهب / الدولار الأمريكي",
    symbol: "XAU/USD",
    decimals: 2,
    twelveSymbol: "XAU/USD",
    yahooSymbol: "GC=F",
    alwaysOpen: false,
    demoPrice: 3650,
  },
  XAG_USD: {
    key: "XAG_USD",
    name: "الفضة / الدولار الأمريكي",
    symbol: "XAG/USD",
    decimals: 3,
    twelveSymbol: "XAG/USD",
    yahooSymbol: "SI=F",
    alwaysOpen: false,
    demoPrice: 42,
  },
  BTC_USD: {
    key: "BTC_USD",
    name: "البيتكوين / الدولار الأمريكي",
    symbol: "BTC/USD",
    decimals: 2,
    twelveSymbol: "BTC/USD",
    yahooSymbol: "BTC-USD",
    alwaysOpen: true,
    demoPrice: 110000,
  },
  EUR_USD: {
    key: "EUR_USD",
    name: "اليورو / الدولار الأمريكي",
    symbol: "EUR/USD",
    decimals: 5,
    twelveSymbol: "EUR/USD",
    yahooSymbol: "EURUSD=X",
    alwaysOpen: false,
    demoPrice: 1.17,
  },
};

export const ASSET_KEYS = Object.keys(ASSETS) as AssetKey[];

export function isAssetKey(v: string | null): v is AssetKey {
  return !!v && (ASSET_KEYS as string[]).includes(v);
}
