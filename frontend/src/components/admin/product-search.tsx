"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { formatKsh } from "@/lib/store-api";
import type { Paginated, Product } from "@/lib/types";

export function ProductSearch({
  onFocusChange,
}: {
  onFocusChange?: (focused: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const changeFocus = (value: boolean) => {
    setFocused(value);
    onFocusChange?.(value);
  };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get<Paginated<Product>>(
          `/api/v1/admin/products/?search=${encodeURIComponent(q)}`,
        );
        setResults(res.results.slice(0, 8));
      } catch (err) {
        console.error("Live search failed:", err);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectProduct = (prod: Product) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(`/admin/products/${prod.id}`);
  };

  return (
    <div
      ref={containerRef}
      className={`relative shrink-0 transition-[width] duration-200 ${focused ? "w-52 sm:w-96" : "w-40 sm:w-56 lg:w-64"}`}
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search products…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          changeFocus(true);
          setOpen(true);
        }}
        onBlur={() => {
          changeFocus(false);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="h-9 w-full rounded-lg border border-border/60 bg-muted/50 pl-8 pr-8 text-sm outline-none transition-all duration-200 focus:bg-card dark:focus:bg-background focus:border-primary"
      />

      {searching && query.trim() ? (
        <Loader2 className="absolute right-2.5 top-1/2 size-3 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : query ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setQuery("");
            setResults([]);
            setOpen(false);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex size-4 items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <X className="size-3" />
        </button>
      ) : null}

      {open && query.trim().length > 0 && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="absolute right-0 top-full mt-2 w-full rounded-xl border border-border/60 bg-popover p-1.5 text-popover-foreground shadow-xl ring-1 ring-foreground/5 z-50 animate-in fade-in-0 zoom-in-95"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Products {results.length > 0 && `(${results.length})`}
          </div>
          <Separator className="my-1 opacity-50" />
          {searching ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
              <Loader2 className="size-3 animate-spin text-primary" />
              Searching catalog…
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No products found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-0.5">
              {results.map((prod) => {
                const isOutOfStock =
                  !prod.is_in_stock || prod.stock_quantity <= 0;
                return (
                  <div
                    key={prod.id}
                    onClick={() => handleSelectProduct(prod)}
                    className="flex items-center gap-2.5 rounded-lg p-2 text-xs cursor-pointer hover:bg-accent transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground leading-tight">
                        {prod.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                        <span>{prod.category_name || "Catalog"}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-bold text-primary">
                        Ksh {formatKsh(prod.sale_price ?? prod.base_price)}
                      </span>
                      <span
                        className={`text-[10px] font-medium ${isOutOfStock ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {isOutOfStock
                          ? "Out of stock"
                          : `${prod.stock_quantity} pcs`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
