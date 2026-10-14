"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Banknote,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Loader2,
  Lock,
  Package,
  Pencil,
  Plus,
  ShoppingBag,
  Smartphone,
  Tag,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/brand-icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/admin/states";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/components/store/store-context";
import { ApiError } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import {
  createAddress,
  fetchAutoCoupon,
  fetchUserAddresses,
  formatKsh,
  initiateMpesaStkPush,
  submitCheckout,
  validateCoupon,
  type CheckoutOrder,
  type CouponValidation,
  type StoreOrder,
} from "@/lib/store";
import type { Address } from "@/lib/types";
import { KENYAN_COUNTIES } from "@/lib/locations";
import { MpesaPaymentModal } from "@/components/store/mpesa-modal";

export function CheckoutView() {
  const { user, isAuthenticated } = useAuth();
  const { cart, clearCart, openLogin } = useStore();

  // Saved addresses state for logged in customers
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "new">("new");
  // Persist a freshly typed address to the account after checkout.
  const [saveToAccount, setSaveToAccount] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  // Expand the form for a selected saved address (collapsed into a summary otherwise).
  const [editingAddress, setEditingAddress] = useState(false);

  // Address form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [county, setCounty] = useState("Nairobi");
  const [town, setTown] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "mpesa">("cod");

  // Coupon: validated against the cart before the order exists, so the
  // discount in the summary is the one the server will actually take.
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidation | null>(
    null,
  );
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  // Once the shopper takes over - typing a code or removing one - the
  // auto preview stands down and stops overwriting their choice.
  const couponOverrideRef = useRef(false);

  const [submitting, setSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<StoreOrder | null>(null);

  // M-Pesa STK Push Modal State
  const [mpesaModal, setMpesaModal] = useState<{
    open: boolean;
    order: CheckoutOrder | null;
    checkoutRequestId: string;
    phoneNumber: string;
    isMock?: boolean;
  }>({
    open: false,
    order: null,
    checkoutRequestId: "",
    phoneNumber: "",
    isMock: false,
  });

  // Load saved addresses when authenticated. State updates happen in the
  // async callbacks, never synchronously in the effect body.
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchUserAddresses()
      .then((res) => {
        const addrs = res.results || [];
        setSavedAddresses(addrs);
        // Pre-fill contact details from the account.
        if (user?.email) setEmail((prev) => prev || user.email);
        if (addrs.length > 0) {
          const def = addrs.find((a) => a.is_default) || addrs[0];
          setSelectedAddressId(def.id);
          setFullName(def.full_name);
          setPhone(def.phone_number);
          setCounty(def.county);
          setTown(def.town);
          setStreetAddress(def.street_address);
        } else if (user) {
          if (user.display_name) setFullName(user.display_name);
          if (user.phone_number) setPhone(user.phone_number);
        }
      })
      .catch(() => {
        // If address fetch fails, fall back to the manual form.
        if (user?.email) setEmail((prev) => prev || user.email);
      });
  }, [isAuthenticated, user]);

  // Self-applying coupons: preview whichever auto coupon would claim this
  // cart so the discount shows up with nothing typed. Re-runs when the
  // cart or sign-in state changes; the ref stops it dead once the
  // shopper has made their own choice.
  const cartSubtotal = cart?.subtotal ?? null;
  const cartItemCount = cart?.items.length ?? 0;
  useEffect(() => {
    if (cartItemCount === 0 || couponOverrideRef.current) return;
    let cancelled = false;
    fetchAutoCoupon()
      .then((preview) => {
        if (cancelled || couponOverrideRef.current) return;
        setAppliedCoupon(preview);
      })
      .catch(() => {
        // Non-fatal: the server re-decides when the order is placed.
      });
    return () => {
      cancelled = true;
    };
  }, [cartSubtotal, cartItemCount, isAuthenticated]);

  // When user picks an existing saved address card
  const handleSelectAddress = (addr: Address) => {
    setSelectedAddressId(addr.id);
    setFullName(addr.full_name);
    setPhone(addr.phone_number);
    setCounty(addr.county);
    setTown(addr.town);
    setStreetAddress(addr.street_address);
    setSaveToAccount(false);
    setSaveAsDefault(false);
    setEditingAddress(false); // collapse into the summary card
  };

  const handleSelectNewAddress = () => {
    setSelectedAddressId("new");
    setFullName(user?.display_name || "");
    setPhone(user?.phone_number || "");
    setCounty("Nairobi");
    setTown("");
    setStreetAddress("");
    setSaveToAccount(false);
    setSaveAsDefault(false);
    setEditingAddress(true);
  };

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code || couponBusy) return;
    setCouponBusy(true);
    setCouponError(null);
    try {
      const result = await validateCoupon(code);
      if (Number(result.discount_amount) <= 0) {
        setCouponError(
          "That code does not take anything off your current cart.",
        );
      } else {
        couponOverrideRef.current = true;
        setAppliedCoupon(result);
        setCouponInput("");
        toast.success(`Coupon ${result.code} applied`);
      }
    } catch (err) {
      setCouponError(
        err instanceof ApiError ? err.message : "That coupon code is not valid.",
      );
    } finally {
      setCouponBusy(false);
    }
  };

  const removeCoupon = () => {
    // Removing is an explicit choice too: tell the server to skip any
    // auto coupon by sending a blank code rather than omitting the key.
    couponOverrideRef.current = true;
    setAppliedCoupon(null);
    setCouponError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cart || cart.items.length === 0) {
      toast.error("Your cart is empty.");
      return;
    }

    if (!county) {
      toast.error("Please select a county.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await submitCheckout({
        full_name: fullName.trim(),
        email: email.trim(),
        phone_number: phone.trim(),
        county,
        town: town.trim(),
        street_address: streetAddress.trim(),
        payment_method: paymentMethod,
        // The server re-validates and recomputes; this only names the
        // code. Omitting the key lets an auto coupon claim the order,
        // while an explicit blank means "no coupon, not even an auto one".
        coupon_code:
          appliedCoupon?.code ??
          (couponOverrideRef.current ? "" : undefined),
      });

      // Persist the freshly typed address for faster checkout next time.
      if (isAuthenticated && selectedAddressId === "new" && saveToAccount) {
        try {
          await createAddress({
            full_name: fullName.trim(),
            phone_number: phone.trim(),
            county,
            town: town.trim(),
            street_address: streetAddress.trim(),
            is_default: saveAsDefault,
          });
        } catch {
          // Non-fatal: the order already went through.
        }
      }

      // If Lipa na M-Pesa is chosen, trigger STK Push immediately
      if (paymentMethod === "mpesa") {
        try {
          const stkRes = await initiateMpesaStkPush(
            order.order_number,
            phone.trim(),
            order.payment_token,
          );
          setMpesaModal({
            open: true,
            order,
            checkoutRequestId: stkRes.checkout_request_id,
            phoneNumber: stkRes.phone_number,
            isMock: stkRes.is_mock,
          });
          return;
        } catch (stkErr) {
          toast.error(
            stkErr instanceof ApiError
              ? stkErr.message
              : "Failed to dispatch M-Pesa STK Push. You can pay on delivery.",
          );
          // Fall through to show order completed with payment pending
        }
      }

      clearCart();
      setCompletedOrder(order);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to place order.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Order Success Screen
  if (completedOrder) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl border bg-card p-6 sm:p-8 text-center shadow-xs">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="size-8" />
          </div>

          <h1 className="mt-4 font-heading text-2xl font-bold sm:text-3xl">
            Order Received!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Thank you for shopping with Wayaz. Your order has been placed and
            will be confirmed by our team shortly.
          </p>

          <div className="mt-6 rounded-2xl bg-muted/50 p-4 text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order number:</span>
              <span className="font-semibold tabular-nums">
                {completedOrder.order_number}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Recipient:</span>
              <span className="font-medium">{completedOrder.shipping_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Destination:</span>
              <span>
                {completedOrder.street_address}, {completedOrder.town},{" "}
                {completedOrder.county}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Method:</span>
              <span className="font-medium capitalize">
                {completedOrder.payment_method === "mpesa"
                  ? "Lipa na M-Pesa"
                  : completedOrder.payment_method_display}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Payment Status:</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  completedOrder.payment_status === "PAID"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}
              >
                {completedOrder.payment_status === "PAID" ? "Paid" : "Pending"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Order Status:</span>
              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                Processing — awaiting confirmation
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping:</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                Free
              </span>
            </div>
            {Number(completedOrder.discount_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Coupon{" "}
                  {completedOrder.coupon_code && (
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      {completedOrder.coupon_code}
                    </span>
                  )}:
                </span>
                <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                  - Ksh {formatKsh(completedOrder.discount_amount)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total:</span>
              <span className="tabular-nums">
                Ksh {formatKsh(completedOrder.total_amount)}
              </span>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {completedOrder.whatsapp_link && (
              <Button asChild className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <a
                  href={completedOrder.whatsapp_link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Confirm on WhatsApp
                  <WhatsAppIcon className="size-4" />
                </a>
              </Button>
            )}
            {isAuthenticated ? (
              <Button variant="outline" asChild>
                <Link href="/orders">View in My Orders</Link>
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link href="/">Back to Store</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Empty cart guard
  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <EmptyState
          title="Your cart is empty"
          hint="Add pieces from our collection before proceeding to checkout."
        />
        <div className="mt-6">
          <Button asChild>
            <Link href="/">Browse Collection</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Store
        </Link>
        <ChevronRight className="size-4" />
        <span className="text-foreground font-medium">Checkout</span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Checkout
        </h1>

        {!isAuthenticated && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Already have a Wayaz account?</span>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={openLogin}
              className="h-7 text-xs font-medium cursor-pointer"
            >
              Sign In
            </Button>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-8 lg:grid-cols-12">
        {/* Left Column: Shipping & Payment details */}
        <div className="space-y-6 lg:col-span-7">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="flex items-center gap-2">
                  <Truck className="size-5 text-primary" />
                  Shipping Details
                </span>
                {isAuthenticated && savedAddresses.length > 0 && selectedAddressId !== "new" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectNewAddress}
                    className="h-7 text-xs gap-1 text-primary cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    New address
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Saved Addresses Selector (for authenticated users with saved addresses) */}
              {isAuthenticated && savedAddresses.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">
                    Select a Saved Address
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {savedAddresses.map((addr) => {
                      const isSelected = selectedAddressId === addr.id;
                      return (
                        <div
                          key={addr.id}
                          onClick={() => handleSelectAddress(addr)}
                          className={`relative rounded-xl border p-3 cursor-pointer transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5 shadow-xs"
                              : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-semibold text-xs text-foreground truncate">
                              {addr.full_name}
                            </span>
                            {isSelected && (
                              <div className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Check className="size-3" />
                              </div>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground truncate">
                            {addr.street_address}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {addr.town}, {addr.county}
                          </p>
                          <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                            {addr.phone_number}
                          </p>
                        </div>
                      );
                    })}

                    <div
                      onClick={handleSelectNewAddress}
                      className={`flex flex-col items-center justify-center rounded-xl border border-dashed p-3 cursor-pointer text-center transition-all ${
                        selectedAddressId === "new"
                          ? "border-primary bg-primary/5 shadow-xs"
                          : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                      }`}
                    >
                      <Plus className="size-4 text-muted-foreground mb-1" />
                      <span className="text-xs font-medium text-foreground">
                        Use a different address
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Selected saved address: compact summary (email stays editable
                  since it isn't part of a saved address) */}
              {isAuthenticated && selectedAddressId !== "new" && !editingAddress ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3 rounded-xl border bg-muted/30 p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{fullName}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {streetAddress}, {town}, {county}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {phone}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingAddress(true)}
                        className="h-7 text-xs gap-1"
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. jane@example.com"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 pt-1">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Jane Doe"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. jane@example.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone Number (M-Pesa / Delivery)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 0712345678"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="county">County</Label>
                    <Select value={county} onValueChange={setCounty}>
                      <SelectTrigger id="county" className="w-full">
                        <SelectValue placeholder="Select County" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {KENYAN_COUNTIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="town">Town / Area</Label>
                    <Input
                      id="town"
                      required
                      value={town}
                      onChange={(e) => setTown(e.target.value)}
                      placeholder="e.g. Westlands / Kilimani"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="address">Street Address / House / Building</Label>
                    <Input
                      id="address"
                      required
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                      placeholder="e.g. Delta Towers, 4th Floor"
                    />
                  </div>

                  {/* Save the typed address for faster checkout next time */}
                  {isAuthenticated && selectedAddressId === "new" && (
                    <label className="flex items-center gap-2 sm:col-span-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveToAccount}
                        onChange={(e) => setSaveToAccount(e.target.checked)}
                        className="size-4 accent-primary"
                      />
                      <span className="text-sm">
                        Save this address to my account
                      </span>
                    </label>
                  )}
                  {isAuthenticated && selectedAddressId === "new" && saveToAccount && (
                    <label className="flex items-center gap-2 sm:col-span-2 cursor-pointer pl-6">
                      <input
                        type="checkbox"
                        checked={saveAsDefault}
                        onChange={(e) => setSaveAsDefault(e.target.checked)}
                        className="size-4 accent-primary"
                      />
                      <span className="text-sm text-muted-foreground">
                        Set as my default address
                      </span>
                    </label>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="size-5 text-primary" />
                Payment Method
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center justify-between rounded-xl border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="payment"
                    value="cod"
                    checked={paymentMethod === "cod"}
                    onChange={() => setPaymentMethod("cod")}
                    className="size-4 text-primary accent-primary"
                  />
                  <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                    <Banknote className="size-5" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">Cash on Delivery</div>
                    <div className="text-xs text-muted-foreground">
                      Pay with cash or M-Pesa upon receiving your order
                    </div>
                  </div>
                </div>
              </label>

              <label className="flex items-center justify-between rounded-xl border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="payment"
                    value="mpesa"
                    checked={paymentMethod === "mpesa"}
                    onChange={() => setPaymentMethod("mpesa")}
                    className="size-4 text-primary accent-primary"
                  />
                  <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-xs">
                    <Smartphone className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">Lipa na M-Pesa</span>
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">STK Push</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Prompt sent to your Safaricom phone ({phone || "your number"})
                    </div>
                  </div>
                </div>
              </label>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Order Summary */}
        <div className="lg:col-span-5">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="size-5 text-primary" />
                Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="divide-y max-h-64 overflow-y-auto pr-1">
                {cart.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.product.thumbnail ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={mediaUrl(item.product.thumbnail)}
                          alt={item.product.product_title}
                          className="size-12 rounded-lg object-cover bg-muted shrink-0"
                        />
                      ) : (
                        <div className="flex size-12 items-center justify-center rounded-lg bg-muted shrink-0">
                          <ShoppingBag className="size-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {item.product.product_title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.size ? `Size: ${item.size} · ` : ""}Qty:{" "}
                          {item.quantity}
                        </p>
                      </div>
                    </div>
                    <div className="tabular-nums font-medium shrink-0">
                      Ksh {formatKsh(item.line_total)}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="border-t pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium tabular-nums">
                    Ksh {formatKsh(cart.subtotal)}
                  </span>
                </div>

                {appliedCoupon ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <Tag className="size-3.5 shrink-0" />
                      <span className="truncate font-medium">
                        {appliedCoupon.code}
                        {appliedCoupon.auto_applied && (
                          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                            auto-applied
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={removeCoupon}
                        className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Remove
                      </button>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      - Ksh {formatKsh(appliedCoupon.discount_amount)}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <Input
                        value={couponInput}
                        onChange={(e) => {
                          setCouponInput(e.target.value);
                          setCouponError(null);
                        }}
                        placeholder="Coupon code"
                        aria-label="Coupon code"
                        className="h-9 flex-1 uppercase text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 px-3 text-xs"
                        disabled={couponBusy || !couponInput.trim()}
                        onClick={() => void applyCoupon()}
                      >
                        {couponBusy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          "Apply"
                        )}
                      </Button>
                    </div>
                    {couponError && (
                      <p role="alert" className="text-xs text-destructive">
                        {couponError}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Free
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 text-base font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">
                    Ksh{" "}
                    {formatKsh(
                      Math.round(
                        Number(cart.subtotal) -
                          Number(appliedCoupon?.discount_amount ?? 0),
                      ),
                    )}
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full gap-2 text-base py-5 font-semibold"
              >
                {submitting ? "Placing Order..." : "Place Order"}
              </Button>

              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" />
                <span>Secure SSL checkout</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>

      {/* M-Pesa STK Push Polling & Simulation Modal */}
      {mpesaModal.order && (
        <MpesaPaymentModal
          open={mpesaModal.open}
          orderNumber={mpesaModal.order.order_number}
          checkoutRequestId={mpesaModal.checkoutRequestId}
          paymentToken={mpesaModal.order.payment_token}
          phoneNumber={mpesaModal.phoneNumber}
          amount={formatKsh(mpesaModal.order.total_amount)}
          isMock={mpesaModal.isMock}
          onSuccess={(receipt) => {
            clearCart();
            const finalizedOrder = {
              ...mpesaModal.order!,
              payment_status: "PAID",
              status: "PROCESSING" as const,
              status_display: "Processing",
            };
            setMpesaModal((prev) => ({ ...prev, open: false }));
            setCompletedOrder(finalizedOrder);
            toast.success(`Payment received! Receipt: ${receipt}`);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onCancelOrFailed={() => {
            // Shopper dismissed modal or failed: complete order as pending payment
            clearCart();
            const pendingOrder = mpesaModal.order!;
            setMpesaModal((prev) => ({ ...prev, open: false }));
            setCompletedOrder(pendingOrder);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
