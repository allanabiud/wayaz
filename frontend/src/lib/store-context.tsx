"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@/lib/use-query";
import { CartSheet } from "@/components/store/cart-sheet";
import { WishlistSheet } from "@/components/store/wishlist-sheet";
import { LoginDialog } from "@/components/auth/login-dialog";
import {
  addToCart,
  fetchCart,
  fetchStorefrontCatalog,
  fetchStoreSettings,
  seedCatalogCache,
  storedCartId,
  clearStoredCartId,
  updateCartItem,
  type Cart,
  type StoreProduct,
  type StorefrontCatalog,
} from "@/lib/store-api";
import type { Paginated, StoreSettings } from "@/lib/types";

interface WishlistResponseItem {
  id: number;
  product: { id: number };
}

interface StoreContextValue {
  cart: Cart | null;
  cartCount: number;
  cartProductIds: ReadonlySet<number>;
  cartOpen: boolean;
  openCart: () => void;
  addingId: number | null;
  addProduct: (
    product: { id: number; title: string },
    options?: { quantity?: number; size?: string },
  ) => Promise<boolean>;
  bumpingId: number | null;
  /** +1 on the product's only line, or opens the cart sheet when it has
   *  several size lines so the shopper picks one. */
  bumpProduct: (product: { id: number; title: string }) => Promise<void>;
  wishlist: ReadonlySet<number>;
  wishlistCount: number;
  wishlistProducts: StoreProduct[];
  toggleWishlist: (product: { id: number; title: string }) => Promise<void>;
  wishlistOpen: boolean;
  openWishlist: () => void;
  catalog: StorefrontCatalog | null;
  catalogLoading: boolean;
  catalogError: string | null;
  refetchCatalog: () => void;
  settings: StoreSettings | null;
  settingsLoading: boolean;
  refetchSettings: () => void;
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
  clearCart: () => void;
  refreshCart: () => void;
  updateCart: (next: Cart | null) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore(): StoreContextValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used within <StoreProvider>");
  return value;
}

/** Module-level empty list keeps the logged-out context value referentially stable. */
const EMPTY_WISHLIST_IDS: number[] = [];

