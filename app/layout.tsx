import type { Metadata, Viewport } from "next";
import "./globals.css";
import { siteConfig } from "@/site.config";

export const metadata: Metadata = {
  title: siteConfig.siteTitle,
  description: "تقرير تحليل فني آلي ولحظي لزوج الذهب/الدولار (XAU/USD) وأصول أخرى: المتوسطات المتحركة، RSI، ATR، ADX، MACD، الدعوم والمقاومات والسيناريوهات.",
};

export const viewport: Viewport = {
  themeColor: "#0e1621",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className="dark h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
