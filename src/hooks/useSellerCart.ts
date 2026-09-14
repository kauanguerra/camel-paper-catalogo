"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type SellerCartItem = {
  key: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  sku: string | null;
  image_url: string | null;
  quantity: number;
  unit_price: number;
};

export type SellerCartInput = Omit<SellerCartItem, "key"> & {
  key?: string;
};

const SELLER_CART_KEY = "camel-paper-seller-cart-v1";
const SELLER_CART_EVENT = "camel-paper-seller-cart-changed";

function normalizeItem(item: SellerCartItem): SellerCartItem {
  return {
    ...item,
    image_url:
      typeof item.image_url === "string" && item.image_url.trim()
        ? item.image_url.trim()
        : null,
    quantity: Math.max(1, Math.min(9999, Math.round(Number(item.quantity || 1)))),
    unit_price: Math.max(0, Number(item.unit_price || 0)),
  };
}

function readStoredCart(): SellerCartItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(SELLER_CART_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object" && item.product_id)
      .map((item) => normalizeItem(item as SellerCartItem));
  } catch (error) {
    console.error("Erro ao ler carrinho do vendedor:", error);
    return [];
  }
}

function persistCart(cart: SellerCartItem[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(SELLER_CART_KEY, JSON.stringify(cart));
    window.dispatchEvent(
      new CustomEvent(SELLER_CART_EVENT, {
        detail: { cart },
      })
    );
  } catch (error) {
    console.error("Erro ao salvar carrinho do vendedor:", error);
  }
}

export function useSellerCart() {
  const [cart, setCart] = useState<SellerCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCart(readStoredCart());
    setHydrated(true);

    function syncFromStorage(event: StorageEvent) {
      if (event.key !== SELLER_CART_KEY) return;
      setCart(readStoredCart());
    }

    function syncFromSameTab(event: Event) {
      const custom = event as CustomEvent<{ cart?: SellerCartItem[] }>;
      if (Array.isArray(custom.detail?.cart)) {
        setCart(custom.detail.cart.map(normalizeItem));
      } else {
        setCart(readStoredCart());
      }
    }

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(SELLER_CART_EVENT, syncFromSameTab);

    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(SELLER_CART_EVENT, syncFromSameTab);
    };
  }, []);

  const commit = useCallback((next: SellerCartItem[]) => {
    const normalized = next.map(normalizeItem);
    setCart(normalized);
    persistCart(normalized);
  }, []);

  const addItem = useCallback(
    (input: SellerCartInput) => {
      const key = input.key || `${input.product_id}:${input.variant_id || "base"}`;
      const current = readStoredCart();
      const existing = current.find((item) => item.key === key);

      const next = existing
        ? current.map((item) =>
            item.key === key
              ? {
                  ...item,
                  quantity:
                    item.quantity +
                    Math.max(1, Math.round(Number(input.quantity || 1))),
                  unit_price: Number(input.unit_price || item.unit_price || 0),
                  image_url: input.image_url || item.image_url,
                  variant_name: input.variant_name ?? item.variant_name,
                  sku: input.sku ?? item.sku,
                }
              : item
          )
        : [
            ...current,
            normalizeItem({
              key,
              product_id: input.product_id,
              variant_id: input.variant_id,
              product_name: input.product_name,
              variant_name: input.variant_name,
              sku: input.sku,
              image_url: input.image_url,
              quantity: input.quantity,
              unit_price: input.unit_price,
            }),
          ];

      commit(next);
    },
    [commit]
  );

  const updateQuantity = useCallback(
    (key: string, nextValue: number) => {
      const quantity = Math.max(
        1,
        Math.min(9999, Math.round(Number(nextValue || 1)))
      );
      const current = readStoredCart();
      commit(
        current.map((item) =>
          item.key === key ? { ...item, quantity } : item
        )
      );
    },
    [commit]
  );

  const removeItem = useCallback(
    (key: string) => {
      commit(readStoredCart().filter((item) => item.key !== key));
    },
    [commit]
  );

  const clearCart = useCallback(() => {
    commit([]);
  }, [commit]);

  const cartUnits = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [cart]
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + Number(item.quantity || 0) * Number(item.unit_price || 0),
        0
      ),
    [cart]
  );

  return {
    cart,
    hydrated,
    cartUnits,
    cartTotal,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  };
}
