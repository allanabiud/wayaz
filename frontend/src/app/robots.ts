import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wayaz.co.ke";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private surfaces stay out of search: the admin dashboard, the
      // checkout funnel, and account/order pages (both auth-gated).
      disallow: [
        "/admin",
        "/checkout",
        "/orders",
        "/account",
        "/login",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