export function StoreProvider({
  children,
  initialCatalog,
}: {
  children: ReactNode;
  initialCatalog?: StorefrontCatalog | null;
}) {
  const { isAuthenticated } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [wishlistIds, setWishlistIds] = useState<number[]>([]);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  // Seed the client-side catalog cache from SSR data so the first
  // client-side fetch resolves instantly instead of hitting the network.
  if (initialCatalog && typeof window !== "undefined") {
    seedCatalogCache(initialCatalog);
  }

  const {
    data: catalog,
    error: catalogError,
    loading: catalogLoading,
    refetch: refetchCatalog,
  } = useQuery<StorefrontCatalog>(
    fetchStorefrontCatalog,
    [],
    initialCatalog ? { initialData: initialCatalog } : undefined,
  );

  const {
    data: settings,
    loading: settingsLoading,
    refetch: refetchSettings,
  } = useQuery<StoreSettings>(fetchStoreSettings, []);

  // Initial cart load (guest session from the stored cart id).
  useEffect(() => {
    if (!storedCartId()) return;
    let cancelled = false;
    fetchCart()
      .then((next) => {
        if (!cancelled) setCart(next);
      })
      .catch(() => {
        // Stale cart id; the next cart action replaces it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cart merge when transitioning from guest session to authenticated user.
  useEffect(() => {
    if (!isAuthenticated) return;
    const guestId = storedCartId();
    if (!guestId) {
      fetchCart()
        .then(setCart)
        .catch(() => {});
      return;
    }

    api
      .post<Cart>("/api/v1/orders/cart/merge/", { guest_cart_id: guestId })
      .then((merged) => {
        clearStoredCartId();
        setCart(merged);
      })
      .catch(() => {
        clearStoredCartId();
        fetchCart()
          .then(setCart)
          .catch(() => {});
      });
  }, [isAuthenticated]);

  // Wishlist sync, tied to the authenticated user.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    api
      .get<Paginated<WishlistResponseItem>>(
        "/api/v1/auth/wishlist/?page_size=100",
      )
      .then((res) => {
        if (!cancelled && res?.results) {
          setWishlistIds(res.results.map((item) => item.product.id));
        }
      })
      .catch(() => {
        // Keep whatever the optimistic update last wrote.
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Logged-out sessions expose an empty list without discarding state, so a
  // re-login shows the previous ids until the fetch above overwrites them.
  const activeWishlistIds = isAuthenticated ? wishlistIds : EMPTY_WISHLIST_IDS;

  /** Resolves true only when the item landed in the cart; "Buy now" uses
   *  that to decide whether to jump to checkout. */
  const addProduct = useCallback(
    async (
      product: { id: number; title: string },
      options?: { quantity?: number; size?: string },
    ): Promise<boolean> => {
      if (addingId !== null) return false;
      setAddingId(product.id);
      try {
        const next = await addToCart(
          product.id,
          options?.quantity ?? 1,
          options?.size ?? "",
        );
        setCart(next);
        toast.success("Added to cart", { description: product.title });
        return true;
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not add to cart.",
        );
        return false;
      } finally {
        setAddingId(null);
      }
    },
    [addingId],
  );

  const [bumpingId, setBumpingId] = useState<number | null>(null);

  const bumpProduct = useCallback(
    async (product: { id: number; title: string }) => {
      if (bumpingId !== null) return;
      const lines = (cart?.items ?? []).filter(
        (line) => line.product.id === product.id,
      );
      if (lines.length === 0) return;
      // Several size lines: hand the shopper the cart instead of guessing
      // which one to bump.
      if (lines.length > 1) {
        setCartOpen(true);
        return;
      }

      const line = lines[0];
      setBumpingId(product.id);
      try {
        const next = await updateCartItem(line.id, line.quantity + 1);
        setCart(next);
        toast.success("Quantity updated", { description: product.title });
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not update quantity.",
        );
      } finally {
        setBumpingId(null);
      }
    },
    [cart, bumpingId],
  );

  const toggleWishlist = useCallback(
    async (product: { id: number; title: string }) => {
      if (!isAuthenticated) {
        toast("Sign in to save to your wishlist", {
          description: "Your wishlist is saved to your account.",
        });
        setLoginOpen(true);
        return;
      }

      const isWishlisted = activeWishlistIds.includes(product.id);
      const next = isWishlisted
        ? activeWishlistIds.filter((id) => id !== product.id)
        : [...activeWishlistIds, product.id];

      setWishlistIds(next);
      toast(isWishlisted ? "Removed from wishlist" : "Saved to wishlist", {
        description: product.title,
      });

      try {
        if (isWishlisted) {
          await api.delete(
            `/api/v1/auth/wishlist/remove-product/${product.id}/`,
          );
        } else {
          await api.post("/api/v1/auth/wishlist/", { product_id: product.id });
        }
      } catch (err) {
        setWishlistIds(activeWishlistIds);
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Could not update your wishlist.",
        );
      }
    },
    [isAuthenticated, activeWishlistIds],
  );

  const openWishlist = useCallback(() => {
    if (!isAuthenticated) {
      toast("Sign in to view your wishlist", {
        description: "Your wishlist is saved to your account.",
      });
      setLoginOpen(true);
      return;
    }
    setWishlistOpen(true);
  }, [isAuthenticated]);

  const cartProductIds = useMemo(
    () => new Set((cart?.items ?? []).map((line) => line.product.id)),
    [cart],
  );

  const wishlist = useMemo(
    () => new Set(activeWishlistIds),
    [activeWishlistIds],
  );

  const wishlistProducts = useMemo(() => {
    if (!catalog) return [];
    const byId = new Map(catalog.products.map((item) => [item.id, item]));
    return activeWishlistIds
      .map((id) => byId.get(id))
      .filter((item): item is StoreProduct => Boolean(item));
  }, [catalog, activeWishlistIds]);

  const value = useMemo<StoreContextValue>(
    () => ({
      cart,
      cartCount: cart?.total_items ?? 0,
      cartProductIds,
      cartOpen,
      openCart: () => setCartOpen(true),
      addingId,
      addProduct,
      bumpingId,
      bumpProduct,
      wishlist,
      wishlistCount: activeWishlistIds.length,
      wishlistProducts,
      toggleWishlist,
      wishlistOpen,
      openWishlist,
      catalog,
      catalogLoading,
      catalogError,
      refetchCatalog,
      settings: settings ?? null,
      settingsLoading,
      refetchSettings,
      loginOpen,
      openLogin: () => setLoginOpen(true),
      closeLogin: () => setLoginOpen(false),
      clearCart: () => setCart(null),
      refreshCart: () => {
        // Server truth after a payment: purchased lines are gone, any line
        // added mid-payment survives.
        void fetchCart()
          .then(setCart)
          .catch(() => {
            // Cart is empty or unreachable; the next cart action fixes it.
          });
      },
      updateCart: (next: Cart | null) => setCart(next),
    }),
    [
      cart,
      cartProductIds,
      cartOpen,
      addingId,
      addProduct,
      bumpingId,
      bumpProduct,
      wishlist,
      activeWishlistIds.length,
      wishlistProducts,
      toggleWishlist,
      wishlistOpen,
      openWishlist,
      catalog,
      catalogLoading,
      catalogError,
      refetchCatalog,
      settings,
      settingsLoading,
      refetchSettings,
      loginOpen,
    ],
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        cart={cart}
        onCartChange={setCart}
      />
      <WishlistSheet
        open={wishlistOpen}
        onOpenChange={setWishlistOpen}
        products={wishlistProducts}
        total={activeWishlistIds.length}
        onToggle={toggleWishlist}
      />
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </StoreContext.Provider>
  );
}
