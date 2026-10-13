import type { Metadata } from "next";
import { AdminGate } from "@/components/admin/admin-gate";

// Server component on purpose: admin routes must never be indexed, and
// metadata can only be exported from server components (the dashboard
// itself is the client-side AdminGate).
export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s · Wayaz Admin",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminGate>{children}</AdminGate>;
}
