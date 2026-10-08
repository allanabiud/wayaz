"use client";

import Link from "next/link";
import {
  FacebookIcon,
  InstagramIcon,
  WhatsAppIcon,
} from "@/components/brand-icons";
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

/** Point these at the brand's real profiles (NEXT_PUBLIC_* overrides). */
const INSTAGRAM_URL =
  process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? "https://www.instagram.com/wayaz";
const FACEBOOK_URL =
  process.env.NEXT_PUBLIC_FACEBOOK_URL ?? "https://www.facebook.com/wayaz";

const SOCIAL_LINKS = [
  { name: "Instagram", href: INSTAGRAM_URL, Icon: InstagramIcon },
  {
    name: "WhatsApp",
    href: waLink("Hi Wayaz, I'd like to know more about your products."),
    Icon: WhatsAppIcon,
  },
  { name: "Facebook", href: FACEBOOK_URL, Icon: FacebookIcon },
];

export function StoreFooter() {
  const { catalog, catalogLoading } = useStore();
  const year = new Date().getFullYear();

  // A product link appears only when its category exists and has items, so
  // the footer never points at an empty or missing category page.
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
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="text-sm font-semibold tracking-tight">
              Wayaz Collection
            </p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Fresh pieces delivered across Kenya - order on WhatsApp or add
              them to your cart.
            </p>
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

          <nav aria-label="Social">
            <h2 className="text-xs font-semibold tracking-[0.25em] text-gold uppercase">
              Social
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {SOCIAL_LINKS.map(({ name, href, Icon }) => (
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
          <p>© {year} Wayaz Collection. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
