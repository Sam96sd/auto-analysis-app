import type { NextRequest } from "next/server";
import { ASSETS, isAssetKey } from "@/lib/assets";
import { buildReport } from "@/lib/analysis";
import { fetchMarketData, MarketDataUnavailableError } from "@/lib/market-data";
import type { Timeframe } from "@/lib/types";

const TIMEFRAMES: Timeframe[] = ["M15", "H1", "H4", "D1"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const assetParam = params.get("asset");
  const tfParam = params.get("tf") as Timeframe | null;

  if (assetParam && !isAssetKey(assetParam)) {
    return Response.json({ error: "أصل غير مدعوم" }, { status: 400 });
  }
  const asset = ASSETS[isAssetKey(assetParam) ? assetParam : "XAU_USD"];
  const tf: Timeframe = tfParam && TIMEFRAMES.includes(tfParam) ? tfParam : "H4";

  try {
    const data = await fetchMarketData(asset);
    const report = buildReport(asset, data, tf);
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof MarketDataUnavailableError) {
      return Response.json({ error: e.message }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    console.error("[api/analysis]", e);
    return Response.json({ error: "تعذّر توليد التحليل حالياً، حاول مرة أخرى." }, { status: 500 });
  }
}
