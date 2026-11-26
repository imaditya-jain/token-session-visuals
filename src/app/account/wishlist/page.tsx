import type { Metadata } from "next";

import AccountNav from "@/components/account/AccountNav";
import WishlistPanel from "@/components/account/WishlistPanel";
import AuthShell from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "My wishlist — Fernwood",
  robots: { index: false, follow: false },
  alternates: { canonical: "/account/wishlist" },
};

export default function WishlistPage() {
  return (
    <AuthShell eyebrow="Your account" title="My wishlist" wide>
      <AccountNav current="/account/wishlist" />
      <WishlistPanel />
    </AuthShell>
  );
}
