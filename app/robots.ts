import type { MetadataRoute } from "next";

/** منع محركات البحث من فهرسة الموقع */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
