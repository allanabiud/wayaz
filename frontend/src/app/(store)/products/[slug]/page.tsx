import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import { ProductDetail } from "@/components/store/product-detail";
import type { StoreProductDetail } from "@/lib/store";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getProduct(slug: string): Promise<StoreProductDetail | null> {
  try {
    return await api.get<StoreProductDetail>(
      `/api/v1/catalog/products/${encodeURIComponent(slug)}/`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Product not found" };

  const description =
    product.description?.slice(0, 160) ||
    `Shop ${product.title} from the Wayaz Collection. Order on WhatsApp or add it to your cart.`;
  const image =
    product.images.find((photo) => photo.is_primary)?.image ??
    product.images[0]?.image;

  return {
    title: product.title,
    description,
    openGraph: {
      title: product.title,
      description,
      type: "website",
      ...(image ? { images: [{ url: mediaUrl(image) }] } : {}),
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  // Remount on navigation so size/quantity selection resets per product.
  return <ProductDetail key={product.id} product={product} />;
}
