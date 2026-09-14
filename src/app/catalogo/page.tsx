"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getOptimizedCatalogImageUrl,
  isCatalogReadyImage,
  resolveCatalogPresentationImage,
  resolveCatalogVariantImage,
} from "@/lib/catalog-image-policy";
import AppSidebar from "@/components/AppSidebar";
import SellerCart from "@/components/SellerCart";
import { useSellerCart } from "@/hooks/useSellerCart";

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  internal_code: string | null;
  barcode: string | null;
  category_id: string | null;
  description: string | null;
  specifications: string | null;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  weight_g: number | null;
  material: string | null;
  package_quantity: number | null;
  package_unit: string | null;
  main_image_url: string | null;
  sale_price: number | null;
  has_variants?: boolean;
  commercial_visibility: Record<string, boolean> | null;
  commercial_variants: string | null;
  commercial_highlights: string | null;
  active: boolean;
};

type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  catalog_slot: string | null;
  image_type: string | null;
  approved: boolean;
  source: string | null;
  is_primary: boolean | null;
  variant_id: string | null;
};

type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  color: string | null;
  image_url: string | null;
  sale_price: number | null;
  active: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

const OFFLINE_DB_NAME = "camel-paper-offline";
const OFFLINE_DB_VERSION = 1;
const OFFLINE_STORE = "catalog";
const OFFLINE_RECORD_KEY = "commercial-catalog";
const OFFLINE_CACHE_NAME = "camel-paper-catalog-images-v1";

