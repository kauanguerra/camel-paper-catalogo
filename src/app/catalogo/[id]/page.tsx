"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SellerCart from "@/components/SellerCart";
import SellerCatalogLoading from "@/components/SellerCatalogLoading";
import { useSellerCart } from "@/hooks/useSellerCart";
import { ArrowLeft, Share2 } from "lucide-react";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  internal_code: string | null;
  barcode: string | null;
  description: string | null;
  specifications: string | null;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  weight_g: number | null;
  material: string | null;
  package_quantity: number | null;
  package_unit: string | null;
  sale_price: number | null;
  commercial_visibility: CommercialVisibility | null;
  commercial_variants: string | null;
  commercial_highlights: string | null;
  active: boolean;
};

type CommercialVisibility = {
  sku?: boolean;
  internal_code?: boolean;
  barcode?: boolean;
  description?: boolean;
  material?: boolean;
  dimensions?: boolean;
  weight?: boolean;
  package?: boolean;
  specifications?: boolean;
  variants?: boolean;
  price?: boolean;
};

type CatalogSlot = "front" | "back" | "product" | "detail";

type CatalogImage = {
  id: string;
  image_url: string;
  catalog_slot: CatalogSlot | null;
  approved: boolean;
  source: string | null;
  is_primary: boolean;
  variant_id: string | null;
};

type ProductVariant = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  color: string | null;
  image_url?: string | null;
  sale_price: number | null;
  active: boolean;
};

const SLOT_LABELS: Record<CatalogSlot, string> = {
  front: "Frente",
  back: "Verso",
  product: "Produto",
  detail: "Detalhe",
};

function getOptimizedImageUrl(
  sourceUrl: string,
  width = 900,
  quality = 78
) {
  const params = new URLSearchParams({
    src: sourceUrl,
    w: String(width),
    q: String(quality),
  });

  return `/api/catalog-image?${params.toString()}`;
}


const OFFLINE_DB_NAME = "camel-paper-offline";
const OFFLINE_DB_VERSION = 1;
const OFFLINE_STORE = "catalog";
const OFFLINE_RECORD_KEY = "commercial-catalog";

type OfflineProduct = Product & {
  category_id?: string | null;
  main_image_url?: string | null;
};

type OfflineCatalogImage = CatalogImage & {
  product_id: string;
};

type OfflineProductVariant = ProductVariant & {
  product_id: string;
};

