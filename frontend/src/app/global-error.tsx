"use client";

import { useEffect } from "react";

import "./globals.css";

/** Last-resort boundary: renders when the root layout itself fails, so it
 *  defines its own <html>/<body>. (No metadata exports here - use <title>.) */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f7f7f8] text-zinc-900 antialiased">
        <title>Something went wrong · Wayaz Collection</title>
        <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <div className="w-full max-w-md rounded-3xl border bg-white p-8 shadow-xs">
            <h1 className="font-heading text-2xl font-bold">
              Wayaz Collection
            </h1>
            <p className="mt-3 text-sm text-zinc-500">
              Something went wrong on our end. Please reload the page, or
              message us on WhatsApp if the problem persists.
            </p>
            <button
              type="button"
              onClick={() => retry()}
              className="mt-6 w-full rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
