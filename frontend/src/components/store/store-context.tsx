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
  storedCartId,
  type Cart,
  type StoreProduct,
  type StorefrontCatalog,
} from "@/lib/store";
import type { Paginated } from "@/lib/types";

interface WishlistResponseItem {
  id: number;
  product: { id: number };
}

interface StoreContextValue {
  cart: Cart | null;
  cartCount: number;
  /** Product ids currently in the cart - drives the "In Cart" cards. */
  cartProductIds: ReadonlySet<number>;
  cartOpen: boolean;
  openCart: () => void;
  /** Product id currently being added (drives per-card "Adding…"). */
  addingId: number | null;
  addProduct: (
    product: { id: number; title: string },
    options?: { quantity?: number; size?: string },
  ) => Promise<void>;
  /** Wishlisted product ids - account-tied wishlist entries. */
  wishlist: ReadonlySet<number>;
  wishlistCount: number;
  /** Wishlist entries resolved against the shared catalog, in saved order. */
  wishlistProducts: StoreProduct[];
  toggleWishlist: (product: { id: number; title: string }) => Promise<void>;
  wishlistOpen: boolean;
  openWishlist: () => void;
  /** Shared storefront catalog (fetched once per page load). */
  catalog: StorefrontCatalog | null;
  catalogLoading: boolean;
  catalogError: string | null;
  refetchCatalog: () => void;
  /** In-place authentication dialog controls. */
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore(): StoreContextValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used within <StoreProvider>");
  return value;
}

/** Store state: guest cart sessions, the account-tied wishlist, and shared catalog. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [wishlistIds, setWishlistIds] = useState<number[]>([]);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const {
    data: catalog,
    error: catalogError,
    loading: catalogLoading,
    refetch: refetchCatalog,
  } = useQuery<StorefrontCatalog>(fetchStorefrontCatalog, []);

  // 1. Initial cart load (guest session from stored cart id).
  useEffect(() => {
    if (!storedCartId()) return;
    let cancelled = false;
    fetchCart()
      .then((next) => {
        if (!cancelled) setCart(next);
      })
      .catch(() => {
        // Stale cart id will be replaced on subsequent cart action.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Cart merge when transitioning from guest session to authenticated user.
  useEffect(() => {
    if (!isAuthenticated) return;
    const guestId = storedCartId();
    if (!guestId) {
      fetchCart().then(setCart).catch(() => {});
      return;
    }

    api
      .post<Cart>("/api/v1/orders/cart/merge/", { guest_cart_id: guestId })
      .then((merged) => {
        setCart(merged);
      })
      .catch(() => {
        fetchCart().then(setCart).catch(() => {});
      });
  }, [isAuthenticated]);

  // 3. Wishlist sync: strictly tied to authenticated user.
  useEffect(() => {
    if (!isAuthenticated) {
      setWishlistIds([]);
      return;
    }

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
        // Unauthenticated or network error resets list.
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const addProduct = useCallback(
    async (
      product: { id: number; title: string },
      options?: { quantity?: number; size?: string },
    ) => {
      if (addingId !== null) return;
      setAddingId(product.id);
      try {
        const next = await addToCart(
          product.id,
          options?.quantity ?? 1,
          options?.size ?? "",
        );
        setCart(next);
        toast.success("Added to cart", { description: product.title });
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not add to cart.",
        );
      } finally {
        setAddingId(null);
      }
    },
    [addingId],
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

      const isWishlisted = wishlistIds.includes(product.id);
      const next = isWishlisted
        ? wishlistIds.filter((id) => id !== product.id)
        : [...wishlistIds, product.id];

      // Optimistic update
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
        // Revert optimistic update on failure
        setWishlistIds(wishlistIds);
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Could not update your wishlist.",
        );
      }
    },
    [isAuthenticated, wishlistIds],
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

  const wishlist = useMemo(() => new Set(wishlistIds), [wishlistIds]);

  const wishlistProducts = useMemo(() => {
    if (!catalog) return [];
    const byId = new Map(catalog.products.map((item) => [item.id, item]));
    return wishlistIds
      .map((id) => byId.get(id))
      .filter((item): item is StoreProduct => Boolean(item));
  }, [catalog, wishlistIds]);

  const value = useMemo<StoreContextValue>(
    () => ({
      cart,
      cartCount: cart?.total_items ?? 0,
      cartProductIds,
      cartOpen,
      openCart: () => setCartOpen(true),
      addingId,
      addProduct,
      wishlist,
      wishlistCount: wishlistIds.length,
      wishlistProducts,
      toggleWishlist,
      wishlistOpen,
      openWishlist,
      catalog,
      catalogLoading,
      catalogError,
      refetchCatalog,
      loginOpen,
      openLogin: () => setLoginOpen(true),
      closeLogin: () => setLoginOpen(false),
    }),
    [
      cart,
      cartProductIds,
      cartOpen,
      addingId,
      addProduct,
      wishlist,
      wishlistIds.length,
      wishlistProducts,
      toggleWishlist,
      wishlistOpen,
      openWishlist,
      catalog,
      catalogLoading,
      catalogError,
      refetchCatalog,
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
        total={wishlistIds.length}
        onToggle={toggleWishlist}
      />
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </StoreContext.Provider>
  );
}
