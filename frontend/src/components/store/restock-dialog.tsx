"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

// The dialog only reads the id (to POST) and the title (to echo back in the
// toast), so it accepts any catalog shape - the card's StoreProduct and the
// detail page's StoreProductDetail both satisfy this.
interface RestockableProduct {
  id: number;
  title: string;
}

/**
 * "Tell me when it's back" for an out-of-stock piece. The card and the
 * product detail page share this so the wording and behaviour stay
 * identical wherever the shopper hits a sold-out item.
 */
export function RestockDialog({
  product,
  open,
  onOpenChange,
}: {
  product: RestockableProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  // Signed-in shoppers skip the prompt entirely - their account email is
  // used as-is. Only guests (or accounts with no email on file) are asked.
  const accountEmail = user?.email?.trim() ?? "";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const targetEmail = accountEmail || email.trim();
  const canSubmit = targetEmail.length > 0;

  const handleOpenChange = (next: boolean) => {
    // Reset the field on open so a previous address doesn't linger. Done in
    // the open handler (not an effect) to avoid setState-in-effect.
    if (next) setEmail("");
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const value = targetEmail.toLowerCase();
    setBusy(true);
    try {
      await api.post("/api/v1/catalog/restock-notifications/", {
        product: product.id,
        email: value,
      });
      onOpenChange(false);
      toast.success("You're on the list", {
        description: `We'll email ${value} when ${product.title} is back.`,
      });
    } catch {
      toast.error("Could not sign you up", {
        description: "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <BellRing className="size-4 text-amber-600" />
            Notify on restock
          </DialogTitle>
          <DialogDescription className="text-xs">
            {product.title} is out of stock. We&apos;ll ping you the moment it
            lands again.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          {accountEmail ? (
            // Account email in place of the input - one less thing to type.
            <div className="rounded-lg border bg-muted/50 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">
                We&apos;ll notify this address:
              </p>
              <p className="mt-0.5 truncate text-sm font-medium">
                {accountEmail}
              </p>
            </div>
          ) : (
            <Input
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              aria-label="Email address"
            />
          )}

          <DialogFooter>
            <Button
              type="submit"
              size="lg"
              className={cn(
                "w-full gap-2 sm:w-auto",
                "restock-button",
              )}
              disabled={busy || !canSubmit}
            >
              <BellRing className="size-4" />
              {busy ? "Signing you up…" : "Notify on restock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
