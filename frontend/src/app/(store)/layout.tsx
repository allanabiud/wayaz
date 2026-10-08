import type { Metadata } from "next";
import { StoreProvider } from "@/components/store/store-context";
import { StoreHeader } from "@/components/store/store-header";
import { StoreFooter } from "@/components/store/store-footer";

export const metadata: Metadata = {
  title: {
    default: "Wayaz Collection",
    template: "%s · Wayaz Collection",
  },
  description:
    "Shop the Wayaz Collection - browse the latest pieces and order on WhatsApp or add them to your cart. Delivery across Kenya.",
  robots: { index: true, follow: true },
};

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StoreProvider>
      <div className="flex min-h-screen flex-col">
        <StoreHeader />
        <div className="flex-1">{children}</div>
        <StoreFooter />
      </div>
    </StoreProvider>
  );
}
