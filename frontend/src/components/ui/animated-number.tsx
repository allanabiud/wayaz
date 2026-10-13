"use client";

import { useEffect, useRef, useState } from "react";

export interface AnimatedNumberProps {
  /** The target number to count up or down to. */
  value: number;
  /** Duration of the count animation in milliseconds. Default 650ms. */
  duration?: number;
  /** Fixed decimal places to display. Default 0. */
  decimals?: number;
  /** Optional step precision, e.g. 0.1. */
  step?: number;
  /** Optional string prefix, e.g. "Ksh " or "$". */
  prefix?: string;
  /** Optional string suffix, e.g. "%" or " units". */
  suffix?: string;
  /** Custom formatter function. If provided, overrides default locale formatting. */
  formatter?: (val: number) => string;
  /** Alias for formatter. */
  format?: (val: number) => string;
  /** Additional CSS class names for the wrapper span. */
  className?: string;
  /** Whether to animate from 0 on initial mount. Default true. */
  animateOnMount?: boolean;
}

/** Cubic ease-out curve matching standard chart animations. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Hook that smoothly counts up or down to a target value whenever it changes.
 */
export function useCountUp(
  targetValue: number,
  options?: {
    duration?: number;
    animateOnMount?: boolean;
  },
): number {
  const duration = options?.duration ?? 650;
  const animateOnMount = options?.animateOnMount ?? true;

  const validTarget = Number.isFinite(targetValue) ? targetValue : 0;
  const [displayValue, setDisplayValue] = useState<number>(validTarget);
  const currentRef = useRef<number>(validTarget);
  const isFirstRender = useRef(true);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || duration <= 0) {
      // Snap straight to the target with no animation. The state update is
      // applied from the rAF callback so nothing is set synchronously in the
      // effect body; when the value is already current React bails out.
      currentRef.current = validTarget;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setDisplayValue(validTarget);
      });
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (!animateOnMount || validTarget === 0) {
        currentRef.current = validTarget;
        return;
      }
      // Animate from 0 to target on initial mount
      const startVal = 0;
      const endVal = validTarget;
      const startTime = performance.now();

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const current = startVal + (endVal - startVal) * easeOutCubic(progress);
        currentRef.current = current;
        setDisplayValue(current);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          currentRef.current = endVal;
          setDisplayValue(endVal);
          rafRef.current = null;
        }
      };

      rafRef.current = requestAnimationFrame(tick);
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    // Target value changed after mount: count up or down from current position
    const startVal = currentRef.current;
    const endVal = validTarget;

    if (startVal === endVal) {
      return;
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = startVal + (endVal - startVal) * easeOutCubic(progress);
      currentRef.current = current;
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        currentRef.current = endVal;
        setDisplayValue(endVal);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [validTarget, duration, animateOnMount]);

  return displayValue;
}

/**
 * AnimatedNumber component
 * Smoothly counts up or down to new values with cubic ease-out,
 * synchronizing with chart transitions when dashboard/analytics filters change.
 */
export function AnimatedNumber({
  value,
  duration = 650,
  decimals = 0,
  step,
  prefix = "",
  suffix = "",
  formatter,
  format,
  className,
  animateOnMount = true,
}: AnimatedNumberProps) {
  const animated = useCountUp(value, { duration, animateOnMount });
  const activeFormatter = formatter ?? format;

  const effectiveDecimals =
    decimals > 0
      ? decimals
      : step && step < 1
        ? Math.max(0, -Math.floor(Math.log10(step)))
        : 0;

  const formatted = (() => {
    if (activeFormatter) {
      const valToFormat =
        effectiveDecimals > 0
          ? Number(animated.toFixed(effectiveDecimals))
          : Math.round(animated);
      return activeFormatter(valToFormat);
    }
    if (effectiveDecimals > 0) {
      return animated.toLocaleString("en-KE", {
        minimumFractionDigits: effectiveDecimals,
        maximumFractionDigits: effectiveDecimals,
      });
    }
    return Math.round(animated).toLocaleString("en-KE");
  })();

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
