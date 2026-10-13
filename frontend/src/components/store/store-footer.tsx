"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
  TwitterIcon,
  WhatsAppIcon,
  YouTubeIcon,
} from "@/components/brand-icons";
import { Mail, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useStore } from "@/components/store/store-context";
import { waLink } from "@/lib/store";

/** Category pages offered in the footer (shown only while they hold items). */
const PRODUCT_LINKS = [
  { slug: "jeans", name: "Jeans" },
  { slug: "shoes", name: "Shoes" },
  { slug: "bikinis", name: "Bikinis" },
  { slug: "shirts", name: "Shirts" },
];

export function StoreFooter() {
  const { catalog, catalogLoading, settings } = useStore();
  const year = new Date().getFullYear();

  // Dynamically resolve social links from settings with graceful fallbacks
  const socialLinks = useMemo(() => {
    const list = [];
    const instagram =
      settings?.instagram_url ||
      process.env.NEXT_PUBLIC_INSTAGRAM_URL ||
      "https://www.instagram.com/wayaz";
    if (instagram) {
      list.push({ name: "Instagram", href: instagram, Icon: InstagramIcon });
    }

    const waNum = settings?.whatsapp_number || process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "254700000000";
    const waMsg = settings?.whatsapp_message || "Hi Wayaz, I'd like to know more about your products.";
    list.push({
      name: "WhatsApp",
      href: waLink(waMsg, waNum),
      Icon: WhatsAppIcon,
    });

    const facebook =
      settings?.facebook_url ||
      process.env.NEXT_PUBLIC_FACEBOOK_URL ||
      "https://www.facebook.com/wayaz";
    if (facebook) {
      list.push({ name: "Facebook", href: facebook, Icon: FacebookIcon });
    }

    if (settings?.tiktok_url) {
      list.push({ name: "TikTok", href: settings.tiktok_url, Icon: TikTokIcon });
    }

    if (settings?.twitter_url) {
      list.push({ name: "X (Twitter)", href: settings.twitter_url, Icon: TwitterIcon });
    }

    if (settings?.youtube_url) {
      list.push({ name: "YouTube", href: settings.youtube_url, Icon: YouTubeIcon });
    }

    return list;
  }, [settings]);

  // Only link categories that exist and hold items.
  const productLinks = PRODUCT_LINKS.filter(({ slug }) => {
    if (!catalog) return false;
    const exists = catalog.categories.some(
      (category) => category.slug === slug,
    );
    return (
      exists &&
      catalog.products.some((product) => product.category_slug === slug)
    );
  });

  return (
    <footer className="border-t">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <p className="text-sm font-semibold tracking-tight">
              {settings?.store_name || "Wayaz Collection"}
            </p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              {settings?.tagline ||
                "Fresh pieces delivered across Kenya - order on WhatsApp or add them to your cart."}
            </p>
            {settings?.address && (
              <p className="mt-2 text-xs text-muted-foreground">
                {settings.address}
              </p>
            )}
          </div>

          <nav aria-label="Products">
            <h2 className="text-xs font-semibold tracking-[0.25em] text-gold uppercase">
              Products
            </h2>
            {catalogLoading && !catalog ? (
              <div className="mt-3 space-y-2" aria-hidden="true">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            ) : productLinks.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm">
                {productLinks.map((product) => (
                  <li key={product.slug}>
                    <Link
                      href={`/categories/${product.slug}`}
                      className="rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {product.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </nav>

          <nav aria-label="Customer Care & Contact">
            <h2 className="text-xs font-semibold tracking-[0.25em] text-gold uppercase">
              Customer Care
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  href="/contact"
                  className="rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Contact Us
                </Link>
              </li>
              {settings?.support_phones && settings.support_phones.length > 0 ? (
                settings.support_phones.map((phone, i) => (
                  <li key={i}>
                    <a
                      href={`tel:${phone.number.replace(/\s+/g, "")}`}
                      className="inline-flex items-center gap-1.5 rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <Phone className="size-3 shrink-0" />
                      <span>{phone.label}: {phone.number}</span>
                    </a>
                  </li>
                ))
              ) : settings?.contact_phone ? (
                <li>
                  <a
                    href={`tel:${settings.contact_phone.replace(/\s+/g, "")}`}
                    className="inline-flex items-center gap-1.5 rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Phone className="size-3 shrink-0" />
                    <span>{settings.contact_phone}</span>
                  </a>
                </li>
              ) : null}
              {settings?.contact_email && (
                <li>
                  <a
                    href={`mailto:${settings.contact_email}`}
                    className="inline-flex items-center gap-1.5 rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Mail className="size-3 shrink-0" />
                    <span>{settings.contact_email}</span>
                  </a>
                </li>
              )}
            </ul>
          </nav>

          <nav aria-label="Social">
            <h2 className="text-xs font-semibold tracking-[0.25em] text-gold uppercase">
              Social
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {socialLinks.map(({ name, href, Icon }) => (
                <li key={name}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {settings?.store_name || "Wayaz Collection"}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