type OfflineCatalogRecord = {
  key: string;
  products: OfflineProduct[];
  categories: Array<{ id: string; name: string }>;
  catalogImages: OfflineCatalogImage[];
  productVariants: OfflineProductVariant[];
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

function orderCatalogImages(items: CatalogImage[]) {
  const order: Record<CatalogSlot, number> = {
    front: 0,
    back: 1,
    product: 2,
    detail: 3,
  };

  return [...items].sort((a, b) => {
    const aOrder = a.catalog_slot ? order[a.catalog_slot] : 99;
    const bOrder = b.catalog_slot ? order[b.catalog_slot] : 99;
    return aOrder - bOrder;
  });
}

export default function CatalogoProdutoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = params.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<CatalogImage[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<CatalogImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareFeedback, setShareFeedback] = useState("");
  const [usingOfflineData, setUsingOfflineData] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [cartFeedback, setCartFeedback] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const {
    cart,
    cartUnits,
    cartTotal,
    addItem,
  } = useSellerCart();

  useEffect(() => {
    if (!productId) return;

    let mounted = true;

    function applyProductData(
      loadedProduct: Product,
      approvedImages: CatalogImage[],
      loadedVariants: ProductVariant[],
      offline = false
    ) {
      if (!mounted) return;

      const ordered = orderCatalogImages(approvedImages);

      setProduct(loadedProduct);
      setImages(ordered);
      setVariants(loadedVariants);
      setUsingOfflineData(offline);

      const firstVariantId = loadedVariants[0]?.id || null;
      setSelectedVariantId(firstVariantId);

      const initialImages = firstVariantId
        ? ordered.filter((image) => image.variant_id === firstVariantId)
        : ordered.filter((image) => !image.variant_id);

      const fallbackImages = initialImages.length > 0 ? initialImages : ordered;

      const defaultImage =
        fallbackImages.find((image) => image.catalog_slot === "front") ||
        fallbackImages.find((image) => image.is_primary) ||
        fallbackImages[0] ||
        null;

      setSelectedImage(defaultImage);
      setLoading(false);
    }

    async function loadOfflineProduct() {
      try {
        const offline = await readOfflineCatalog();

        if (!mounted) return false;

        if (!offline) {
          return false;
        }

        const offlineProduct = offline.products.find(
          (item) => item.id === productId && item.active
        );

        if (!offlineProduct) {
          return false;
        }

        const offlineImages = (offline.catalogImages || [])
          .filter((image) => image.product_id === productId)
          .map(({ product_id: _productId, ...image }) => image as CatalogImage);

        const offlineVariants = (offline.productVariants || [])
          .filter((variant) => variant.product_id === productId && variant.active)
          .map(({ product_id: _productId, ...variant }) => variant as ProductVariant);

        applyProductData(
          offlineProduct as Product,
          offlineImages,
          offlineVariants,
          true
        );

        return true;
      } catch (offlineError) {
        console.error("Erro ao carregar ficha offline:", offlineError);
        return false;
      }
    }

    async function loadProduct() {
      setLoading(true);
      setError("");

      if (!navigator.onLine) {
        const loaded = await loadOfflineProduct();

        if (!loaded && mounted) {
          setError(
            "Este produto não está disponível offline. Conecte-se à internet e atualize o conteúdo offline."
          );
          setLoading(false);
        }

        return;
      }

      try {
        const [productResult, imagesResult, variantsResult] = await Promise.all([
          supabase
            .from("products")
            .select(
              `
              id,
              name,
              sku,
              internal_code,
              barcode,
              description,
              specifications,
              width_cm,
              height_cm,
              depth_cm,
              weight_g,
              material,
              package_quantity,
              package_unit,
              sale_price,
              commercial_visibility,
              commercial_variants,
              commercial_highlights,
              active
            `
            )
            .eq("id", productId)
            .eq("active", true)
            .single(),

          supabase
            .from("product_images")
            .select(
              "id, image_url, catalog_slot, approved, source, is_primary, variant_id"
            )
            .eq("product_id", productId)
            .eq("source", "ai")
            .eq("approved", true),

          supabase
            .from("product_variants")
            .select("id, name, sku, barcode, color, image_url, sale_price, active")
            .eq("product_id", productId)
            .eq("active", true)
            .order("created_at", { ascending: true }),
        ]);

        const remoteFailed =
          Boolean(productResult.error) ||
          !productResult.data ||
          Boolean(imagesResult.error) ||
          Boolean(variantsResult.error);

        if (remoteFailed) {
          console.error(
            "Erro ao carregar ficha online:",
            productResult.error,
            imagesResult.error,
            variantsResult.error
          );

          const loaded = await loadOfflineProduct();

          if (!loaded && mounted) {
            setError("Produto não encontrado no catálogo.");
            setLoading(false);
          }

          return;
        }

        applyProductData(
          productResult.data as Product,
          (imagesResult.data || []) as CatalogImage[],
          (variantsResult.data || []) as ProductVariant[],
          false
        );
      } catch (remoteError) {
        console.error("Falha de conexão ao carregar produto:", remoteError);

        const loaded = await loadOfflineProduct();

        if (!loaded && mounted) {
          setError(
            "Não foi possível carregar este produto. Verifique sua conexão ou atualize o conteúdo offline."
          );
          setLoading(false);
        }
      }
    }

    loadProduct();

    return () => {
      mounted = false;
    };
  }, [productId]);

  const visibility = useMemo(
    () => ({
      sku: product?.commercial_visibility?.sku ?? true,
      internal_code: product?.commercial_visibility?.internal_code ?? true,
      barcode: product?.commercial_visibility?.barcode ?? true,
      description: product?.commercial_visibility?.description ?? true,
      material: product?.commercial_visibility?.material ?? true,
      dimensions: product?.commercial_visibility?.dimensions ?? true,
      weight: product?.commercial_visibility?.weight ?? true,
      package: product?.commercial_visibility?.package ?? true,
      specifications: product?.commercial_visibility?.specifications ?? true,
      variants: product?.commercial_visibility?.variants ?? true,
      price: product?.commercial_visibility?.price ?? true,
    }),
    [product]
  );

  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedVariantId) || null,
    [variants, selectedVariantId]
  );

  const visibleImages = useMemo(() => {
    if (selectedVariantId) {
      const variantImages = images.filter(
        (image) => image.variant_id === selectedVariantId
      );
      if (variantImages.length > 0) return variantImages;
    }

    const baseImages = images.filter((image) => !image.variant_id);
    return baseImages.length > 0 ? baseImages : images;
  }, [images, selectedVariantId]);

  function selectVariant(variantId: string) {
    setSelectedVariantId(variantId);

    const variantImages = images.filter(
      (image) => image.variant_id === variantId
    );
    const baseImages = images.filter((image) => !image.variant_id);
    const nextImages =
      variantImages.length > 0
        ? variantImages
        : baseImages.length > 0
          ? baseImages
          : images;

    const nextImage =
      nextImages.find((image) => image.catalog_slot === "front") ||
      nextImages.find((image) => image.is_primary) ||
      nextImages[0] ||
      null;

    setSelectedImage(nextImage);
  }

  const specs = useMemo(() => {
    if (!product) return [];

    return [
      visibility.material && product.material
        ? { label: "Material", value: product.material }
        : null,
      visibility.dimensions && product.width_cm !== null
        ? { label: "Largura", value: `${product.width_cm} cm` }
        : null,
      visibility.dimensions && product.height_cm !== null
        ? { label: "Altura", value: `${product.height_cm} cm` }
        : null,
      visibility.dimensions && product.depth_cm !== null
        ? { label: "Profundidade", value: `${product.depth_cm} cm` }
        : null,
      visibility.weight && product.weight_g !== null
        ? { label: "Peso", value: `${product.weight_g} g` }
        : null,
      visibility.package && product.package_quantity
        ? {
            label: "Embalagem",
            value: `${product.package_quantity} ${
              product.package_unit || "UNIDADE"
            }`,
          }
        : null,
    ].filter(
      (item): item is { label: string; value: string } => Boolean(item)
    );
  }, [product, visibility]);

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  function addCurrentSelectionToCart() {
    if (!product) return;

    if (variants.length > 0 && !selectedVariant) {
      setCartFeedback("Escolha uma variação antes de adicionar.");
      window.setTimeout(() => setCartFeedback(""), 2200);
      return;
    }

    const unitPrice = Number(
      selectedVariant?.sale_price ?? product.sale_price ?? 0
    );

    if (unitPrice <= 0) {
      setCartFeedback("Preço não disponível para esta opção.");
      window.setTimeout(() => setCartFeedback(""), 2200);
      return;
    }

    const imageUrl =
      selectedImage?.image_url ||
      visibleImages[0]?.image_url ||
      null;

    const key = `${product.id}:${selectedVariant?.id || "base"}`;

    addItem({
      key,
      product_id: product.id,
      variant_id: selectedVariant?.id || null,
      product_name: product.name,
      variant_name: selectedVariant?.name || null,
      sku: selectedVariant?.sku || product.sku,
      image_url: imageUrl,
      quantity,
      unit_price: unitPrice,
    });

    setCartFeedback(
      `${product.name}${selectedVariant ? ` • ${selectedVariant.name}` : ""} adicionado ao pedido.`
    );
    window.setTimeout(() => setCartFeedback(""), 2200);
  }

  async function handleShare() {
    const shareData = {
      title: product?.name || "Produto Camel Paper",
      text: product
        ? `${product.name}${product.sku ? ` • SKU ${product.sku}` : ""}`
        : "Produto Camel Paper",
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareFeedback("Ficha compartilhada.");
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShareFeedback("Link copiado.");
      }
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === "AbortError"
      ) {
        return;
      }

      console.error("Erro ao compartilhar:", shareError);
      setShareFeedback("Não foi possível compartilhar agora.");
    }

    window.setTimeout(() => setShareFeedback(""), 2600);
  }

  if (loading) {
    return (
      <>
        <SellerCatalogLoading mode="product" />
        <SellerCart
          open={cartOpen}
          onOpenChange={setCartOpen}
          onCheckout={() => router.push("/catalogo/checkout")}
        />
      </>
    );
  }

  if (error || !product) {
    return (
      <main className="state-page">
        <div>
          <strong>{error || "Produto não encontrado."}</strong>
          <button onClick={() => router.push("/catalogo")}>
            Voltar ao catálogo
          </button>
        </div>

        <style jsx>{`
        .share-top-button,.back-top-button,.share-main-button,.catalog-main-button{
          display:inline-flex;align-items:center;justify-content:center;gap:7px;
        }
        .gallery,.product-content,.variants-card,.copy-section{
          animation: sellerFadeUp .3s ease both;
        }
        .thumbnail-card,.variant-selector,.share-top-button,.back-top-button,.share-main-button,.catalog-main-button{
          transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,background .18s ease;
        }
        .thumbnail-card:hover,.variant-selector:hover{transform:translateY(-2px)}
        @keyframes sellerFadeUp{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}

          .state-page {
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f6f2ee;
            color: #6c5e57;
          }

          .state-page div {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .state-page button {
            border: 0;
            border-radius: 10px;
            padding: 12px 14px;
            background: #ef7a00;
            color: #fff;
            font-weight: 800;
            cursor: pointer;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="product-shell">
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-logo">
              <Image
                src="/brand/camel-colorido.svg"
                alt="Camel Paper"
                width={220}
                height={80}
                priority
              />
            </div>

            <span>Loja do Vendedor</span>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="share-top-button"
              onClick={handleShare}
            >
              <Share2 size={15} /> Compartilhar ficha
            </button>

            <button
              type="button"
              className="back-top-button"
              onClick={() => router.push("/catalogo")}
            >
              ← Voltar ao catálogo
            </button>
          </div>
        </div>
      </div>

      <div className="product-container">
        <section className="gallery">
          <div className="main-image">
            {selectedImage ? (
              <>
                <img
                  src={getOptimizedImageUrl(selectedImage.image_url, 1200, 82)}
                  alt={product.name}
                  decoding="async"
                />

                <span className="selected-image-badge">
                  {selectedImage.catalog_slot
                    ? SLOT_LABELS[selectedImage.catalog_slot]
                    : "Foto profissional"}
                </span>
              </>
            ) : (
              <div className="empty-image">
                <div className="empty-logo">
                  <Image
                    src="/brand/camel-colorido.svg"
                    alt="Camel Paper"
                    width={180}
                    height={70}
                  />
                </div>
                <p>Fotos profissionais em preparação.</p>
              </div>
            )}
          </div>

          {visibleImages.length > 0 && (
            <div className="thumbnails">
              {visibleImages.map((image) => (
                <button
                  type="button"
                  key={image.id}
                  className={
                    selectedImage?.id === image.id ? "active" : ""
                  }
                  onClick={() => setSelectedImage(image)}
                >
                  <img
                    src={getOptimizedImageUrl(image.image_url, 220, 70)}
                    alt={
                      image.catalog_slot
                        ? SLOT_LABELS[image.catalog_slot]
                        : product.name
                    }
                    loading="lazy"
                    decoding="async"
                  />
                  <span>
                    {image.catalog_slot
                      ? SLOT_LABELS[image.catalog_slot]
                      : "Foto"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="product-content">
          <div className="product-heading">
            <span className="eyebrow">PRODUTO CAMEL PAPER</span>
            <span className={`available-pill ${usingOfflineData ? "offline" : ""}`}>
              {usingOfflineData ? "● Disponível offline" : "● Disponível no catálogo"}
            </span>
          </div>

          <h1>{product.name}</h1>

          <p className="commercial-subtitle">
            Ficha comercial preparada para apresentação ao cliente com imagens
            profissionais aprovadas.
          </p>

          {visibility.variants && variants.length > 0 && (
            <div className="variant-selector">
              <div className="variant-selector-heading">
                <div>
                  <span>VARIAÇÕES DISPONÍVEIS</span>
                  <strong>Escolha uma opção</strong>
                </div>
                <small>{variants.length} opção{variants.length === 1 ? "" : "ões"}</small>
              </div>

              <div className="variant-options">
                {variants.map((variant) => (
                  <button
                    type="button"
                    key={variant.id}
                    className={selectedVariantId === variant.id ? "active" : ""}
                    onClick={() => selectVariant(variant.id)}
                  >
                    {variant.color && (
                      <span
                        className="variant-color-dot"
                        aria-hidden="true"
                        title={variant.color}
                      />
                    )}
                    <span className="variant-option-copy">
                      <strong>{variant.name}</strong>
                      {(variant.sku || variant.barcode) && (
                        <small>
                          {variant.sku ? `SKU ${variant.sku}` : ""}
                          {variant.sku && variant.barcode ? " • " : ""}
                          {variant.barcode ? `EAN ${variant.barcode}` : ""}
                        </small>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {visibility.price &&
            (selectedVariant?.sale_price !== null && selectedVariant?.sale_price !== undefined
              ? true
              : product.sale_price !== null) && (
            <div className="price-card">
              <span>PREÇO DE VENDA</span>
              <strong>
                {formatCurrency(
                  Number(
                    selectedVariant?.sale_price !== null &&
                      selectedVariant?.sale_price !== undefined
                      ? selectedVariant.sale_price
                      : product.sale_price
                  )
                )}
              </strong>
              {selectedVariant?.sale_price !== null &&
                selectedVariant?.sale_price !== undefined && (
                  <small>Preço da variação {selectedVariant.name}</small>
                )}
            </div>
          )}

          <div className="purchase-card">
            <div className="purchase-card-heading">
              <div>
                <span>ADICIONAR AO PEDIDO</span>
                <strong>
                  {selectedVariant
                    ? selectedVariant.name
                    : variants.length > 0
                      ? "Escolha uma variação"
                      : product.name}
                </strong>
              </div>

              <div className="cart-mini-summary">
                <span>{cartUnits} un.</span>
                <strong>{formatCurrency(cartTotal)}</strong>
              </div>
            </div>

            <div className="purchase-controls">
              <div className="quantity-picker">
                <button
                  type="button"
                  onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(
                      Math.max(1, Math.min(9999, Number(event.target.value) || 1))
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => setQuantity((current) => Math.min(9999, current + 1))}
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className="add-order-button"
                onClick={addCurrentSelectionToCart}
              >
                Adicionar ao pedido
              </button>
            </div>

            {cartFeedback && (
              <div className="cart-feedback" role="status">
                {cartFeedback}
              </div>
            )}
          </div>

          <div className="codes">
            {visibility.sku && product.sku && (
              <div>
                <span>SKU</span>
                <strong>{selectedVariant?.sku || product.sku}</strong>
              </div>
            )}

            {visibility.internal_code && product.internal_code && (
              <div>
                <span>Código</span>
                <strong>{product.internal_code}</strong>
              </div>
            )}

            {visibility.barcode && product.barcode && (
              <div>
                <span>EAN</span>
                <strong>{selectedVariant?.barcode || product.barcode}</strong>
              </div>
            )}
          </div>

          <div className="commercial-actions">
            <button
              type="button"
              className="share-main-button"
              onClick={handleShare}
            >
              <span>↗</span>
              Compartilhar produto
            </button>

            <button
              type="button"
              className="catalog-main-button"
              onClick={() => router.push("/catalogo")}
            >
              Ver outros produtos
            </button>

            {shareFeedback && (
              <span className="share-feedback">{shareFeedback}</span>
            )}
          </div>

          {visibility.description && (
            <div className="copy-section">
              <h2>Sobre o produto</h2>
              <p>
                {product.description ||
                  "Produto disponível no catálogo comercial Camel Paper."}
              </p>
            </div>
          )}

          {product.commercial_highlights && (
            <div className="copy-section commercial-highlight-section">
              <h2>Destaques comerciais</h2>
              <p>{product.commercial_highlights}</p>
            </div>
          )}

          {specs.length > 0 && (
            <div className="copy-section">
              <h2>Especificações</h2>

              <div className="spec-grid">
                {specs.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {visibility.specifications && product.specifications && (
            <div className="copy-section">
              <h2>Informações adicionais</h2>
              <p>{product.specifications}</p>
            </div>
          )}

          {visibility.variants && product.commercial_variants && (
            <div className="copy-section">
              <h2>Cores e variações</h2>
              <div className="variants-card">
                <span>VARIAÇÕES DISPONÍVEIS</span>
                <p>{product.commercial_variants}</p>
              </div>
            </div>
          )}

          <div className="presentation-note">
            <div>
              <strong>Apresentação comercial</strong>
              <p>
                Esta ficha utiliza somente imagens profissionais aprovadas para
                apresentação ao cliente.
              </p>
            </div>

            <span>
              {visibleImages.length}/4 foto{visibleImages.length === 1 ? "" : "s"} aprovada
              {visibleImages.length === 1 ? "" : "s"}
            </span>
          </div>
        </section>
      </div>

      <SellerCart
        open={cartOpen}
        onOpenChange={setCartOpen}
        onCheckout={() => router.push("/catalogo/checkout")}
      />

      <style jsx>{`
        .product-shell {
          min-height: 100vh;
          background: #f6f2ee;
          color: #271d19;
        }

        .topbar {
          border-bottom: 1px solid #e7ddd7;
          background: #fff;
        }

        .topbar-inner {
          max-width: 1180px;
          min-height: 76px;
          margin: 0 auto;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-logo {
          width: 170px;
          height: 58px;
          display: flex;
          align-items: center;
          justify-content: flex-start;
        }

        .brand-logo :global(img) {
          width: 170px;
          height: 58px;
          object-fit: contain;
          object-position: left center;
        }

        .brand > span {
          padding-left: 14px;
          border-left: 1px solid #e1d7d1;
          color: #766861;
          font-size: 10px;
          font-weight: 800;
        }

        .topbar-actions {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .share-top-button,
        .back-top-button {
          min-height: 38px;
          border-radius: 9px;
          padding: 0 12px;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .share-top-button {
          border: 1px solid #ef7a00;
          background: #ef7a00;
          color: #fff;
        }

        .back-top-button {
          border: 1px solid #ded4ce;
          background: #fff;
          color: #8a2a18;
        }

        .product-container {
          max-width: 1180px;
          margin: 0 auto;
          padding: 42px 24px 70px;
          display: grid;
          grid-template-columns: minmax(0, 1.04fr) minmax(0, 0.96fr);
          gap: 44px;
          align-items: start;
        }

        .gallery {
          position: sticky;
          top: 24px;
        }

        .main-image {
          position: relative;
          height: 620px;
          border-radius: 22px;
          border: 1px solid #e4dad4;
          background: #fff;
          overflow: hidden;
          box-shadow: 0 18px 48px rgba(70, 47, 36, 0.06);
        }

        .main-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 28px;
          box-sizing: border-box;
        }

        .selected-image-badge {
          position: absolute;
          top: 16px;
          left: 16px;
          border-radius: 999px;
          padding: 7px 10px;
          background: #fff3e7;
          border: 1px solid #f0d8c6;
          color: #8a2a18;
          font-size: 9px;
          font-weight: 900;
          box-shadow: 0 5px 14px rgba(76, 44, 29, 0.06);
        }

        .empty-image {
          height: 100%;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 12px;
          color: #8b7e77;
        }

        .empty-image span {
          width: 62px;
          height: 62px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          background: #fff0e3;
          color: #8a2a18;
          font-weight: 900;
        }

        .empty-image p {
          margin: 0;
          font-size: 12px;
        }

        .empty-logo {
          width: 190px;
          height: 80px;
          display: grid;
          place-items: center;
        }

        .empty-logo :global(img) {
          width: 190px;
          height: 80px;
          object-fit: contain;
        }

        .thumbnails {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .thumbnails button {
          overflow: hidden;
          border: 1px solid #e2d8d2;
          background: #fff;
          border-radius: 12px;
          padding: 0;
          cursor: pointer;
        }

        .thumbnails button.active {
          border: 2px solid #ef7a00;
        }

        .thumbnails img {
          width: 100%;
          height: 100px;
          object-fit: contain;
          display: block;
          background: #fff;
        }

        .thumbnails span {
          display: block;
          padding: 7px;
          border-top: 1px solid #eee7e2;
          color: #6d5e57;
          font-size: 9px;
          font-weight: 800;
          text-align: center;
        }

        .product-content {
          padding-top: 8px;
        }

        .product-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 10px;
        }

        .available-pill {
          flex: 0 0 auto;
          border-radius: 999px;
          padding: 7px 10px;
          border: 1px solid #d3ead9;
          background: #eef8f0;
          color: #2e7742;
          font-size: 9px;
          font-weight: 900;
        }

        .available-pill.offline {
          border-color: #ead8bd;
          background: #fff7e8;
          color: #9a5a18;
        }

        .commercial-subtitle {
          margin: 14px 0 0;
          max-width: 520px;
          color: #82756e;
          font-size: 12px;
          line-height: 1.65;
        }

        .variant-selector {
          margin-top: 20px;
          border-radius: 16px;
          border: 1px solid #ead9cd;
          background: #fff;
          padding: 15px;
        }

        .variant-selector-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 12px;
        }

        .variant-selector-heading > div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .variant-selector-heading span {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.2px;
        }

        .variant-selector-heading strong {
          color: #392820;
          font-size: 13px;
        }

        .variant-selector-heading > small {
          color: #8a2a18;
          font-size: 9px;
          font-weight: 900;
        }

        .variant-options {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .variant-options > button {
          min-height: 48px;
          border: 1px solid #e3d8d1;
          border-radius: 11px;
          background: #fffaf6;
          padding: 8px 11px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #4b3930;
          cursor: pointer;
          text-align: left;
        }

        .variant-options > button.active {
          border-color: #ef7a00;
          background: #fff1e3;
          box-shadow: 0 0 0 1px #ef7a00 inset;
        }

        .variant-color-dot {
          width: 12px;
          height: 12px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: #ef7a00;
          border: 2px solid #fff;
          box-shadow: 0 0 0 1px #d8c9bf;
        }

        .variant-option-copy {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .variant-option-copy strong {
          font-size: 11px;
        }

        .variant-option-copy small {
          color: #8f8179;
          font-size: 8px;
        }

        .price-card small {
          margin-top: 3px;
          color: #9a6b4c;
          font-size: 8px;
          font-weight: 800;
        }

        .price-card {
          margin-top: 18px;
          border-radius: 14px;
          border: 1px solid #f0d0b4;
          background: linear-gradient(135deg, #fff4e8, #fffaf6);
          padding: 14px 16px;
          display: inline-flex;
          flex-direction: column;
          gap: 4px;
          min-width: 190px;
        }

        .price-card span {
          color: #9a4c1f;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.1px;
        }

        .price-card strong {
          color: #8a2a18;
          font-size: 30px;
          line-height: 1;
          letter-spacing: -1px;
        }

        .purchase-card {
          margin-top: 14px;
          border: 1px solid #e8d7cc;
          border-radius: 16px;
          background: #fff;
          padding: 14px;
          box-shadow: 0 10px 24px rgba(76, 47, 34, 0.04);
        }

        .purchase-card-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 12px;
        }

        .purchase-card-heading > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .purchase-card-heading > div:first-child span {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.2px;
        }

        .purchase-card-heading > div:first-child strong {
          color: #3f3029;
          font-size: 13px;
        }

        .cart-mini-summary {
          min-width: 105px;
          text-align: right;
        }

        .cart-mini-summary span,
        .cart-mini-summary strong {
          display: block;
        }

        .cart-mini-summary span {
          color: #9a8b83;
          font-size: 8px;
          margin-bottom: 2px;
        }

        .cart-mini-summary strong {
          color: #8a2a18;
          font-size: 14px;
        }

        .purchase-controls {
          display: grid;
          grid-template-columns: 122px minmax(0, 1fr);
          gap: 10px;
        }

        .quantity-picker {
          min-height: 46px;
          border: 1px solid #e2d6ce;
          border-radius: 11px;
          background: #fffaf6;
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr) 38px;
          overflow: hidden;
        }

        .quantity-picker button {
          border: 0;
          background: #fff4eb;
          color: #8a2a18;
          font-size: 18px;
          font-weight: 900;
          cursor: pointer;
        }

        .quantity-picker input {
          width: 100%;
          border: 0;
          border-left: 1px solid #eaded7;
          border-right: 1px solid #eaded7;
          outline: 0;
          background: #fff;
          text-align: center;
          color: #392b25;
          font-weight: 900;
          -moz-appearance: textfield;
        }

        .quantity-picker input::-webkit-outer-spin-button,
        .quantity-picker input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        .add-order-button {
          min-height: 46px;
          border: 1px solid #8a2a18;
          border-radius: 11px;
          background: #8a2a18;
          color: #fff;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
          transition: transform .18s ease, background .18s ease;
        }

        .add-order-button:hover {
          transform: translateY(-1px);
          background: #742113;
        }

        .cart-feedback {
          margin-top: 9px;
          border-radius: 9px;
          background: #eef8f0;
          color: #347148;
          padding: 8px 10px;
          font-size: 9px;
          font-weight: 800;
        }

        .commercial-actions {
          position: relative;
          margin-top: 18px;
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
        }

        .share-main-button,
        .catalog-main-button {
          min-height: 46px;
          border-radius: 11px;
          padding: 0 15px;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
        }

        .share-main-button {
          min-width: 190px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid #ef7a00;
          background: #ef7a00;
          color: #fff;
          box-shadow: 0 8px 18px rgba(239, 122, 0, 0.14);
        }

        .share-main-button span {
          font-size: 14px;
        }

        .catalog-main-button {
          border: 1px solid #ded4ce;
          background: #fff;
          color: #67584f;
        }

        .share-feedback {
          flex: 1 1 100%;
          color: #347148;
          font-size: 10px;
          font-weight: 800;
          animation: feedbackIn 0.25s ease both;
        }

        @keyframes feedbackIn {
          from {
            opacity: 0;
            transform: translateY(3px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .eyebrow {
          display: inline-block;
          color: #ef7a00;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1.8px;
          margin-bottom: 10px;
        }

        h1 {
          margin: 0;
          font-size: clamp(34px, 5vw, 54px);
          line-height: 1;
          letter-spacing: -1.8px;
        }

        .codes {
          margin-top: 22px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .codes div {
          min-width: 110px;
          border-radius: 11px;
          background: #fff;
          border: 1px solid #e6ddd7;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .codes span {
          color: #a09189;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .codes strong {
          font-size: 12px;
          color: #4a372f;
        }

        .copy-section {
          margin-top: 28px;
          padding-top: 24px;
          border-top: 1px solid #e1d7d1;
        }

        .copy-section h2 {
          margin: 0;
          font-size: 16px;
        }

        .copy-section p {
          margin: 9px 0 0;
          color: #766962;
          font-size: 13px;
          line-height: 1.75;
          white-space: pre-line;
        }

        .spec-grid {
          margin-top: 13px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 9px;
        }

        .spec-grid div {
          border-radius: 10px;
          background: #fff;
          border: 1px solid #e5dcd6;
          padding: 11px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .spec-grid span {
          color: #9c8f88;
          font-size: 9px;
          text-transform: uppercase;
          font-weight: 800;
        }

        .spec-grid strong {
          color: #49372f;
          font-size: 12px;
        }

        .commercial-highlight-section {
          border-top-color: #efd9c6;
        }

        .commercial-highlight-section p {
          color: #5f4d44;
          font-weight: 600;
        }

        .variants-card {
          margin-top: 12px;
          border-radius: 12px;
          border: 1px solid #ecd7c5;
          background: #fff8f1;
          padding: 14px;
        }

        .variants-card span {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.2px;
        }

        .variants-card p {
          margin: 7px 0 0;
          color: #5f5049;
          font-size: 12px;
          line-height: 1.6;
          white-space: pre-line;
        }

        .presentation-note {
          margin-top: 28px;
          padding: 16px;
          border-radius: 13px;
          border: 1px solid #f0d7c1;
          background: #fff4e9;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .presentation-note strong {
          color: #8a2a18;
          font-size: 12px;
        }

        .presentation-note p {
          margin: 5px 0 0;
          color: #78675f;
          font-size: 11px;
          line-height: 1.5;
        }

        .presentation-note > span {
          flex: 0 0 auto;
          border-radius: 999px;
          padding: 7px 9px;
          background: #fff;
          border: 1px solid #ead8c8;
          color: #8a2a18;
          font-size: 9px;
          font-weight: 900;
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
          border: 1px solid #e2d6ce;
          border-radius: 10px;
          background: #fff;
          display: grid;
          grid-template-columns: 31px 40px 31px;
          overflow: hidden;
        }

        .quantity-control.compact button {
          border: 0;
          background: #fff8f3;
          color: #8a2a18;
          font-size: 14px;
          cursor: pointer;
        }

        .quantity-control.compact input {
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

        .quantity-control.compact input::-webkit-outer-spin-button,
        .quantity-control.compact input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
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

        @media (max-width: 900px) {
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

          .product-container {
            grid-template-columns: 1fr;
          }

          .gallery {
            position: static;
          }

          .main-image {
            height: 520px;
          }
        }

        @media (max-width: 620px) {
          .topbar-inner {
            padding-inline: 16px;
          }

          .product-container {
            padding: 28px 16px 52px;
            gap: 28px;
          }

          .main-image {
            height: 390px;
          }

          .thumbnails {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .spec-grid {
            grid-template-columns: 1fr;
          }

          .topbar-inner {
            align-items: flex-start;
            padding-block: 13px;
          }

          .brand {
            align-items: flex-start;
            flex-direction: column;
            gap: 6px;
          }

          .brand > span {
            padding-left: 0;
            border-left: 0;
          }

          .brand-logo,
          .brand-logo :global(img) {
            width: 145px;
            height: 50px;
          }

          .topbar-actions {
            align-items: stretch;
            flex-direction: column;
          }

          .share-top-button,
          .back-top-button {
            min-height: 34px;
            padding-inline: 9px;
            font-size: 9px;
          }

          .product-heading,
          .presentation-note {
            align-items: flex-start;
            flex-direction: column;
          }

          .purchase-card-heading {
            align-items: flex-start;
          }

          .purchase-controls {
            grid-template-columns: 1fr;
          }

          .cart-mini-summary {
            text-align: left;
          }

          .commercial-actions {
            flex-direction: column;
          }

          .share-main-button,
          .catalog-main-button {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
