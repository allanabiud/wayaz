import type { Metadata } from "next";
import { AccountView } from "@/components/store/account-view";

export const metadata: Metadata = {
  title: "My Account",
  description:
    "Manage your Wayaz Collection profile, password, and saved delivery addresses for faster checkout.",
  // Account-only page: never list it in search results.
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <AccountView />;
}
