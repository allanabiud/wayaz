"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  pollPaymentStatus,
  simulateMockPayment,
  type PaymentStatusResponse,
} from "@/lib/store-api";

interface MpesaPaymentModalProps {
  open: boolean;
  orderNumber: string;
  checkoutRequestId: string;
  /** Signed token from the checkout response; the payment status endpoint
   *  only answers to the order's owner (or token holder). */
  paymentToken: string;
  phoneNumber: string;
  amount: string;
  isMock?: boolean;
  onSuccess: (receipt: string) => void;
  onCancelOrFailed: (reason?: string) => void;
}

const TOTAL_TIMEOUT_SECONDS = 60;

export function MpesaPaymentModal({
  open,
  orderNumber,
  checkoutRequestId,
  paymentToken,
  phoneNumber,
  amount,
  isMock = false,
  onSuccess,
  onCancelOrFailed,
}: MpesaPaymentModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_TIMEOUT_SECONDS);
  const [status, setStatus] = useState<"polling" | "success" | "failed">(
    "polling",
  );
  const [statusMessage, setStatusMessage] = useState(
    "Check your phone for the M-Pesa PIN prompt...",
  );
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !checkoutRequestId || status !== "polling") return;

    let isCancelled = false;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!isCancelled) {
            setStatus("failed");
            setStatusMessage("Payment request timed out. Please try again.");
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const pollInterval = setInterval(async () => {
      try {
        const res: PaymentStatusResponse = await pollPaymentStatus(
          checkoutRequestId,
          paymentToken,
        );
        if (isCancelled) return;

        if (res.status === "COMPLETED" || res.payment_status === "PAID") {
          clearInterval(pollInterval);
          clearInterval(timer);
          setStatus("success");
          const receipt = res.mpesa_receipt_number || "RECEIVED";
          setReceiptNumber(receipt);
          setStatusMessage("Payment received successfully!");
          setTimeout(() => {
            onSuccess(receipt);
          }, 1500);
        } else if (res.status === "FAILED" || res.status === "CANCELLED") {
          clearInterval(pollInterval);
          clearInterval(timer);
          setStatus("failed");
          setStatusMessage(
            res.result_desc || "M-Pesa payment was cancelled or failed.",
          );
        }
      } catch {
        // Keep polling through network errors.
      }
    }, 2500);

    return () => {
      isCancelled = true;
      clearInterval(timer);
      clearInterval(pollInterval);
    };
  }, [open, checkoutRequestId, paymentToken, status, onSuccess]);

  const handleSimulate = async (action: "success" | "fail") => {
    try {
      await simulateMockPayment(checkoutRequestId, action);
      if (action === "success") {
        toast.success("Simulated M-Pesa payment approval");
      } else {
        toast.error("Simulated M-Pesa cancellation");
      }
    } catch {
      toast.error("Failed to trigger mock simulation");
    }
  };

  const progressPercent =
    ((TOTAL_TIMEOUT_SECONDS - secondsLeft) / TOTAL_TIMEOUT_SECONDS) * 100;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && onCancelOrFailed("User dismissed")}
    >
      <DialogContent className="sm:max-w-md p-6" showCloseButton={false}>
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600">
            {status === "polling" ? (
              <Smartphone className="size-7 animate-pulse text-emerald-600" />
            ) : status === "success" ? (
              <CheckCircle2 className="size-8 text-emerald-600" />
            ) : (
              <AlertCircle className="size-8 text-destructive" />
            )}
          </div>

          <DialogTitle className="text-xl font-bold">
            {status === "polling"
              ? "M-Pesa Payment Request"
              : status === "success"
                ? "Payment Received!"
                : "Payment Incomplete"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {status === "polling"
              ? `A prompt for Ksh ${amount} has been sent to ${phoneNumber}`
              : statusMessage}
          </DialogDescription>
        </DialogHeader>

        {status === "polling" && (
          <div className="space-y-4 py-3">
            <div className="rounded-xl border bg-muted/40 p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Loader2 className="size-4 animate-spin text-emerald-600" />
                <span>Waiting for M-Pesa PIN...</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Unlock your phone and enter your M-Pesa PIN to complete payment
                for Order{" "}
                <span className="font-semibold text-foreground">
                  {orderNumber}
                </span>
                .
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Time remaining</span>
                <span className="font-mono font-medium">{secondsLeft}s</span>
              </div>
              <Progress value={progressPercent} className="h-1.5 bg-muted" />
            </div>

            {isMock && (
              <div className="rounded-lg border border-dashed border-gold/40 bg-gold/5 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between font-semibold text-gold">
                  <span>Development Test Mode</span>
                  <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px]">
                    Mock Gateway
                  </span>
                </div>
                <p className="text-muted-foreground">
                  Simulate shopper PIN confirmation without waiting for
                  Safaricom SMS:
                </p>
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    onClick={() => handleSimulate("success")}
                  >
                    Simulate Success
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    className="flex-1 text-destructive hover:bg-destructive/10"
                    onClick={() => handleSimulate("fail")}
                  >
                    Simulate Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {status === "success" && (
          <div className="py-4 text-center space-y-2">
            <p className="text-sm font-medium text-emerald-600">
              Receipt No: {receiptNumber}
            </p>
            <p className="text-xs text-muted-foreground">
              Your order is now being reviewed and will be confirmed shortly.
            </p>
          </div>
        )}

        {status === "failed" && (
          <div className="py-3 space-y-3">
            <p className="text-center text-xs text-muted-foreground">
              Didn&apos;t receive the prompt or entered the wrong PIN? You can
              try again or switch to Cash on Delivery.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => onCancelOrFailed("Failed")}
                className="w-full"
              >
                Close & Return to Checkout
              </Button>
            </div>
          </div>
        )}

        {status === "polling" && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => onCancelOrFailed("Cancelled by user")}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              Cancel and pay on delivery instead
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
