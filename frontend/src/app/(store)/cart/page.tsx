import type { Metadata } from "next";
import { CartView } from "@/components/store/cart-view";

export const metadata: Metadata = {
  title: "Your cart",
  description:
    "Review the pieces in your Wayaz cart - adjust sizes and quantities, then check out with cash on delivery or M-Pesa.",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return <CartView />;
}
