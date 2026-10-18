"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function NavigationProgressContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // When pathname or searchParams change, the navigation has completed
  useEffect(() => {
    if (!loading) return;

    const finishTimer = setTimeout(() => {
      setProgress(100);
    }, 0);

    const resetTimer = setTimeout(() => {
      setLoading(false);
      setProgress(0);
    }, 350);

    return () => {
      clearTimeout(finishTimer);
      clearTimeout(resetTimer);
    };
  }, [pathname, searchParams, loading]);

  // Intercept internal anchor clicks to start the progress indicator
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as Element).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href) return;

      // Ignore modified clicks, external links, downloads, and hash-only links
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        target.target === "_blank" ||
        target.hasAttribute("download") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }

      try {
        const currentUrl = new URL(window.location.href);
        const targetUrl = new URL(href, window.location.href);

        // Only handle same origin
        if (targetUrl.origin !== currentUrl.origin) return;

        // If it's the exact same path and query, skip
        if (
          targetUrl.pathname === currentUrl.pathname &&
          targetUrl.search === currentUrl.search
        ) {
          return;
        }

        setLoading(true);
        setProgress(25);
      } catch {
        // Invalid URL; ignore
      }
    };

    document.addEventListener("click", handleAnchorClick, true);
    return () => {
      document.removeEventListener("click", handleAnchorClick, true);
    };
  }, []);

  // Animate progress smoothly while waiting for the next route
  useEffect(() => {
    if (!loading) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 70) return prev + Math.random() * 15;
        if (prev < 90) return prev + Math.random() * 5;
        return prev;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [loading]);

  if (!loading && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px] pointer-events-none bg-transparent"
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_var(--color-primary)] transition-all ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          transition:
            progress === 100
              ? "all 300ms ease-out"
              : "width 200ms ease-out, opacity 300ms ease-out",
        }}
      />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressContent />
    </Suspense>
  );
}
