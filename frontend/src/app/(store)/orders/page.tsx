import type { Metadata } from "next";
import { OrdersView } from "@/components/store/orders-view";

export const metadata: Metadata = {
  title: "Orders",
  description:
    "Track every Wayaz Collection order placed with your account - status, delivery details, and WhatsApp follow-up.",
  // Account-only page: never list it in search results.
  robots: { index: false, follow: false },
};

export default function OrdersPage() {
  return <OrdersView />;
}
