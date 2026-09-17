# 🤖 محلل الأسواق الآلي — Auto Analysis App

تطبيق ويب بواجهة تشبه محادثة تيليجرام، يولّد **تقرير تحليل فني لحظي** لزوج الذهب/الدولار (XAU/USD) وأصول أخرى (الفضة، البيتكوين، اليورو) بناءً على بيانات السوق لحظة فتح الصفحة.

مبني بـ **Next.js 16 + React 19 + TailwindCSS 4 + TypeScript**، والمؤشرات تُحسب داخل الخادم من الشموع التاريخية (OHLCV) دون مكتبات خارجية.

## ✨ ما يحتويه التقرير

| القسم | المحتوى |
| --- | --- |
| رأس التقرير | الأصل، التاريخ والوقت من متصفح المستخدم، السعر الحالي ونسبة التغير |
| الخلاصة التنفيذية | الاتجاه العام، الزخم (RSI)، التذبذب (ATR)، حالة السوق (ADX)، درجة التوافق %، التفكيك بالمكونات ✅⚠️❌، ملاحظة الجلسة |
| المناطق المهمة | الدعم والمقاومة الأقرب + مستويان تاليان لكل منهما، وفقرة منطقة السيولة (تجميع/تصريف) |
| السيناريوهات الشرطية | الإيجابي والهابط مع الأهداف ونقاط الإبطال |
| هل الانتظار أفضل؟ | منطق If/Else على ADX ودرجة التوافق وحالة السوق |
| سبب الترجيح الفني | فقرة مولّدة بالأرقام الحية (EMA على H1/H4، RSI، ADX، المسافة % للدعم/المقاومة) |
| أزرار تفاعلية | مؤشرات مكملة (MACD، DI، بولنجر، فيبوناتشي) · فريمات متعددة · توسيع التحليل |

**المؤشرات المحسوبة:** SMA/EMA (M15, H1, H4, D1) · RSI 14 · ATR 14 · ADX 14 (+DI/−DI) · MACD 12/26/9 · Bollinger 20/2 · Pivot Points · القمم والقيعان (Fractals).

## 📡 مصادر البيانات (بالترتيب)

1. **Twelve Data** — إذا وضعت `TWELVE_DATA_API_KEY` (مفتاح مجاني). يعطي السعر الفوري للذهب XAU/USD. ✅ مستحسن.
2. **Yahoo Finance** — بدون مفتاح. الذهب والفضة عبر العقود الآجلة (`GC=F`, `SI=F`) لذلك قد يختلف السعر قليلاً عن الفوري، وقد يتأخر حتى 15 دقيقة.
3. **بيانات تجريبية** — إذا فشل المصدران، مع شارة «وضع تجريبي» وتنبيه واضح في التقرير.

> ملاحظة: Yahoo قد يحجب طلبات بعض خوادم الاستضافة السحابية، لذا يُنصح بمفتاح Twelve Data عند النشر.
> الخطة المجانية في Twelve Data تسمح بـ 8 طلبات/دقيقة، والتطبيق يستهلك 4 طلبات لكل تحديث مع تخزين مؤقت 55 ثانية.

## 🚀 التشغيل محلياً

المتطلبات: Node.js 20.9 أو أحدث.

```bash
npm install
cp .env.example .env.local   # ثم ضع مفتاح Twelve Data (اختياري)
npm run dev
```

افتح http://localhost:3000

## ☁️ الرفع على GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/auto-analysis-app.git
git push -u origin main
```

الملفات الكبيرة (`node_modules`, `.next`) و`.env.local` مستثناة تلقائياً عبر `.gitignore`. عند كل push يعمل فحص CI (lint + typecheck + build) من `.github/workflows/ci.yml`.

## 🌐 النشر على Vercel

1. من [vercel.com/new](https://vercel.com/new) اختر المستودع.
2. في **Environment Variables** أضف `TWELVE_DATA_API_KEY`.
3. اضغط Deploy.

## 🗂️ هيكل المشروع

```
app/
  api/analysis/route.ts   ← GET /api/analysis?asset=XAU_USD&tf=H4  (يُرجع التقرير JSON)
  layout.tsx, page.tsx    ← الواجهة (عربية RTL، وضع ليلي، متجاوبة)
  globals.css
components/Report.tsx     ← أقسام التقرير والأزرار الإضافية
lib/
  assets.ts               ← الأصول المدعومة ورموزها لدى كل مزود
  market-data.ts          ← جلب الشموع + الاحتياطي + التخزين المؤقت
  indicators.ts           ← SMA, EMA, RSI, ATR, ADX, MACD, Bollinger, Pivots, Fractals
  analysis.ts             ← محرك توليد التقرير والنصوص
  types.ts
```

لإضافة أصل جديد: أضفه في `lib/assets.ts` وفي `ASSET_OPTIONS` داخل `app/page.tsx`.

## ⚠️ إخلاء مسؤولية

التقرير مولَّد آلياً من معادلات رياضية ولا يُعد نصيحة استثمارية.
