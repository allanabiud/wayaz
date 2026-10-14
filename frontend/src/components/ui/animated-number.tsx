"use client";

import { useEffect, useRef, useState } from "react";

export interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  formatter?: (val: number) => string;
  /** Alias for formatter. */
  format?: (val: number) => string;
  className?: string;
  animateOnMount?: boolean;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

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
      // Apply via rAF so nothing is set synchronously in the effect body.
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
