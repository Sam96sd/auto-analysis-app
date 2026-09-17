import type { AssetConfig } from "./assets";
import { adx, atr, bollinger, classicPivots, ema, last, macd, rsi, sma, swingPoints } from "./indicators";
import type { MarketData } from "./market-data";
import type { AnalysisReport, Candle, Level, Mark, Timeframe, TimeframeSnapshot } from "./types";

const DAY = 86_400_000;

/* ---------------------------------- أدوات مساعدة ---------------------------------- */

export function fmt(n: number, decimals: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
/** عزل الأرقام والرموز اللاتينية داخل النص العربي حتى لا تنقلب (LRI … PDI) */
const iso = (v: string | number) => `\u2066${v}\u2069`;
const pct = (n: number) => iso(`${n.toFixed(2)}%`);
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** نستبدل آخر شمعة بالسعر اللحظي حتى تعكس المؤشرات لحظة الزيارة */
function withLivePrice(c: Candle[], price: number): Candle[] {
  if (!c.length) return c;
  const copy = c.slice();
  const k = { ...copy[copy.length - 1] };
  k.c = price;
  k.h = Math.max(k.h, price);
  k.l = Math.min(k.l, price);
  copy[copy.length - 1] = k;
  return copy;
}

function snapshot(tf: Timeframe, c: Candle[]): TimeframeSnapshot {
  const closes = c.map((k) => k.c);
  const close = closes[closes.length - 1];
  const e20 = last(ema(closes, 20));
  const e50 = last(ema(closes, 50));
  const s50 = last(sma(closes, 50));
  const s200 = last(sma(closes, 200));
  const m = macd(closes);
  const a = adx(c);
  const bb = bollinger(closes);

  let score = 0;
  if (e20 !== null) score += close > e20 ? 1 : -1;
  if (e20 !== null && e50 !== null) score += e20 > e50 ? 1 : -1;
  if (s200 !== null) score += close > s200 ? 1 : -1;
  const maxScore = s200 !== null ? 3 : 2;
  const bias = score >= maxScore - 1 && score > 0 ? "صاعد" : score <= -(maxScore - 1) && score < 0 ? "هابط" : "عرضي";

  return {
    tf,
    close,
    ema20: e20,
    ema50: e50,
    sma50: s50,
    sma200: s200,
    rsi: last(rsi(closes)),
    atr: last(atr(c)),
    adx: last(a.adx),
    plusDI: last(a.plusDI),
    minusDI: last(a.minusDI),
    macd: last(m.line),
    macdSignal: last(m.signal),
    macdHist: last(m.hist),
    bbUpper: last(bb.upper),
    bbMiddle: last(bb.middle),
    bbLower: last(bb.lower),
    bias,
  };
}

/* ---------------------------------- الجلسات ---------------------------------- */

export function tradingSession(now: Date, alwaysOpen: boolean) {
  const day = now.getUTCDay(); // 0 = الأحد
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;
  // الفوركس والمعادن: إغلاق من الجمعة 21:00 UTC حتى الأحد 22:00 UTC (تقريبي)
  const weekendClosed = (day === 5 && h >= 21) || day === 6 || (day === 0 && h < 22);
  if (!alwaysOpen && weekendClosed) {
    return {
      name: "السوق مغلق (عطلة نهاية الأسبوع)",
      liquidity: "معدومة",
      note: "الأسعار المعروضة هي آخر إغلاق، وقد تظهر فجوة سعرية عند افتتاح الأسبوع.",
      marketOpen: false,
      score: 0,
    };
  }
  const tokyo = h >= 0 && h < 9;
  const london = h >= 7 && h < 16;
  const newYork = h >= 12 && h < 21;
  if (london && newYork) {
    return { name: "تداخل لندن ونيويورك", liquidity: "قصوى", note: "أعلى سيولة في اليوم؛ تحركات قوية محتملة خاصة مع صدور البيانات الأمريكية.", marketOpen: true, score: 2 };
  }
  if (london && tokyo) {
    return { name: "تداخل طوكيو ولندن", liquidity: "مرتفعة", note: "بداية دخول السيولة الأوروبية؛ غالباً ما تُختبر قمم وقيعان الجلسة الآسيوية.", marketOpen: true, score: 2 };
  }
  if (london) {
    return { name: "لندن (الأوروبية)", liquidity: "مرتفعة", note: "سيولة مرتفعة وحركات اتجاهية واضحة على الذهب والعملات الرئيسية.", marketOpen: true, score: 2 };
  }
  if (newYork) {
    return { name: "نيويورك (الأمريكية)", liquidity: "مرتفعة إلى متوسطة", note: "السيولة تتراجع تدريجياً بعد إغلاق لندن مع احتمالات تصحيح أو جني أرباح.", marketOpen: true, score: 1.5 };
  }
  if (tokyo) {
    return { name: "طوكيو (الآسيوية)", liquidity: "منخفضة إلى معتدلة", note: "تحركات هادئة نسبياً ونطاقات ضيقة غالباً؛ الاختراقات أقل موثوقية.", marketOpen: true, score: 1 };
  }
  return { name: "سيدني / ما بين الجلسات", liquidity: "منخفضة", note: "سيولة ضعيفة؛ يُفضّل الحذر من الحركات المفاجئة والسبريد المرتفع.", marketOpen: true, score: 0.5 };
}

/* ---------------------------------- المستويات ---------------------------------- */

function clusterLevels(raw: { price: number; source: string }[], tolerance: number) {
  const sorted = raw.filter((r) => Number.isFinite(r.price)).sort((a, b) => a.price - b.price);
  const groups: { prices: number[]; sources: Set<string> }[] = [];
  for (const r of sorted) {
    const g = groups[groups.length - 1];
    const center = g ? g.prices.reduce((a, b) => a + b, 0) / g.prices.length : 0;
    if (g && Math.abs(r.price - center) <= tolerance) {
      g.prices.push(r.price);
      g.sources.add(r.source);
    } else {
      groups.push({ prices: [r.price], sources: new Set([r.source]) });
    }
  }
  return groups.map((g) => ({
    price: g.prices.reduce((a, b) => a + b, 0) / g.prices.length,
    source: [...g.sources].join(" + "),
  }));
}

/* ---------------------------------- التقرير ---------------------------------- */

export function buildReport(asset: AssetConfig, data: MarketData, primaryTf: Timeframe, now = new Date()): AnalysisReport {
  const d = asset.decimals;
  const price = data.price;
  const f = (n: number) => iso(fmt(n, d));

  const series = {
    M15: withLivePrice(data.m15, price),
    H1: withLivePrice(data.h1, price),
    H4: withLivePrice(data.h4, price),
    D1: withLivePrice(data.d1, price),
  };
  const snaps: Record<Timeframe, TimeframeSnapshot> = {
    M15: snapshot("M15", series.M15),
    H1: snapshot("H1", series.H1),
    H4: snapshot("H4", series.H4),
    D1: snapshot("D1", series.D1),
  };
  const P = snaps[primaryTf];
  const rsiV = P.rsi ?? 50;
  const adxV = P.adx ?? 0;
  const atrV = P.atr ?? price * 0.005;

  // التذبذب: ATR الحالي مقارنة بمتوسطه لآخر 50 شمعة
  const atrSeries = atr(series[primaryTf]).filter((v) => !Number.isNaN(v));
  const atrAvg = atrSeries.slice(-50).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(50, atrSeries.length));
  const atrRatio = atrAvg ? atrV / atrAvg : 1;

  /* ---- درجة التوافق (مجموع موزون للإشارات) ---- */
  type Sig = { w: number; v: 1 | -1 | 0 };
  const sigs: Sig[] = [];
  const cmp = (a: number | null, b: number | null): 1 | -1 | 0 => (a === null || b === null ? 0 : a > b ? 1 : a < b ? -1 : 0);
  sigs.push({ w: 0.5, v: cmp(price, snaps.M15.ema20) }, { w: 0.5, v: cmp(snaps.M15.ema20, snaps.M15.ema50) });
  sigs.push({ w: 1, v: cmp(price, snaps.H1.ema20) }, { w: 1, v: cmp(snaps.H1.ema20, snaps.H1.ema50) });
  sigs.push({ w: 1.5, v: cmp(price, snaps.H4.ema20) }, { w: 1.5, v: cmp(snaps.H4.ema20, snaps.H4.ema50) });
  sigs.push({ w: 2, v: cmp(price, snaps.D1.sma50) }, { w: 2, v: cmp(snaps.D1.sma50, snaps.D1.sma200) });
  sigs.push({ w: 1.5, v: rsiV > 55 ? 1 : rsiV < 45 ? -1 : 0 });
  sigs.push({ w: 1.5, v: P.macdHist === null ? 0 : P.macdHist > 0 ? 1 : -1 });
  sigs.push({ w: 1, v: cmp(P.plusDI, P.minusDI) });
  const total = sigs.reduce((a, s) => a + s.w, 0);
  const bull = sigs.filter((s) => s.v === 1).reduce((a, s) => a + s.w, 0);
  const bear = sigs.filter((s) => s.v === -1).reduce((a, s) => a + s.w, 0);
  const direction: "صاعد" | "هابط" = bull >= bear ? "صاعد" : "هابط";
  const confluence = round((Math.max(bull, bear) / total) * 100, 1);

  /* ---- الاتجاه العام من ترتيب السعر مع المتوسطات ---- */
  const biases = [snaps.M15.bias, snaps.H1.bias, snaps.H4.bias, snaps.D1.bias];
  const upCount = biases.filter((b) => b === "صاعد").length;
  const downCount = biases.filter((b) => b === "هابط").length;
  const biasAgree = direction === "صاعد" ? upCount : downCount;
  const trend: "صاعد" | "هابط" | "عرضي" =
    confluence >= 60 || (confluence >= 50 && biasAgree >= 3) ? direction : "عرضي";

  const momentum =
    rsiV >= 70 ? "قوي صاعد (تشبع شرائي) 🔥"
    : rsiV >= 60 ? "قوي صاعد"
    : rsiV > 50 ? "إيجابي ضعيف"
    : rsiV <= 30 ? "قوي هابط (تشبع بيعي) ❄️"
    : rsiV <= 40 ? "قوي هابط"
    : "سلبي ضعيف";

  const marketState =
    adxV >= 40 ? "اتجاهي قوي جداً" : adxV > 25 ? "اتجاهي" : adxV >= 20 ? "انتقالي (بداية تشكّل اتجاه)" : "عرضي";

  const volLabel = atrRatio > 1.8 ? "مرتفع جداً" : atrRatio > 1.25 ? "مرتفع" : atrRatio < 0.75 ? "منخفض" : "طبيعي";

  const session = tradingSession(now, asset.alwaysOpen);

  /* ---- الهيكل: قمم وقيعان متتالية على الإطار الأساسي ---- */
  const sw = swingPoints(series[primaryTf].slice(0, -1), 3);
  const hh = sw.highs.length >= 2 ? Math.sign(sw.highs.at(-1)!.price - sw.highs.at(-2)!.price) : 0;
  const hl = sw.lows.length >= 2 ? Math.sign(sw.lows.at(-1)!.price - sw.lows.at(-2)!.price) : 0;
  const structure = hh > 0 && hl > 0 ? "صاعد" : hh < 0 && hl < 0 ? "هابط" : "مختلط";

  const dirSign = direction === "صاعد" ? 1 : -1;
  const trendAgree = biases.filter((b) => b === direction).length;
  const momAgree = (Math.sign(rsiV - 50) === dirSign ? 1 : 0) + (P.macdHist !== null && Math.sign(P.macdHist) === dirSign ? 1 : 0);

  const components: { name: string; mark: Mark; note: string }[] = [
    {
      name: "الاتجاه",
      mark: trendAgree >= 3 ? "✅" : trendAgree === 2 ? "⚠️" : "❌",
      note: `${trendAgree}/4 إطارات متوافقة مع الاتجاه ${direction} (M15: ${snaps.M15.bias}، H1: ${snaps.H1.bias}، H4: ${snaps.H4.bias}، D1: ${snaps.D1.bias})`,
    },
    {
      name: "الزخم",
      mark: momAgree === 2 ? "✅" : momAgree === 1 ? "⚠️" : "❌",
      note: `RSI ${iso(rsiV.toFixed(1))} و MACD ${P.macdHist !== null && P.macdHist > 0 ? "موجب" : "سالب"}`,
    },
    {
      name: "السيولة",
      mark: session.score >= 2 ? "✅" : session.score >= 1 ? "⚠️" : "❌",
      note: `${session.name} — سيولة ${session.liquidity}`,
    },
    {
      name: "التذبذب",
      mark: volLabel === "طبيعي" ? "✅" : volLabel === "مرتفع جداً" ? "❌" : "⚠️",
      note: `ATR ${f(atrV)} (${volLabel}، ${iso(`${(atrRatio * 100).toFixed(0)}%`)} من متوسطه)`,
    },
    {
      name: "الهيكل",
      mark: structure === direction ? "✅" : structure === "مختلط" ? "⚠️" : "❌",
      note: `هيكل القمم والقيعان: ${structure}`,
    },
  ];

  /* ---- المستويات: نقاط الارتكاز + القمم والقيعان ---- */
  const lastDaily = data.d1[data.d1.length - 1];
  const todayStart = Math.floor(now.getTime() / DAY) * DAY;
  const prevDay = lastDaily.t >= todayStart && data.d1.length > 1 ? data.d1[data.d1.length - 2] : lastDaily;
  const piv = classicPivots(prevDay.h, prevDay.l, prevDay.c);

  const raw: { price: number; source: string }[] = [
    { price: piv.p, source: "Pivot" },
    { price: piv.r1, source: "R1" }, { price: piv.r2, source: "R2" }, { price: piv.r3, source: "R3" },
    { price: piv.s1, source: "S1" }, { price: piv.s2, source: "S2" }, { price: piv.s3, source: "S3" },
    { price: prevDay.h, source: "قمة الأمس" }, { price: prevDay.l, source: "قاع الأمس" },
  ];
  const addSwings = (c: Candle[], label: string, lookback: number) => {
    const s = swingPoints(c.slice(-lookback, -1), 3);
    s.highs.forEach((x) => raw.push({ price: x.price, source: `قمة ${label}` }));
    s.lows.forEach((x) => raw.push({ price: x.price, source: `قاع ${label}` }));
  };
  addSwings(data.h4, "H4", 150);
  addSwings(data.d1, "يومية", 120);

  const tol = (snaps.H4.atr ?? atrV) * 0.3;
  const clusters = clusterLevels(raw, tol);
  const minGap = (snaps.H1.atr ?? atrV) * 0.15;
  const toLevel = (x: { price: number; source: string }): Level => ({
    price: round(x.price, d),
    source: x.source,
    distancePct: round((Math.abs(x.price - price) / price) * 100, 2),
  });
  const dailyAtr = snaps.D1.atr ?? atrV * 4;
  const supports = clusters.filter((x) => x.price < price - minGap).sort((a, b) => b.price - a.price).slice(0, 3).map(toLevel);
  const resistances = clusters.filter((x) => x.price > price + minGap).sort((a, b) => a.price - b.price).slice(0, 3).map(toLevel);
  while (supports.length < 3) {
    const base = supports.length ? supports[supports.length - 1].price : price;
    supports.push(toLevel({ price: base - dailyAtr, source: "تقديري (ATR يومي)" }));
  }
  while (resistances.length < 3) {
    const base = resistances.length ? resistances[resistances.length - 1].price : price;
    resistances.push(toLevel({ price: base + dailyAtr, source: "تقديري (ATR يومي)" }));
  }
  const [S1, S2, S3] = supports;
  const [R1, R2, R3] = resistances;

  /* ---- منطقة السيولة ---- */
  const range = R1.price - S1.price;
  const pos = range > 0 ? (price - S1.price) / range : 0.5;
  const posPct = Math.round(pos * 100);
  let zoneText: string;
  if (pos <= 0.33) {
    zoneText =
      direction === "صاعد" && trend !== "هابط"
        ? "منطقة تجميع محتملة: السعر قريب من الدعم مع ميل صاعد في المؤشرات، ما قد يجذب أوامر الشراء."
        : "ضغط بيعي على منطقة الدعم: قرب السعر من الدعم مع ميل هابط يرفع احتمال كسره واستهداف سيولة أسفله.";
  } else if (pos >= 0.67) {
    zoneText =
      direction === "هابط" && trend !== "صاعد"
        ? "منطقة تصريف محتملة: السعر قريب من المقاومة مع ميل هابط، ما قد ينشّط أوامر البيع وجني الأرباح."
        : "اختبار منطقة مقاومة: السعر يقترب من المقاومة بزخم صاعد، والاختراق المؤكد قد يطلق سيولة أوامر الإيقاف أعلاها.";
  } else {
    zoneText = "منتصف النطاق: لا توجد أفضلية واضحة للتجميع أو التصريف، والأفضل انتظار اقتراب السعر من أحد الطرفين.";
  }
  const liquidityNarrative =
    `يتداول السعر عند ${f(price)} ضمن النطاق الممتد بين الدعم ${f(S1.price)} والمقاومة ${f(R1.price)}، ` +
    `ويقع عند نحو ${iso(`${posPct}%`)} من هذا النطاق (يبعد ${pct(R1.distancePct)} عن المقاومة و${pct(S1.distancePct)} عن الدعم، ` +
    `أي ما يعادل ${iso(((R1.price - price) / atrV).toFixed(1))} و${iso(((price - S1.price) / atrV).toFixed(1))} ضعف ATR على ${iso(primaryTf)}). ${zoneText}`;

  /* ---- السيناريوهات ---- */
  const buffer = f(atrV * 0.25);
  const bullish =
    `في حال اختراق المقاومة الأقرب ${f(R1.price)} والإغلاق أعلاها على إطار ${iso(primaryTf)} (يُفضّل هامش تأكيد ≈ ${buffer})، ` +
    `يُرجّح امتداد الصعود نحو الهدف الأول ${f(R2.price)} ثم الهدف الثاني ${f(R3.price)}. ` +
    `يُلغى هذا السيناريو عند كسر الدعم ${f(S1.price)} والإغلاق أسفله.`;
  const bearish =
    `في حال كسر الدعم الأقرب ${f(S1.price)} والإغلاق أسفله على إطار ${iso(primaryTf)} (يُفضّل هامش تأكيد ≈ ${buffer})، ` +
    `يُرجّح امتداد الهبوط نحو الهدف الأول ${f(S2.price)} ثم الهدف الثاني ${f(S3.price)}. ` +
    `يُلغى هذا السيناريو عند اختراق المقاومة ${f(R1.price)} والإغلاق أعلاها.`;

  /* ---- التوصية ---- */
  let recommendation: AnalysisReport["recommendation"];
  if (!session.marketOpen) {
    recommendation = { wait: true, tone: "wait", title: "⏸️ الانتظار هو الأفضل", text: "السوق مغلق حالياً؛ انتظر الافتتاح وتأكد من عدم وجود فجوة سعرية قبل اتخاذ أي قرار." };
  } else if (confluence < 60 && adxV < 25) {
    recommendation = { wait: true, tone: "wait", title: "⏸️ الانتظار هو الأفضل", text: `الاتجاه غير واضح (ADX ${iso(adxV.toFixed(1))} أقل من 25) ودرجة التوافق ${iso(`${confluence}%`)} أقل من ${iso("60%")}. يُفضّل البقاء خارج السوق حتى اختراق ${f(R1.price)} أو كسر ${f(S1.price)}.` };
  } else if (confluence >= 60 && adxV >= 25) {
    recommendation = { wait: false, tone: "ok", title: "🎯 البيئة مقبولة لاتخاذ قرار", text: `الإشارات متوافقة بنسبة ${iso(`${confluence}%`)} باتجاه ${direction} مع اتجاه قائم (ADX ${iso(adxV.toFixed(1))}). يمكن التعامل وفق السيناريو ${direction === "صاعد" ? "الإيجابي" : "الهابط"} مع الالتزام بنقطة الإبطال وإدارة المخاطر.` };
  } else {
    recommendation = { wait: true, tone: "caution", title: "⚠️ إشارات مختلطة — الحذر مطلوب", text: `درجة التوافق ${iso(`${confluence}%`)} و ADX ${iso(adxV.toFixed(1))}؛ أحد الشرطين غير متحقق. انتظر تأكيداً إضافياً (إغلاق خارج النطاق ${f(S1.price)} – ${f(R1.price)}).` };
  }

  /* ---- سبب الترجيح الفني ---- */
  const posMA = (s: TimeframeSnapshot) => {
    if (s.ema20 === null || s.ema50 === null) return `على ${iso(s.tf)}: بيانات غير كافية`;
    const a = price > s.ema20 ? "أعلى" : "أدنى";
    const b = price > s.ema50 ? "أعلى" : "أدنى";
    return `على ${iso(s.tf)} يتداول السعر ${a} EMA20 (${f(s.ema20)}) و${b} EMA50 (${f(s.ema50)})`;
  };
  const justification =
    `يتداول ${iso(asset.symbol)} عند ${f(price)}. ${primaryTf === "M15" ? `${posMA(snaps.M15)}، ` : ""}${posMA(snaps.H1)}، و${posMA(snaps.H4)}. ` +
    `يسجّل مؤشر RSI(14) على ${iso(primaryTf)} قراءة ${iso(rsiV.toFixed(1))} ما يعكس زخماً بوصف «${momentum}»، ` +
    `بينما يبلغ ADX(14) ${iso(adxV.toFixed(1))} لتُصنَّف حالة السوق «${marketState}». ` +
    `يبعد السعر ${pct(R1.distancePct)} عن المقاومة الأقرب ${f(R1.price)} و${pct(S1.distancePct)} عن الدعم الأقرب ${f(S1.price)}، ` +
    `وتميل الكفة ${direction === "صاعد" ? "للمشترين" : "للبائعين"} بدرجة توافق ${iso(`${confluence}%`)}.`;

  const D = snaps.D1;
  const extended = [
    D.sma50 !== null && D.sma200 !== null
      ? `على الإطار اليومي: SMA50 (${f(D.sma50)}) ${D.sma50 > D.sma200 ? "أعلى" : "أدنى"} SMA200 (${f(D.sma200)}) — ${D.sma50 > D.sma200 ? "بنية صاعدة طويلة المدى" : "بنية هابطة طويلة المدى"}.`
      : "لا تتوفر بيانات يومية كافية لحساب SMA200.",
    P.macd !== null && P.macdSignal !== null
      ? `MACD على ${iso(primaryTf)}: الخط ${f(P.macd)} مقابل الإشارة ${f(P.macdSignal)}، والهيستوجرام ${P.macdHist! >= 0 ? "موجب" : "سالب"} (${f(P.macdHist!)}).`
      : "",
    P.plusDI !== null && P.minusDI !== null
      ? `${iso("+DI")} ${iso(P.plusDI.toFixed(1))} مقابل ${iso("-DI")} ${iso(P.minusDI.toFixed(1))}: ${P.plusDI > P.minusDI ? "ضغط الشراء متفوق" : "ضغط البيع متفوق"}.`
      : "",
    P.bbUpper !== null && P.bbLower !== null
      ? `نطاقات بولنجر (20، 2) على ${iso(primaryTf)}: ${f(P.bbLower)} – ${f(P.bbUpper)}؛ السعر ${price > P.bbUpper ? "خارج الحد العلوي (امتداد مفرط)" : price < P.bbLower ? "خارج الحد السفلي (امتداد مفرط)" : "داخل النطاق"}.`
      : "",
    `نقطة الارتكاز اليومية ${f(piv.p)}، والسعر ${price > piv.p ? "أعلاها (ميل إيجابي داخل اليوم)" : "أدناها (ميل سلبي داخل اليوم)"}.`,
    `هيكل القمم والقيعان على ${iso(primaryTf)}: ${structure}.`,
  ].filter(Boolean);

  /* ---- فيبوناتشي من آخر 100 شمعة على الإطار الأساسي ---- */
  const recent = series[primaryTf].slice(-100);
  const swingHigh = Math.max(...recent.map((k) => k.h));
  const swingLow = Math.min(...recent.map((k) => k.l));
  const fibRange = swingHigh - swingLow;
  const fibonacci = {
    swingHigh: round(swingHigh, d),
    swingLow: round(swingLow, d),
    levels: [0.236, 0.382, 0.5, 0.618, 0.786].map((r) => ({ ratio: `${iso(`${(r * 100).toFixed(1)}%`)}`, price: round(swingHigh - fibRange * r, d) })),
  };

  const prevClose = prevDay.c;

  return {
    asset: { key: asset.key, name: asset.name, symbol: asset.symbol, decimals: d },
    source: data.source,
    sourceNote: data.sourceNote,
    generatedAt: now.toISOString(),
    lastCandleAt: new Date(data.m15[data.m15.length - 1].t).toISOString(),
    primaryTf,
    price: round(price, d),
    changePct: round(((price - prevClose) / prevClose) * 100, 2),
    summary: {
      trend,
      momentum,
      volatility: { atr: round(atrV, d), atrPct: round((atrV / price) * 100, 3), label: volLabel },
      marketState,
      confluence,
      direction,
      components,
      session: { name: session.name, liquidity: session.liquidity, note: session.note, marketOpen: session.marketOpen },
    },
    zones: {
      pivot: round(piv.p, d),
      nearestSupport: S1,
      nearestResistance: R1,
      nextSupports: [S2, S3],
      nextResistances: [R2, R3],
      liquidityNarrative,
    },
    scenarios: { bullish, bearish },
    recommendation,
    justification,
    extended,
    timeframes: [snaps.M15, snaps.H1, snaps.H4, snaps.D1].map((s) => ({
      ...s,
      ...Object.fromEntries(
        Object.entries(s).map(([k, v]) => [k, typeof v === "number" ? round(v, ["rsi", "adx", "plusDI", "minusDI"].includes(k) ? 1 : d) : v]),
      ),
    })) as TimeframeSnapshot[],
    fibonacci,
  };
}
