import type { Metadata } from "next";

// Shared auth metadata: branded by the root layout but never indexed -
// these pages sit behind login walls and mustn't surface in search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
