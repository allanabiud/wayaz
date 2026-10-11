import type { Metadata } from "next";
import { CheckoutView } from "@/components/store/checkout-view";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your Wayaz order with cash on delivery or M-Pesa.",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
