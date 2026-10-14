import type { MetadataRoute } from "next";

import { SERVER_API_URL } from "@/lib/api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wayaz.co.ke";

interface SlugPayload {
  slug: string;
  updated_at?: string;
}

interface Paginated {
  results?: SlugPayload[];
  next?: string | null;
}

/** Fetch every page of a paginated catalog endpoint, bounded so a backend
 *  quirk can't make the sitemap loop forever. */
async function fetchAllSlugs(
  path: string,
  maxPages = 20,
): Promise<SlugPayload[]> {
  const slugs: SlugPayload[] = [];
  let url: string | null = `${SERVER_API_URL}${path}`;

  for (let page = 0; url && page < maxPages; page += 1) {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok)
      throw new Error(`Catalog fetch failed (${res.status}): ${url}`);
    const data = (await res.json()) as Paginated;
    slugs.push(...(data.results ?? []));
    url = data.next ?? null;
  }
  return slugs;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/categories`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  // Best-effort: if the API is unreachable, ship the static routes rather
  // than failing the build; the sitemap regenerates hourly in normal runs.
  try {
    const [categories, products] = await Promise.all([
      fetchAllSlugs("/api/v1/catalog/categories/"),
      fetchAllSlugs("/api/v1/catalog/products/"),
    ]);

    for (const category of categories) {
      entries.push({
        url: `${SITE_URL}/categories/${category.slug}`,
        lastModified: category.updated_at ? new Date(category.updated_at) : now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
    for (const product of products) {
      entries.push({
        url: `${SITE_URL}/products/${product.slug}`,
        lastModified: product.updated_at ? new Date(product.updated_at) : now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } catch (err) {
    console.error(
      "Sitemap: catalog fetch failed, emitting static routes only",
      err,
    );
  }

  return entries;
}
