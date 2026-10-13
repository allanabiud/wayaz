import type { Metadata } from "next";

// Shared metadata for the auth pages (login, forgot/reset password):
// branded by the root layout but never indexed - they sit behind login
// walls for shoppers and mustn't surface in search results.
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
