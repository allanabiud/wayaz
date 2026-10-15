"use client";

import { useLinkStatus } from "next/link";
import { cn } from "cn";

/** Fixed-size pending dot for a parent <Link>; the .link-hint CSS fades it
 *  in after 100ms so fast navigations never flash it. */
export function LinkHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn("link-hint", pending && "is-pending")}
      aria-hidden="true"
    />
  );
}