type OfflineCatalogRecord = {
  key: string;
  products: Product[];
  categories: Category[];
  catalogImages: ProductImage[];
  productVariants: ProductVariant[];
  updatedAt: string;
};

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        db.createObjectStore(OFFLINE_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveOfflineCatalog(record: OfflineCatalogRecord) {
  const db = await openOfflineDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(OFFLINE_STORE, "readwrite");
    transaction.objectStore(OFFLINE_STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  db.close();
}

async function readOfflineCatalog(): Promise<OfflineCatalogRecord | null> {
  const db = await openOfflineDb();

  const record = await new Promise<OfflineCatalogRecord | null>((resolve, reject) => {
    const transaction = db.transaction(OFFLINE_STORE, "readonly");
    const request = transaction.objectStore(OFFLINE_STORE).get(OFFLINE_RECORD_KEY);

    request.onsuccess = () =>
      resolve((request.result as OfflineCatalogRecord | undefined) || null);
    request.onerror = () => reject(request.error);
  });

  db.close();
  return record;
}

function formatOfflineDate(value: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function CatalogoPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalogImages, setCatalogImages] = useState<ProductImage[]>([]);
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineUpdatedAt, setOfflineUpdatedAt] = useState<string | null>(null);
  const [offlinePreparing, setOfflinePreparing] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState(0);
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const {
    cart,
    cartUnits,
    cartTotal,
    addItem,
  } = useSellerCart();

  useEffect(() => {
    let mounted = true;

    async function hydrateOfflineStatus() {
      try {
        const offline = await readOfflineCatalog();
        if (!mounted || !offline) return;

        setOfflineReady(true);
        setOfflineUpdatedAt(offline.updatedAt);
      } catch (error) {
        console.error("Erro ao verificar catálogo offline:", error);
      }
    }

    async function loadOfflineCatalog() {
      try {
        const offline = await readOfflineCatalog();

        if (!mounted) return;

        if (!offline) {
          setOfflineMessage(
            "Sem internet e nenhum catálogo foi preparado neste dispositivo."
          );
          setLoading(false);
          return;
        }

        setProducts(offline.products);
        setCategories(offline.categories);
        setCatalogImages(offline.catalogImages);
        setProductVariants(offline.productVariants || []);
        setOfflineReady(true);
        setOfflineUpdatedAt(offline.updatedAt);
        setOfflineMessage("Exibindo a versão salva neste dispositivo.");
        setLoading(false);
      } catch (error) {
        console.error("Erro ao carregar catálogo offline:", error);
        if (mounted) {
          setOfflineMessage("Não foi possível abrir o catálogo offline.");
          setLoading(false);
        }
      }
    }

    async function loadCatalog() {
      setLoading(true);
      setOfflineMessage(null);

      if (!navigator.onLine) {
        await loadOfflineCatalog();
        return;
      }

      const [productsResult, categoriesResult, imagesResult, variantsResult] =
        await Promise.all([
          supabase
            .from("products")
            .select(
              "id, name, sku, internal_code, barcode, category_id, description, specifications, width_cm, height_cm, depth_cm, weight_g, material, package_quantity, package_unit, main_image_url, sale_price, has_variants, commercial_visibility, commercial_variants, commercial_highlights, active"
            )
            .eq("active", true)
            .order("name"),

          supabase
            .from("categories")
            .select("id, name")
            .eq("active", true)
            .order("name"),

          supabase
            .from("product_images")
            .select(
              "id, product_id, image_url, catalog_slot, image_type, approved, source, is_primary, variant_id"
            )
            .eq("approved", true),

          supabase
            .from("product_variants")
            .select(
              "id, product_id, name, sku, barcode, color, image_url, sale_price, active"
            )
            .eq("active", true)
            .order("name"),
        ]);

      if (!mounted) return;

      const hasRemoteError =
        Boolean(productsResult.error) ||
        Boolean(categoriesResult.error) ||
        Boolean(imagesResult.error) ||
        Boolean(variantsResult.error);

      if (hasRemoteError) {
        console.error(
          "Erro ao carregar catálogo online:",
          productsResult.error,
          categoriesResult.error,
          imagesResult.error,
          variantsResult.error
        );

        await loadOfflineCatalog();
        return;
      }

      setProducts((productsResult.data || []) as Product[]);
      setCategories((categoriesResult.data || []) as Category[]);
      setCatalogImages(
        ((imagesResult.data || []) as ProductImage[]).filter(isCatalogReadyImage)
      );
      setProductVariants((variantsResult.data || []) as ProductVariant[]);
      setLoading(false);
    }

    function handleOnline() {
      setIsOnline(true);
      setOfflineMessage(null);
      loadCatalog();
    }

    function handleOffline() {
      setIsOnline(false);
      loadOfflineCatalog();
    }

    setIsOnline(navigator.onLine);
    hydrateOfflineStatus();
    loadCatalog();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      mounted = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "all" ||
        product.category_id === selectedCategory;

      const matchesSearch =
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        (product.sku || "").toLowerCase().includes(normalizedSearch) ||
        (product.internal_code || "").toLowerCase().includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);

  function getProfessionalImage(productId: string) {
    return resolveCatalogPresentationImage(catalogImages, productId);
  }

  function getProfessionalVariantImage(
    productId: string,
    variantId: string
  ) {
    return resolveCatalogVariantImage(catalogImages, productId, variantId);
  }

  function variantsForProduct(productId: string): ProductVariant[] {
    return productVariants.filter(
      (variant) => variant.product_id === productId && variant.active
    );
  }

  function quantityForProduct(productId: string) {
    return Math.max(1, Number(quantities[productId] || 1));
  }

  function updateQuantity(productId: string, nextValue: number) {
    setQuantities((current) => ({
      ...current,
      [productId]: Math.max(1, Math.min(9999, Math.round(nextValue || 1))),
    }));
  }

  function addProductToCart(product: Product) {
    const variants = variantsForProduct(product.id);
    const selectedVariantId = selectedVariants[product.id] || "";
    const requiresVariant = Boolean(product.has_variants) || variants.length > 0;

    if (requiresVariant && !selectedVariantId) {
      setCartMessage(`Escolha uma variação para ${product.name}.`);
      window.setTimeout(() => setCartMessage(null), 2600);
      return;
    }

    const variant =
      variants.find((item) => item.id === selectedVariantId) || null;

    const unitPrice = Number(
      variant?.sale_price ?? product.sale_price ?? 0
    );

    if (unitPrice <= 0) {
      setCartMessage(`Preço não disponível para ${product.name}.`);
      window.setTimeout(() => setCartMessage(null), 2600);
      return;
    }

    const quantity = quantityForProduct(product.id);
    const key = `${product.id}:${variant?.id || "base"}`;
    const professionalImage = getProfessionalImage(product.id);
    const professionalVariantImage = variant
      ? getProfessionalVariantImage(product.id, variant.id)
      : null;

    addItem({
      key,
      product_id: product.id,
      variant_id: variant?.id || null,
      product_name: product.name,
      variant_name: variant?.name || null,
      sku: variant?.sku || product.sku,
      image_url:
        professionalVariantImage?.image_url ||
        professionalImage?.image_url ||
        null,
      quantity,
      unit_price: unitPrice,
    });

    setCartMessage(
      `${product.name}${variant ? ` • ${variant.name}` : ""} adicionado ao pedido.`
    );
    window.setTimeout(() => setCartMessage(null), 2200);
  }

  async function prepareOfflineCatalog() {
    if (!navigator.onLine) {
      setOfflineMessage("Conecte-se à internet para atualizar o conteúdo offline.");
      return;
    }

    if (offlinePreparing) return;

    setOfflinePreparing(true);
    setOfflineProgress(0);
    setOfflineMessage("Preparando produtos e fotos para uso offline...");

    try {
      const cache = await caches.open(OFFLINE_CACHE_NAME);

      const imageUrls = Array.from(
        new Set(
          catalogImages.flatMap((image) => [
            getOptimizedCatalogImageUrl(image.image_url, 420, 72),
            getOptimizedCatalogImageUrl(image.image_url, 520, 74),
            getOptimizedCatalogImageUrl(image.image_url, 220, 70),
            getOptimizedCatalogImageUrl(image.image_url, 1200, 82),
          ])
        )
      );

      let completed = 0;
      const concurrency = 4;

      for (let index = 0; index < imageUrls.length; index += concurrency) {
        const batch = imageUrls.slice(index, index + concurrency);

        await Promise.all(
          batch.map(async (url) => {
            try {
              const response = await fetch(url, { cache: "reload" });

              if (response.ok) {
                await cache.put(url, response.clone());
              }
            } catch (error) {
              console.warn("Não foi possível armazenar uma imagem offline:", url, error);
            } finally {
              completed += 1;
              setOfflineProgress(
                imageUrls.length === 0
                  ? 100
                  : Math.round((completed / imageUrls.length) * 100)
              );
            }
          })
        );
      }

      const updatedAt = new Date().toISOString();

      await saveOfflineCatalog({
        key: OFFLINE_RECORD_KEY,
        products,
        categories,
        catalogImages,
        productVariants,
        updatedAt,
      });

      setOfflineReady(true);
      setOfflineUpdatedAt(updatedAt);
      setOfflineProgress(100);
      setOfflineMessage(
        imageUrls.length > 0
          ? `${imageUrls.length} foto(s), ${products.length} produto(s) e ${productVariants.length} variação(ões) foram salvos neste dispositivo.`
          : `${products.length} produto(s) e ${productVariants.length} variação(ões) foram salvos neste dispositivo.`
      );
    } catch (error) {
      console.error("Erro ao preparar catálogo offline:", error);
      setOfflineMessage("Não foi possível concluir a preparação offline.");
    } finally {
      setOfflinePreparing(false);
    }
  }

  return (
    <main className="shell">
      <AppSidebar />
      <div className="catalog-shell">
      <section className="hero">
        <div className="hero-inner">
          <div className="brand-row">
            <div className="brand">
              <div className="brand-logo">
                <Image
                  src="/brand/camel-paper-logo.png"
                  alt="Camel Paper"
                  width={250}
                  height={110}
                  priority
                  className="camel-logo-image"
                />
              </div>
              <span>Loja do Vendedor</span>
            </div>

            <div className="account-actions">
              <Link href="/" className="admin-link">
                Área administrativa →
              </Link>
            </div>
          </div>

          <div className="hero-content">
            <span className="eyebrow">VENDA ASSISTIDA</span>
            <h1>Monte o pedido junto com o cliente.</h1>
            <p>
              Consulte fotos, escolha variações, informe quantidades e monte
              o pedido do cliente mesmo em visitas com conexão instável.
            </p>

            <div className="search-box">
              <span>⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por produto, SKU ou código..."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="offline-strip">
        <div className="offline-strip-inner">
          <div className="offline-status-copy">
            <div className="connection-line">
              <span className={`connection-dot ${isOnline ? "online" : "offline"}`} />
              <strong>{isOnline ? "Online" : "Modo offline"}</strong>
              {offlineReady && <span className="offline-ready-badge">Disponível offline</span>}
            </div>

            <p>
              {offlineReady
                ? `Conteúdo salvo neste dispositivo${
                    offlineUpdatedAt ? ` • Atualizado em ${formatOfflineDate(offlineUpdatedAt)}` : ""
                  }.`
                : "Prepare o catálogo antes de visitar locais com internet instável ou sem sinal."}
            </p>

            {offlineMessage && <small className="offline-message">{offlineMessage}</small>}
          </div>

          <div className="offline-action">
            {offlinePreparing && (
              <div className="offline-progress" aria-label={`Preparação offline ${offlineProgress}%`}>
                <div>
                  <span style={{ width: `${offlineProgress}%` }} />
                </div>
                <strong>{offlineProgress}%</strong>
              </div>
            )}

            <button
              type="button"
              onClick={prepareOfflineCatalog}
              disabled={!isOnline || offlinePreparing || loading}
            >
              {offlinePreparing
                ? "Preparando..."
                : offlineReady
                  ? "Atualizar conteúdo offline"
                  : "Preparar para uso offline"}
            </button>
          </div>
        </div>
      </section>

      <section className="content">
        <div className="category-bar">
          <button
            type="button"
            className={selectedCategory === "all" ? "active" : ""}
            onClick={() => setSelectedCategory("all")}
          >
            Todos
          </button>

          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              className={
                selectedCategory === category.id ? "active" : ""
              }
              onClick={() => setSelectedCategory(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="section-title">
          <div>
            <span>VITRINE COMERCIAL</span>
            <h2>Produtos</h2>
          </div>

          <div className="section-summary">
            <small>{filteredProducts.length} produto(s)</small>
            <button type="button" className="cart-summary-button" onClick={() => setCartOpen(true)}>
              <span>Pedido</span>
              <strong>{cartUnits} un.</strong>
              <b>{money(cartTotal)}</b>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="state-card">Carregando catálogo...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="state-card">
            Nenhum produto encontrado para este filtro.
          </div>
        ) : (
          <div className="product-grid">
            {filteredProducts.map((product) => {
              const professionalImage = getProfessionalImage(product.id);

              return (
                <article
                  className="product-card"
                  key={product.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/catalogo/${product.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/catalogo/${product.id}`);
                    }
                  }}
                >
                  <div className="product-image">
                    {professionalImage ? (
                      <img
                        src={getOptimizedCatalogImageUrl(professionalImage.image_url, 420, 72)}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="image-placeholder">
                        <span>CP</span>
                        <small>Imagem profissional em preparação</small>
                      </div>
                    )}

                    {professionalImage && (
                      <span className="professional-badge">
                        Foto profissional
                      </span>
                    )}
                  </div>

                  <div className="product-info">
                    <div className="product-meta">
                      <span>{product.sku || "SKU não informado"}</span>
                      {product.internal_code && (
                        <small>Cód. {product.internal_code}</small>
                      )}
                    </div>

                    <h3>{product.name}</h3>

                    {(product.commercial_visibility?.price ?? true) &&
                      product.sale_price !== null && (
                        <strong className="product-price">
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(Number(product.sale_price))}
                        </strong>
                      )}

                    <p>
                      {product.description ||
                        "Produto disponível no catálogo comercial Camel Paper."}
                    </p>

                    {variantsForProduct(product.id).length > 0 && (
                      <label
                        className="variant-picker"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span>Variação</span>
                        <select
                          value={selectedVariants[product.id] || ""}
                          onChange={(event) =>
                            setSelectedVariants((current) => ({
                              ...current,
                              [product.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Escolha uma opção</option>
                          {variantsForProduct(product.id).map((variant) => (
                            <option value={variant.id} key={variant.id}>
                              {variant.name}
                              {variant.sale_price !== null
                                ? ` • ${money(Number(variant.sale_price))}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div
                      className="product-actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="quantity-control" aria-label={`Quantidade de ${product.name}`}>
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              product.id,
                              quantityForProduct(product.id) - 1
                            )
                          }
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={9999}
                          value={quantityForProduct(product.id)}
                          onChange={(event) =>
                            updateQuantity(product.id, Number(event.target.value))
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              product.id,
                              quantityForProduct(product.id) + 1
                            )
                          }
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        className="add-cart-button"
                        onClick={() => addProductToCart(product)}
                      >
                        Adicionar ao pedido
                      </button>
                    </div>

                    <button
                      type="button"
                      className="view-product-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        router.push(`/catalogo/${product.id}`);
                      }}
                    >
                      Ver ficha completa <span>→</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      </div>

      {cartMessage && (
        <div className="cart-toast" role="status">
          {cartMessage}
        </div>
      )}

      <SellerCart
        open={cartOpen}
        onOpenChange={setCartOpen}
        onCheckout={() => router.push("/catalogo/checkout")}
      />

      <style jsx>{`
        .shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 250px minmax(0, 1fr);
          background: #f6f2ee;
        }

        .catalog-shell {
          min-height: 100vh;
          background: #f6f2ee;
          color: #261c18;
        }

        .hero {
          background:
            linear-gradient(
              120deg,
              rgba(120, 31, 16, 0.96),
              rgba(145, 46, 22, 0.96)
            ),
            #7b1f10;
          color: #fff;
          padding: 24px 24px 44px;
        }

        .hero-inner,
        .content {
          max-width: 1180px;
          margin: 0 auto;
        }

        .brand-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding-bottom: 22px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.42);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-logo {
          width: 230px;
          height: 88px;
          display: flex;
          align-items: center;
          justify-content: flex-start;
        }

        :global(.camel-logo-image) {
          width: 230px !important;
          height: 88px !important;
          object-fit: contain !important;
          object-position: left center !important;
        }

        .brand > span {
          padding-left: 14px;
          border-left: 1px solid rgba(255, 255, 255, 0.34);
          color: rgba(255, 255, 255, 0.78);
          font-size: 11px;
          font-weight: 700;
        }

        .account-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .logout-button {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.38);
          border-radius: 10px;
          padding: 0 14px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.18s ease, border-color 0.18s ease;
        }

        .logout-button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(255, 255, 255, 0.62);
        }

        .logout-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        :global(.admin-link) {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.38);
          border-radius: 10px;
          padding: 0 14px;
          color: #fff;
          text-decoration: none;
          font-size: 11px;
          font-weight: 800;
          transition: background 0.18s ease, border-color 0.18s ease;
        }

        :global(.admin-link:hover) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.62);
        }

        .hero-content {
          max-width: 780px;
          padding-top: 38px;
        }

        .eyebrow {
          display: inline-block;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 2.2px;
          color: #ffc07a;
          margin-bottom: 12px;
        }

        h1 {
          margin: 0;
          max-width: 760px;
          font-size: clamp(38px, 6vw, 66px);
          line-height: 0.98;
          letter-spacing: -2.3px;
        }

        .hero-content p {
          margin: 18px 0 0;
          max-width: 650px;
          font-size: 15px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.76);
        }

        .search-box {
          margin-top: 24px;
          max-width: 700px;
          min-height: 58px;
          border-radius: 15px;
          background: #fff;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 18px;
          box-shadow: 0 18px 40px rgba(48, 15, 7, 0.22);
        }

        .search-box span {
          color: #8a2a18;
          font-size: 22px;
        }

        .search-box input {
          flex: 1;
          border: 0;
          outline: 0;
          background: transparent;
          color: #30231e;
          font-size: 15px;
        }

        .offline-strip {
          padding: 16px 24px 0;
        }

        .offline-strip-inner {
          max-width: 1180px;
          margin: 0 auto;
          border: 1px solid #e4d8d1;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 10px 28px rgba(74, 43, 29, 0.05);
          padding: 15px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .offline-status-copy {
          min-width: 0;
        }

        .connection-line {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          color: #352722;
          font-size: 12px;
        }

        .connection-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          flex: 0 0 auto;
        }

        .connection-dot.online {
          background: #1f9d62;
          box-shadow: 0 0 0 4px rgba(31, 157, 98, 0.11);
        }

        .connection-dot.offline {
          background: #c24b32;
          box-shadow: 0 0 0 4px rgba(194, 75, 50, 0.11);
        }

        .offline-ready-badge {
          border: 1px solid #d9eadf;
          border-radius: 999px;
          padding: 4px 7px;
          background: #f0faf4;
          color: #26724d;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .5px;
        }

        .offline-status-copy p {
          margin: 6px 0 0;
          color: #81736c;
          font-size: 11px;
          line-height: 1.45;
        }

        .offline-message {
          display: block;
          margin-top: 5px;
          color: #a05d32;
          font-size: 10px;
          font-weight: 700;
        }

        .offline-action {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .offline-action > button {
          min-height: 42px;
          border: 0;
          border-radius: 11px;
          padding: 0 15px;
          background: #8a2a18;
          color: #fff;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
          transition: transform .16s ease, opacity .16s ease, background .16s ease;
        }

        .offline-action > button:hover:not(:disabled) {
          transform: translateY(-1px);
          background: #762113;
        }

        .offline-action > button:disabled {
          cursor: not-allowed;
          opacity: .48;
        }

        .offline-progress {
          width: 150px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .offline-progress > div {
          flex: 1;
          height: 6px;
          overflow: hidden;
          border-radius: 999px;
          background: #eee5df;
        }

        .offline-progress > div > span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: #ef7a00;
          transition: width .2s ease;
        }

        .offline-progress > strong {
          width: 30px;
          color: #8a2a18;
          font-size: 9px;
          text-align: right;
        }

        .content {
          padding: 28px 24px 70px;
        }

        .category-bar {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
          padding: 4px 0 26px;
        }

        .category-bar button {
          border: 1px solid #ded4ce;
          background: #fff;
          color: #655852;
          min-height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .category-bar button.active {
          background: #ef7a00;
          border-color: #ef7a00;
          color: #fff;
        }

        .section-title {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 18px;
        }

        .section-title span {
          display: block;
          color: #ef7a00;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1.8px;
          margin-bottom: 4px;
        }

        .section-title h2 {
          margin: 0;
          font-size: 28px;
          letter-spacing: -0.8px;
        }

        .section-title small {
          color: #887b74;
          font-size: 11px;
        }

        .product-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .product-card {
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid #e5ddd8;
          background: #fff;
          cursor: pointer;
          transition:
            transform 0.18s ease,
            box-shadow 0.18s ease,
            border-color 0.18s ease;
        }

        .product-card:hover {
          transform: translateY(-3px);
          border-color: #efc5aa;
          box-shadow: 0 18px 40px rgba(69, 44, 34, 0.09);
        }

        .product-image {
          position: relative;
          height: 320px;
          background: #fff;
          border-bottom: 1px solid #eee7e2;
        }

        .product-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
          padding: 20px;
          box-sizing: border-box;
        }

        .professional-badge {
          position: absolute;
          top: 14px;
          left: 14px;
          background: #fff2e6;
          color: #8a2a18;
          border: 1px solid #f0d6c2;
          border-radius: 999px;
          padding: 6px 9px;
          font-size: 9px;
          font-weight: 900;
        }

        .image-placeholder {
          height: 100%;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 10px;
          color: #897c75;
          text-align: center;
        }

        .image-placeholder span {
          width: 54px;
          height: 54px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          background: #fff0e3;
          color: #8a2a18;
          font-weight: 900;
        }

        .image-placeholder small {
          max-width: 170px;
          line-height: 1.4;
        }

        .product-info {
          padding: 18px;
        }

        .product-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .product-meta span {
          color: #ef7a00;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.8px;
        }

        .product-meta small {
          color: #a0948d;
          font-size: 10px;
        }

        .product-info h3 {
          margin: 9px 0 0;
          font-size: 19px;
          line-height: 1.2;
          letter-spacing: -0.35px;
        }

        .product-price {
          display: block;
          margin-top: 7px;
          color: #8a2a18;
          font-size: 18px;
          line-height: 1;
          letter-spacing: -0.4px;
        }

        .product-info p {
          margin: 8px 0 16px;
          min-height: 42px;
          color: #847871;
          font-size: 11px;
          line-height: 1.55;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .product-info button {
          width: 100%;
          min-height: 42px;
          border-radius: 10px;
          border: 1px solid #eadfd8;
          background: #fffaf6;
          color: #8a2a18;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 13px;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
        }

        .section-summary {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .cart-summary-button {
          min-height: 38px;
          border: 1px solid #e2d5cc;
          border-radius: 10px;
          background: #fff;
          color: #6a554b;
          padding: 0 11px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-family: inherit;
          font-size: 10px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: normal;
          text-transform: none;
          font-variant-numeric: tabular-nums;
        }

        .cart-summary-button span,
        .cart-summary-button strong,
        .cart-summary-button b {
          font-family: inherit;
          letter-spacing: normal;
          text-transform: none;
        }

        .cart-summary-button strong,
        .cart-summary-button b {
          color: #8a2a18;
        }

        .variant-picker {
          display: block;
          margin: 2px 0 12px;
        }

        .variant-picker > span {
          display: block;
          margin-bottom: 5px;
          color: #8f8179;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .7px;
        }

        .variant-picker select {
          width: 100%;
          min-height: 40px;
          border: 1px solid #e3d8d1;
          border-radius: 9px;
          background: #fff;
          color: #4b3b34;
          padding: 0 10px;
          outline: 0;
          font-size: 11px;
          font-weight: 700;
        }

        .product-actions {
          display: grid;
          grid-template-columns: 108px minmax(0, 1fr);
          gap: 8px;
          margin-bottom: 8px;
        }

        .quantity-control {
          min-height: 42px;
          border: 1px solid #e2d6ce;
          border-radius: 10px;
          background: #fff;
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) 34px;
          overflow: hidden;
        }

        .quantity-control button {
          width: auto !important;
          min-height: 40px !important;
          padding: 0 !important;
          justify-content: center !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: #fff8f3 !important;
          color: #8a2a18 !important;
          font-size: 17px !important;
        }

        .quantity-control input {
          width: 100%;
          border: 0;
          border-left: 1px solid #eee3dc;
          border-right: 1px solid #eee3dc;
          outline: 0;
          text-align: center;
          color: #3d302a;
          font-weight: 900;
          background: #fff;
          -moz-appearance: textfield;
        }

        .quantity-control input::-webkit-outer-spin-button,
        .quantity-control input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        .product-info .add-cart-button {
          border-color: #8a2a18;
          background: #8a2a18;
          color: #fff;
          justify-content: center;
        }

        .product-info .add-cart-button:hover {
          background: #742113;
        }

        .product-info .view-product-button {
          background: #fffaf6;
        }

        .floating-cart {
          position: fixed;
          right: 26px;
          bottom: 24px;
          z-index: 60;
          min-width: 230px;
          min-height: 58px;
          border: 1px solid #e5c9b8;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 18px 48px rgba(68, 35, 24, .2);
          color: #4b3931;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 11px;
          cursor: pointer;
        }

        .floating-cart.has-items {
          border-color: #d98c5b;
        }

        .floating-cart > span {
          width: 38px;
          height: 38px;
          border-radius: 11px;
          background: #fff0e3;
          display: grid;
          place-items: center;
          font-size: 18px;
        }

        .floating-cart > div {
          min-width: 0;
          flex: 1;
          text-align: left;
        }

        .floating-cart small,
        .floating-cart strong {
          display: block;
        }

        .floating-cart small {
          color: #9b8a80;
          font-size: 8px;
          margin-bottom: 2px;
        }

        .floating-cart strong {
          color: #8a2a18;
          font-size: 10px;
        }

        .floating-cart b {
          min-width: 25px;
          height: 25px;
          border-radius: 999px;
          background: #ef7a00;
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 9px;
        }

        .cart-toast {
          position: fixed;
          left: 50%;
          bottom: 28px;
          transform: translateX(-50%);
          z-index: 95;
          border-radius: 12px;
          background: #2f241f;
          color: #fff;
          padding: 11px 15px;
          box-shadow: 0 12px 30px rgba(0,0,0,.22);
          font-size: 11px;
          font-weight: 800;
        }

        .cart-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: rgba(40, 29, 24, .34);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: flex-end;
        }

        .cart-drawer {
          width: min(520px, 100%);
          height: 100%;
          background: #f7f3ef;
          box-shadow: -20px 0 60px rgba(44, 25, 17, .18);
          display: flex;
          flex-direction: column;
        }

        .cart-drawer-header {
          padding: 22px 22px 18px;
          background: linear-gradient(120deg, #7b1f10, #a3381e);
          color: #fff;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .cart-drawer-header span {
          display: block;
          color: #ffc07a;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.6px;
          margin-bottom: 5px;
        }

        .cart-drawer-header h2 {
          margin: 0;
          font-size: 25px;
        }

        .cart-drawer-header p {
          margin: 5px 0 0;
          color: rgba(255,255,255,.72);
          font-size: 10px;
        }

        .cart-drawer-header > button {
          width: 36px;
          height: 36px;
          border: 1px solid rgba(255,255,255,.3);
          border-radius: 10px;
          background: rgba(255,255,255,.08);
          color: #fff;
          font-size: 22px;
          cursor: pointer;
        }

        .cart-empty {
          flex: 1;
          display: grid;
          place-items: center;
          align-content: center;
          text-align: center;
          padding: 30px;
        }

        .cart-empty strong {
          color: #49382f;
          font-size: 14px;
        }

        .cart-empty p {
          margin: 6px 0 0;
          color: #93857d;
          font-size: 11px;
        }

        .cart-items {
          flex: 1;
          overflow: auto;
          padding: 14px;
        }

        .cart-item {
          border: 1px solid #e6ddd7;
          border-radius: 14px;
          background: #fff;
          padding: 11px;
          display: grid;
          grid-template-columns: 68px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: start;
          margin-bottom: 9px;
        }

        .cart-item-image {
          width: 68px;
          height: 68px;
          border-radius: 10px;
          overflow: hidden;
          background: #faf7f4;
          display: grid;
          place-items: center;
          color: #8a2a18;
          font-weight: 900;
        }

        .cart-item-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 5px;
          box-sizing: border-box;
        }

        .cart-item-copy {
          min-width: 0;
        }

        .cart-item-copy > strong,
        .cart-item-copy > small,
        .cart-item-copy > b {
          display: block;
        }

        .cart-item-copy > strong {
          color: #42332c;
          font-size: 10px;
          line-height: 1.3;
        }

        .cart-item-copy > small {
          margin-top: 2px;
          color: #94857d;
          font-size: 8px;
        }

        .cart-item-copy > b {
          margin-top: 5px;
          color: #8a2a18;
          font-size: 10px;
        }

        .cart-item-controls {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-top: 8px;
        }

        .quantity-control.compact {
          width: 102px;
          min-height: 32px;
          grid-template-columns: 31px 40px 31px;
        }

        .quantity-control.compact button {
          min-height: 30px !important;
          font-size: 14px !important;
        }

        .remove-cart-item {
          border: 0;
          background: transparent;
          color: #a1483b;
          padding: 0;
          font-size: 8px;
          font-weight: 900;
          cursor: pointer;
        }

        .cart-line-total {
          color: #3d2f29;
          font-size: 10px;
          white-space: nowrap;
        }

        .cart-footer {
          border-top: 1px solid #e3d8d1;
          background: #fff;
          padding: 16px;
        }

        .cart-total-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
        }

        .cart-total-row span {
          color: #8d8079;
          font-size: 10px;
          font-weight: 800;
        }

        .cart-total-row strong {
          color: #8a2a18;
          font-size: 24px;
          letter-spacing: -.7px;
        }

        .cart-footer > p {
          margin: 8px 0 13px;
          color: #978a83;
          font-size: 8px;
          line-height: 1.5;
        }

        .review-order-button {
          width: 100%;
          min-height: 46px;
          border: 0;
          border-radius: 11px;
          background: #8a2a18;
          color: #fff;
          padding: 0 13px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          font-weight: 900;
        }

        .review-order-button:disabled {
          opacity: .62;
        }

        .review-order-button span {
          font-size: 8px;
          opacity: .7;
        }

        .clear-cart-button {
          width: 100%;
          margin-top: 7px;
          min-height: 36px;
          border: 1px solid #e5dad3;
          border-radius: 9px;
          background: #fff;
          color: #8b7e77;
          font-size: 8px;
          font-weight: 900;
          cursor: pointer;
        }

        .state-card {
          min-height: 220px;
          border-radius: 18px;
          border: 1px dashed #d8cec8;
          background: #fff;
          display: grid;
          place-items: center;
          color: #8a7f79;
          font-size: 13px;
        }

        @media (max-width: 980px) {
          .shell {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 940px) {
          .product-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .hero {
            padding-inline: 16px;
          }

          .content {
            padding-inline: 16px;
          }

          .offline-strip {
            padding-inline: 16px;
          }

          .offline-strip-inner {
            align-items: stretch;
            flex-direction: column;
          }

          .offline-action {
            width: 100%;
            align-items: stretch;
            flex-direction: column;
          }

          .offline-action > button {
            width: 100%;
          }

          .offline-progress {
            width: 100%;
          }

          .brand-row {
            align-items: flex-start;
          }

          .brand {
            align-items: flex-start;
            flex-direction: column;
            gap: 8px;
          }

          .brand > span {
            padding-left: 0;
            border-left: 0;
          }

          .brand-logo {
            width: 185px;
            height: 70px;
          }

          :global(.camel-logo-image) {
            width: 185px !important;
            height: 70px !important;
          }

          .account-actions {
            flex-direction: column;
            align-items: stretch;
          }

          :global(.admin-link),
          .logout-button {
            min-height: 36px;
            padding-inline: 10px;
            font-size: 9px;
          }

          .hero-content {
            padding-top: 34px;
          }

          .section-title {
            align-items: stretch;
            flex-direction: column;
          }

          .section-summary {
            justify-content: space-between;
          }

          .cart-summary-button {
            flex: 1;
          }

          .product-actions {
            grid-template-columns: 1fr;
          }

          .floating-cart {
            left: 16px;
            right: 16px;
            bottom: 14px;
            width: auto;
          }

          .cart-drawer {
            width: 100%;
          }

          .cart-item {
            grid-template-columns: 58px minmax(0, 1fr);
          }

          .cart-item-image {
            width: 58px;
            height: 58px;
          }

          .cart-line-total {
            grid-column: 2;
          }

          .product-grid {
            grid-template-columns: 1fr;
          }

          .product-image {
            height: 280px;
          }
        }
      `}</style>
    </main>
  );
}
