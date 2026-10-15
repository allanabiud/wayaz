"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";

const SEGMENT_LABELS: Record<string, string> = {
  products: "Products",
  customers: "Customers",
};

function titleize(segment: string): string {
  return segment.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const startsAdmin = segments[0] === "admin";
  const tail = startsAdmin ? segments.slice(1) : segments;

  // Product routes show the fetched title instead of the raw id.
  const isProductRoute =
    startsAdmin &&
    segments[1] === "products" &&
    /^\d+$/.test(segments[2] ?? "");
  const productId = isProductRoute ? segments[2] : null;

  const [fetchedTitle, setFetchedTitle] = useState<{
    id: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    if (!productId) return;
    let active = true;
    api
      .get<Product>(`/api/v1/admin/products/${productId}/`)
      .then((p) => {
        if (active) setFetchedTitle({ id: productId, title: p.title });
      })
      .catch(() => {
        /* keep the numeric fallback */
      });
    return () => {
      active = false;
    };
  }, [productId]);

  const productTitle =
    fetchedTitle && fetchedTitle.id === productId ? fetchedTitle.title : null;

  const crumbs: Array<{ label: string; href: string | null }> = [
    { label: "Dashboard", href: "/admin" },
  ];
  tail.forEach((segment, idx) => {
    const isLast = idx === tail.length - 1;
    const href =
      "/" + segments.slice(0, (startsAdmin ? 1 : 0) + idx + 1).join("/");
    const isProductIdSegment = isProductRoute && startsAdmin && idx === 1;
    let label = SEGMENT_LABELS[segment] ?? titleize(segment);
    if (isProductIdSegment) {
      label = productTitle ?? `Product #${productId}`;
    }
    crumbs.push({ label, href: isLast ? null : href });
  });

  return (
    <nav aria-label="breadcrumb" className="min-w-0 truncate">
      <ol className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => (
          <li
            key={`${crumb.label}-${index}`}
            className="flex min-w-0 items-center gap-1.5"
          >
            {index > 0 && (
              <ChevronRight
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground/50"
              />
            )}
            {crumb.href === null ? (
              <span className="truncate font-medium text-foreground">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
