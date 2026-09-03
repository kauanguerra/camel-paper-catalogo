"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Catalog = {
  id: string;
  name: string;
  description: string | null;
  cover_title: string | null;
  cover_subtitle: string | null;
  client_name: string | null;
  client_company: string | null;
  client_contact: string | null;
  valid_until: string | null;
  share_enabled: boolean;
  share_token: string | null;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  material: string | null;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  weight_g: number | null;
  package_quantity: number | null;
  package_unit: string | null;
  sale_price: number | null;
  commercial_visibility: Record<string, boolean> | null;
  commercial_highlights: string | null;
  commercial_variants: string | null;
};

type CatalogProductRow = {
  id: string;
  catalog_id: string;
  product_id: string;
  position: number;
  custom_price: number | null;
  products: Product | Product[] | null;
};

type CatalogProduct = {
  catalog_product_id: string;
  product: Product;
  price: number;
};

type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  variation_type: string | null;
  sku: string | null;
  barcode: string | null;
  color: string | null;
  sale_price: number | null;
  active: boolean;
};

type ProductImage = {
  id: string;
  product_id: string;
  variant_id: string | null;
  image_url: string;
  catalog_slot: string | null;
  approved: boolean;
  source: string | null;
};

export default function CatalogoClientePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedVariantOptions, setSelectedVariantOptions] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    if (!token) return;

    async function loadCatalog() {
      setLoading(true);
      setFeedback("");

      const { data: catalogData, error: catalogError } = await supabase
        .from("catalogs")
        .select(
          "id, name, description, cover_title, cover_subtitle, client_name, client_company, client_contact, valid_until, share_enabled, share_token"
        )
        .eq("share_token", token)
        .eq("share_enabled", true)
        .maybeSingle();

      if (catalogError || !catalogData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const typedCatalog = catalogData as Catalog;
      setCatalog(typedCatalog);
      setCustomerName(typedCatalog.client_name || "");
      setCustomerCompany(typedCatalog.client_company || "");
      setCustomerContact(typedCatalog.client_contact || "");

      const { data: productRows, error: productError } = await supabase
        .from("catalog_products")
        .select(
          `
            id,
            catalog_id,
            product_id,
            position,
            custom_price,
            products (
              id,
              name,
              sku,
              barcode,
              description,
              material,
              width_cm,
              height_cm,
              depth_cm,
              weight_g,
              package_quantity,
              package_unit,
              sale_price,
              commercial_visibility,
              commercial_highlights,
              commercial_variants
            )
          `
        )
        .eq("catalog_id", typedCatalog.id)
        .order("position");

      if (productError) {
        setFeedback("Não foi possível carregar os produtos deste catálogo.");
        setLoading(false);
        return;
      }

      const normalized: CatalogProduct[] = ((productRows || []) as CatalogProductRow[])
        .map((row) => {
          const product = Array.isArray(row.products) ? row.products[0] : row.products;
          if (!product) return null;

          const effectivePrice =
            row.custom_price !== null && row.custom_price !== undefined
              ? Number(row.custom_price)
              : Number(product.sale_price || 0);

          return {
            catalog_product_id: row.id,
            product,
            price: effectivePrice,
          };
        })
        .filter((item): item is CatalogProduct => Boolean(item));

      setItems(normalized);

      const initialQuantities: Record<string, number> = {};
      normalized.forEach((item) => {
        initialQuantities[item.catalog_product_id] = 1;
      });
      setQuantities(initialQuantities);

      if (normalized.length > 0) {
        const productIds = normalized.map((item) => item.product.id);

        const { data: imageRows } = await supabase
          .from("product_images")
          .select("id, product_id, variant_id, image_url, catalog_slot, approved, source")
          .in("product_id", productIds)
          .eq("source", "ai")
          .eq("approved", true);

        setImages((imageRows || []) as ProductImage[]);

        const { data: variantRows } = await supabase
          .from("product_variants")
          .select("id, product_id, name, variation_type, sku, barcode, color, sale_price, active")
          .in("product_id", productIds)
          .eq("active", true)
          .order("created_at");

        const loadedVariants = (variantRows || []) as ProductVariant[];
        setVariants(loadedVariants);

        const initialSelectedVariants: Record<string, string> = {};
        normalized.forEach((item) => {
          const firstVariant = loadedVariants.find((variant) => variant.product_id === item.product.id);
          if (firstVariant) initialSelectedVariants[item.catalog_product_id] = firstVariant.id;
        });
        setSelectedVariants(initialSelectedVariants);
      }

      setLoading(false);
    }

    loadCatalog();
  }, [token]);

  function localDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const expired = Boolean(
    catalog?.valid_until && localDateString() > catalog.valid_until
  );

  function formatDate(value: string | null) {
    if (!value) return "Sem validade informada";
    return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
  }

  function formatPrice(value: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(value || 0));
  }

  function getProductVariants(productId: string) {
    return variants.filter((variant) => variant.product_id === productId);
  }

  function getVariantPrice(item: CatalogProduct, variantId?: string) {
    if (!variantId) return item.price;
    const variant = variants.find((entry) => entry.id === variantId);
    return variant?.sale_price !== null && variant?.sale_price !== undefined
      ? Number(variant.sale_price)
      : item.price;
  }

  function getImage(productId: string, variantId?: string | null) {
    const scoped = images.filter(
      (image) => image.product_id === productId && image.variant_id === (variantId || null)
    );
    return (
      scoped.find((image) => image.catalog_slot === "front") ||
      scoped[0] ||
      (!variantId
        ? images.find((image) => image.product_id === productId && image.variant_id === null)
        : null) ||
      null
    );
  }

  function getProductImages(productId: string, variantId?: string | null) {
    const preferredSlots = ["front", "back", "product", "detail"];

    return [...images]
      .filter(
        (image) =>
          image.product_id === productId &&
          image.variant_id === (variantId || null)
      )
      .sort((a, b) => {
        const ai = preferredSlots.indexOf(a.catalog_slot || "");
        const bi = preferredSlots.indexOf(b.catalog_slot || "");
        const av = ai === -1 ? 999 : ai;
        const bv = bi === -1 ? 999 : bi;
        return av - bv;
      });
  }

  function openProductGallery(productId: string) {
    setOpenProductId(productId);
    setActiveImageIndex(0);
  }

  function closeProductGallery() {
    setOpenProductId(null);
    setActiveImageIndex(0);
  }

  function variantSelectionKey(catalogProductId: string, variantId: string) {
    return `${catalogProductId}::${variantId}`;
  }

  function toggleItem(catalogProductId: string) {
    if (expired || submitted) return;
    setSelected((current) => ({
      ...current,
      [catalogProductId]: !current[catalogProductId],
    }));
  }

  function toggleVariantItem(catalogProductId: string, variantId: string) {
    if (expired || submitted) return;
    const key = variantSelectionKey(catalogProductId, variantId);

    setSelectedVariantOptions((current) => ({
      ...current,
      [key]: !current[key],
    }));

    setQuantities((current) => ({
      ...current,
      [key]: current[key] || 1,
    }));

    setSelectedVariants((current) => ({
      ...current,
      [catalogProductId]: variantId,
    }));
  }

  function updateQuantity(selectionKey: string, value: number) {
    const safeValue = Math.max(1, Math.floor(Number(value) || 1));
    setQuantities((current) => ({
      ...current,
      [selectionKey]: safeValue,
    }));
  }

  const selectedEntries = useMemo(() => {
    const entries: Array<{
      item: CatalogProduct;
      variant: ProductVariant | null;
      selectionKey: string;
      quantity: number;
      unitPrice: number;
    }> = [];

    items.forEach((item) => {
      const productVariants = getProductVariants(item.product.id);

      if (productVariants.length > 0) {
        productVariants.forEach((variant) => {
          const key = variantSelectionKey(item.catalog_product_id, variant.id);
          if (!selectedVariantOptions[key]) return;

          entries.push({
            item,
            variant,
            selectionKey: key,
            quantity: quantities[key] || 1,
            unitPrice: getVariantPrice(item, variant.id),
          });
        });

        return;
      }

      if (!selected[item.catalog_product_id]) return;

      entries.push({
        item,
        variant: null,
        selectionKey: item.catalog_product_id,
        quantity: quantities[item.catalog_product_id] || 1,
        unitPrice: item.price,
      });
    });

    return entries;
  }, [items, selected, selectedVariantOptions, quantities, variants]);

  const total = useMemo(
    () =>
      selectedEntries.reduce(
        (sum, entry) => sum + entry.unitPrice * entry.quantity,
        0
      ),
    [selectedEntries]
  );

  async function handleSubmit() {
    if (!catalog || expired || submitted) return;

    if (selectedEntries.length === 0) {
      setFeedback("Selecione pelo menos um produto ou variação antes de enviar.");
      return;
    }

    if (!customerName.trim() && !customerCompany.trim()) {
      setFeedback("Informe seu nome ou o nome da empresa.");
      return;
    }

    setSubmitting(true);
    setFeedback("");

    try {
      const responseItems = selectedEntries.map((entry) => ({
        catalog_product_id: entry.item.catalog_product_id,
        product_id: entry.item.product.id,
        variant_id: entry.variant?.id || null,
        quantity: entry.quantity,
      }));

      const apiResponse = await fetch("/api/catalogo-cliente/respostas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          customer_name: customerName.trim() || null,
          customer_company: customerCompany.trim() || null,
          customer_contact: customerContact.trim() || null,
          message: message.trim() || null,
          items: responseItems,
        }),
      });

      const apiResult = await apiResponse.json().catch(() => null);

      if (!apiResponse.ok) {
        throw new Error(
          apiResult?.error || "Não foi possível registrar sua seleção."
        );
      }

      setSubmitted(true);
      setFeedback("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Ocorreu um erro ao enviar sua seleção."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="catalog-loading-page">
        <div className="catalog-loading-card">
          <div className="catalog-loading-logo-wrap">
            <div className="catalog-loading-orbit orbit-one" />
            <div className="catalog-loading-orbit orbit-two" />
            <div className="catalog-loading-orbit orbit-three" />

            <div className="catalog-loading-logo">
              <Image
                src="/brand/camel-colorido.svg"
                alt="Camel Paper"
                width={210}
                height={82}
                priority
              />
            </div>
          </div>

          <div className="catalog-loading-copy">
            <span>CAMEL PAPER</span>
            <h1>Preparando seu catálogo</h1>
            <p>Organizando produtos, fotos e condições comerciais.</p>
          </div>

          <div className="catalog-loading-progress" aria-hidden="true">
            <i />
          </div>

          <div className="catalog-loading-dots" aria-hidden="true">
            <b />
            <b />
            <b />
          </div>
        </div>

        <style jsx>{`
        .hero-card,.product-card,.send-card,.success-card,.gallery-modal{
          animation: clientFadeUp .32s ease both;
        }
        .product-card,.variant-main-button,.view-photos,.send-button,.stepper button,.gallery-close{
          transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,background .18s ease;
        }
        .product-card:hover{transform:translateY(-2px);box-shadow:0 18px 42px rgba(63,39,25,.08)}
        .variant-main-button:hover:not(:disabled),.view-photos:hover,.send-button:hover:not(:disabled){transform:translateY(-1px)}
        @keyframes clientFadeUp{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
        @media(prefers-reduced-motion:reduce){
          .hero-card,.product-card,.send-card,.success-card,.gallery-modal{animation:none!important}
        }

          .catalog-loading-page {
            min-height: 100vh;
            box-sizing: border-box;
            padding: 28px;
            background:
              radial-gradient(circle at 50% 45%, rgba(239, 122, 0, 0.09), transparent 24%),
              radial-gradient(circle at 50% 60%, rgba(138, 42, 24, 0.05), transparent 34%),
              #f6f2ee;
            display: grid;
            place-items: center;
            overflow: hidden;
            color: #3d2d27;
          }

          .catalog-loading-card {
            width: min(470px, 92vw);
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
          }

          .catalog-loading-logo-wrap {
            position: relative;
            width: 230px;
            height: 230px;
            display: grid;
            place-items: center;
          }

          .catalog-loading-logo {
            position: relative;
            z-index: 3;
            width: 145px;
            height: 145px;
            border-radius: 38px;
            border: 1px solid rgba(229, 214, 205, 0.95);
            background: rgba(255, 255, 255, 0.92);
            box-shadow:
              0 24px 65px rgba(72, 43, 31, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.9);
            display: grid;
            place-items: center;
            backdrop-filter: blur(12px);
            animation: logoFloat 2.8s ease-in-out infinite;
          }

          .catalog-loading-logo :global(img) {
            width: 112px;
            height: 52px;
            object-fit: contain;
          }

          .catalog-loading-orbit {
            position: absolute;
            inset: 50%;
            border-radius: 999px;
            border: 1px solid rgba(239, 122, 0, 0.18);
            transform: translate(-50%, -50%);
          }

          .catalog-loading-orbit::after {
            content: "";
            position: absolute;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #ef7a00;
            box-shadow: 0 0 18px rgba(239, 122, 0, 0.45);
          }

          .orbit-one {
            width: 186px;
            height: 186px;
            animation: orbitSpin 4.8s linear infinite;
          }

          .orbit-one::after {
            top: 15px;
            right: 28px;
          }

          .orbit-two {
            width: 214px;
            height: 214px;
            border-color: rgba(138, 42, 24, 0.11);
            animation: orbitSpinReverse 7s linear infinite;
          }

          .orbit-two::after {
            left: 20px;
            bottom: 34px;
            width: 6px;
            height: 6px;
            background: #8a2a18;
            box-shadow: 0 0 18px rgba(138, 42, 24, 0.32);
          }

          .orbit-three {
            width: 160px;
            height: 160px;
            border-style: dashed;
            border-color: rgba(239, 122, 0, 0.12);
            animation: orbitSpin 9s linear infinite;
          }

          .orbit-three::after {
            display: none;
          }

          .catalog-loading-copy {
            margin-top: 4px;
          }

          .catalog-loading-copy > span {
            color: #ef7a00;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 2.2px;
          }

          .catalog-loading-copy h1 {
            margin: 9px 0 0;
            color: #8a2a18;
            font-size: clamp(28px, 4vw, 38px);
            line-height: 1.05;
            letter-spacing: -1.3px;
          }

          .catalog-loading-copy p {
            margin: 11px 0 0;
            color: #877970;
            font-size: 11px;
            line-height: 1.55;
          }

          .catalog-loading-progress {
            width: min(280px, 72vw);
            height: 4px;
            margin-top: 24px;
            overflow: hidden;
            border-radius: 999px;
            background: rgba(138, 42, 24, 0.08);
          }

          .catalog-loading-progress i {
            display: block;
            width: 44%;
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, #8a2a18, #ef7a00, #f3a35c);
            animation: loadingSweep 1.55s ease-in-out infinite;
          }

          .catalog-loading-dots {
            margin-top: 13px;
            display: flex;
            align-items: center;
            gap: 5px;
          }

          .catalog-loading-dots b {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #ef7a00;
            opacity: 0.28;
            animation: dotPulse 1.2s ease-in-out infinite;
          }

          .catalog-loading-dots b:nth-child(2) {
            animation-delay: 0.15s;
          }

          .catalog-loading-dots b:nth-child(3) {
            animation-delay: 0.3s;
          }

          @keyframes orbitSpin {
            from { transform: translate(-50%, -50%) rotate(0deg); }
            to { transform: translate(-50%, -50%) rotate(360deg); }
          }

          @keyframes orbitSpinReverse {
            from { transform: translate(-50%, -50%) rotate(360deg); }
            to { transform: translate(-50%, -50%) rotate(0deg); }
          }

          @keyframes logoFloat {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-6px) scale(1.015); }
          }

          @keyframes loadingSweep {
            0% { transform: translateX(-115%); }
            55% { transform: translateX(95%); }
            100% { transform: translateX(260%); }
          }

          @keyframes dotPulse {
            0%, 100% { opacity: 0.25; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); }
          }

          @media (max-width: 560px) {
            .catalog-loading-page {
              padding: 20px;
            }

            .catalog-loading-logo-wrap {
              width: 205px;
              height: 205px;
            }

            .catalog-loading-logo {
              width: 128px;
              height: 128px;
              border-radius: 32px;
            }

            .orbit-one { width: 166px; height: 166px; }
            .orbit-two { width: 194px; height: 194px; }
            .orbit-three { width: 146px; height: 146px; }
          }

          @media (prefers-reduced-motion: reduce) {
            .catalog-loading-orbit,
            .catalog-loading-logo,
            .catalog-loading-progress i,
            .catalog-loading-dots b {
              animation-duration: 0.001ms !important;
              animation-iteration-count: 1 !important;
            }
          }
        `}</style>
      </main>
    );
  }

  if (notFound || !catalog) {
    return (
      <main className="state-page">
        <Image
          src="/brand/camel-colorido.svg"
          alt="Camel Paper"
          width={190}
          height={76}
          priority
        />
        <h1>Catálogo indisponível</h1>
        <p>Este link não existe ou foi desativado.</p>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="success-page">
        <div className="success-card">
          <Image
            src="/brand/camel-colorido.svg"
            alt="Camel Paper"
            width={210}
            height={82}
            priority
          />
          <div className="success-icon">✓</div>
          <span>SELEÇÃO ENVIADA</span>
          <h1>Recebemos sua seleção.</h1>
          <p>
            Obrigado. Sua escolha de produtos foi registrada e será analisada pela
            equipe comercial da Camel Paper.
          </p>
          <div className="success-total">
            <small>Total da seleção</small>
            <strong>{formatPrice(total)}</strong>
          </div>
        </div>

        <style jsx>{`
          .success-page {
            min-height: 100vh;
            box-sizing: border-box;
            padding: 32px 20px;
            background:
              radial-gradient(circle at 50% 10%, rgba(239,122,0,.08), transparent 28%),
              #f6f2ee;
            display: grid;
            place-items: center;
            color: #4c3931;
          }

          .success-card {
            width: min(520px, 100%);
            box-sizing: border-box;
            border: 1px solid #e4dad4;
            border-radius: 22px;
            background: #fff;
            padding: 38px;
            text-align: center;
            box-shadow: 0 18px 55px rgba(60, 40, 31, .08);
          }

          .success-card :global(img) {
            width: 175px;
            height: 68px;
            object-fit: contain;
          }

          .success-icon {
            width: 58px;
            height: 58px;
            margin: 20px auto 15px;
            border-radius: 50%;
            background: #e7f7ec;
            color: #2f9a55;
            display: grid;
            place-items: center;
            font-size: 24px;
            font-weight: 900;
          }

          .success-card > span {
            color: #ef7a00;
            font-size: 8px;
            font-weight: 900;
            letter-spacing: 1.5px;
          }

          .success-card h1 {
            margin: 8px 0 0;
            color: #8a2a18;
            font-size: 31px;
          }

          .success-card p {
            color: #7b6d65;
            font-size: 11px;
            line-height: 1.6;
          }

          .success-total {
            margin-top: 20px;
            border-radius: 12px;
            background: #fff6ed;
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .success-total small {
            color: #8b7c73;
            font-size: 8px;
          }

          .success-total strong {
            color: #8a2a18;
            font-size: 25px;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="client-shell">
      <header className="client-header">
        <div className="header-inner">
          <Image
            src="/brand/camel-colorido.svg"
            alt="Camel Paper"
            width={190}
            height={72}
            priority
          />

          <div className="header-validity">
            <span>CONDIÇÕES COMERCIAIS</span>
            <strong>
              {expired
                ? "Catálogo expirado"
                : `Válidas até ${formatDate(catalog.valid_until)}`}
            </strong>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span>CATÁLOGO PERSONALIZADO</span>
          <h1>{catalog.cover_title || "Catálogo de Produtos"}</h1>
          <p>{catalog.cover_subtitle || "Camel Paper"}</p>

          {(catalog.client_company || catalog.client_name) && (
            <div className="prepared-for">
              <small>PREPARADO PARA</small>
              <strong>{catalog.client_company || catalog.client_name}</strong>
              {catalog.client_company && catalog.client_name && (
                <span>A/C {catalog.client_name}</span>
              )}
            </div>
          )}
        </div>

        <div className="hero-card">
          <strong>{items.length}</strong>
          <span>produtos neste catálogo</span>
          <p>
            Selecione os itens de interesse, informe a quantidade desejada e envie
            sua seleção ao final da página.
          </p>
        </div>
      </section>

      {expired && (
        <section className="expired-banner">
          <strong>Este catálogo expirou em {formatDate(catalog.valid_until)}.</strong>
          <span>
            Os produtos continuam visíveis para consulta, mas novas seleções não
            podem mais ser enviadas.
          </span>
        </section>
      )}

      <section className="products-section">
        <div className="section-title">
          <span>PRODUTOS</span>
          <h2>Escolha o que deseja</h2>
        </div>

        <div className="products-grid">
          {items.map((item) => {
            const productVariants = getProductVariants(item.product.id);
            const checked =
              productVariants.length > 0
                ? productVariants.some((variant) =>
                    Boolean(
                      selectedVariantOptions[
                        variantSelectionKey(item.catalog_product_id, variant.id)
                      ]
                    )
                  )
                : Boolean(selected[item.catalog_product_id]);
            const selectedVariantId = selectedVariants[item.catalog_product_id];
            const selectedVariant = productVariants.find((variant) => variant.id === selectedVariantId);
            const image = getImage(item.product.id, selectedVariantId || null) || getImage(item.product.id);
            const visibility = item.product.commercial_visibility || {};
            const displayedPrice = getVariantPrice(item, selectedVariantId);

            return (
              <article
                key={item.catalog_product_id}
                className={`product-card ${checked ? "selected" : ""}`}
              >
                <div
                  className="image-wrap clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => openProductGallery(item.product.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openProductGallery(item.product.id);
                    }
                  }}
                >
                  {image ? (
                    <img src={image.image_url} alt={item.product.name} />
                  ) : (
                    <div className="no-image">Imagem em preparação</div>
                  )}

                  <span className="view-photos">Ver fotos</span>

                  {productVariants.length === 0 && (
                    <button
                      type="button"
                      className={`select-button ${checked ? "active" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleItem(item.catalog_product_id);
                      }}
                      disabled={expired}
                    >
                      {checked ? "✓ Selecionado" : "+ Tenho interesse"}
                    </button>
                  )}
                </div>

                <div className="product-content">
                  <div className="product-top">
                    <div>
                      <span>PRODUTO CAMEL PAPER</span>
                      <h3>{item.product.name}</h3>
                    </div>

                    {(visibility.price ?? true) && (
                      <strong className="price">{formatPrice(displayedPrice)}</strong>
                    )}
                  </div>

                  {(visibility.sku ?? true) && (selectedVariant?.sku || item.product.sku) && (
                    <small className="sku">SKU {selectedVariant?.sku || item.product.sku}</small>
                  )}

                  {(visibility.description ?? true) && item.product.description && (
                    <p className="description">{item.product.description}</p>
                  )}

                  {item.product.commercial_highlights && (
                    <div className="highlight">{item.product.commercial_highlights}</div>
                  )}

                  {productVariants.length > 0 && (
                    <div className="variant-section">
                      <div className="variant-heading">
                        <span>ESCOLHA AS VARIAÇÕES E QUANTIDADES</span>
                        <small>{productVariants.length} opção(ões)</small>
                      </div>

                      <div className="variant-grid">
                        {productVariants.map((variant) => {
                          const variantImage = getImage(item.product.id, variant.id);
                          const active = selectedVariantId === variant.id;
                          const selectionKey = variantSelectionKey(
                            item.catalog_product_id,
                            variant.id
                          );
                          const variantChecked = Boolean(
                            selectedVariantOptions[selectionKey]
                          );
                          const variantQuantity = quantities[selectionKey] || 1;
                          const variantPrice = getVariantPrice(item, variant.id);

                          return (
                            <div
                              key={variant.id}
                              className={`variant-option multi ${
                                active ? "active" : ""
                              } ${variantChecked ? "selected" : ""}`}
                            >
                              <button
                                type="button"
                                className="variant-main-button"
                                onClick={() => {
                                  if (expired) return;
                                  setSelectedVariants((current) => ({
                                    ...current,
                                    [item.catalog_product_id]: variant.id,
                                  }));
                                }}
                                disabled={expired}
                              >
                                <div className="variant-image">
                                  {variantImage ? (
                                    <img
                                      src={variantImage.image_url}
                                      alt={`${item.product.name} - ${variant.name}`}
                                    />
                                  ) : (
                                    <span>Sem foto</span>
                                  )}
                                </div>

                                <div className="variant-copy">
                                  <strong>{variant.name}</strong>
                                  {variant.color && <small>{variant.color}</small>}
                                  {variant.sku && <small>SKU {variant.sku}</small>}
                                  <b>{formatPrice(variantPrice)}</b>
                                </div>

                                <i>{variantChecked ? "✓" : active ? "•" : ""}</i>
                              </button>

                              {!expired && (
                                <div className="variant-order-row">
                                  <button
                                    type="button"
                                    className={`variant-interest ${
                                      variantChecked ? "active" : ""
                                    }`}
                                    onClick={() =>
                                      toggleVariantItem(
                                        item.catalog_product_id,
                                        variant.id
                                      )
                                    }
                                  >
                                    {variantChecked
                                      ? "✓ Adicionada à seleção"
                                      : "+ Quero esta variação"}
                                  </button>

                                  {variantChecked && (
                                    <div className="variant-qty">
                                      <span>Qtd.</span>
                                      <div className="stepper">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateQuantity(
                                              selectionKey,
                                              variantQuantity - 1
                                            )
                                          }
                                        >
                                          −
                                        </button>
                                        <input
                                          type="number"
                                          min={1}
                                          step={1}
                                          value={variantQuantity}
                                          onChange={(event) =>
                                            updateQuantity(
                                              selectionKey,
                                              Number(event.target.value)
                                            )
                                          }
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateQuantity(
                                              selectionKey,
                                              variantQuantity + 1
                                            )
                                          }
                                        >
                                          +
                                        </button>
                                      </div>
                                      <small>
                                        {formatPrice(variantPrice * variantQuantity)}
                                      </small>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {checked && !expired && productVariants.length === 0 && (
                    <div className="quantity-box">
                      <div>
                        <span>Quantidade desejada</span>
                        <small>
                          Subtotal{" "}
                          {formatPrice(
                            item.price *
                              (quantities[item.catalog_product_id] || 1)
                          )}
                        </small>
                      </div>

                      <div className="stepper">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              item.catalog_product_id,
                              (quantities[item.catalog_product_id] || 1) - 1
                            )
                          }
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={quantities[item.catalog_product_id] || 1}
                          onChange={(event) =>
                            updateQuantity(
                              item.catalog_product_id,
                              Number(event.target.value)
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              item.catalog_product_id,
                              (quantities[item.catalog_product_id] || 1) + 1
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="send-section">
        <div className="send-card">
          <div className="send-heading">
            <div>
              <span>FINALIZAR SELEÇÃO</span>
              <h2>Envie sua escolha para a Camel Paper</h2>
            </div>
            <div className="selection-count">
              <strong>{selectedEntries.length}</strong>
              <small>item(ns)</small>
            </div>
          </div>

          <div className="customer-grid">
            <label>
              <span>Nome</span>
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                disabled={expired}
                placeholder="Seu nome"
              />
            </label>

            <label>
              <span>Empresa</span>
              <input
                value={customerCompany}
                onChange={(event) => setCustomerCompany(event.target.value)}
                disabled={expired}
                placeholder="Nome da empresa"
              />
            </label>

            <label className="full">
              <span>WhatsApp ou e-mail</span>
              <input
                value={customerContact}
                onChange={(event) => setCustomerContact(event.target.value)}
                disabled={expired}
                placeholder="Seu contato"
              />
            </label>

            <label className="full">
              <span>Observação</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={expired}
                rows={3}
                placeholder="Ex.: Gostaria de confirmar prazo de entrega."
              />
            </label>
          </div>

          <div className="send-footer">
            <div className="total-box">
              <span>Total estimado</span>
              <strong>{formatPrice(total)}</strong>
              <small>
                Calculado com os preços deste catálogo e as quantidades selecionadas.
              </small>
            </div>

            <button
              type="button"
              className="send-button"
              onClick={handleSubmit}
              disabled={expired || submitting || selectedEntries.length === 0}
            >
              {expired
                ? "Catálogo expirado"
                : submitting
                  ? "Enviando seleção..."
                  : "Enviar minha seleção →"}
            </button>
          </div>

          {feedback && <div className="feedback">{feedback}</div>}
        </div>
      </section>

      {openProductId && (() => {
        const currentItem = items.find(
          (item) => item.product.id === openProductId
        );
        const galleryImages = getProductImages(openProductId);
        const currentImage = galleryImages[activeImageIndex] || galleryImages[0];

        if (!currentItem) return null;

        return (
          <div className="gallery-backdrop" onClick={closeProductGallery}>
            <div
              className="gallery-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Fotos de ${currentItem.product.name}`}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="gallery-close"
                onClick={closeProductGallery}
                aria-label="Fechar"
              >
                ×
              </button>

              <div className="gallery-main">
                {currentImage ? (
                  <img
                    src={currentImage.image_url}
                    alt={currentItem.product.name}
                  />
                ) : (
                  <div className="gallery-empty">
                    Nenhuma foto profissional aprovada disponível.
                  </div>
                )}
              </div>

              <div className="gallery-info">
                <span>PRODUTO CAMEL PAPER</span>
                <h2>{currentItem.product.name}</h2>
                <strong>{formatPrice(currentItem.price)}</strong>

                {currentItem.product.description && (
                  <p>{currentItem.product.description}</p>
                )}

                {galleryImages.length > 1 && (
                  <div className="gallery-thumbs">
                    {galleryImages.map((galleryImage, index) => (
                      <button
                        type="button"
                        key={galleryImage.id}
                        className={index === activeImageIndex ? "active" : ""}
                        onClick={() => setActiveImageIndex(index)}
                      >
                        <img
                          src={galleryImage.image_url}
                          alt={`${currentItem.product.name} ${index + 1}`}
                        />
                      </button>
                    ))}
                  </div>
                )}

                {!expired &&
                  (getProductVariants(currentItem.product.id).length === 0 ? (
                    <button
                      type="button"
                      className={`modal-interest ${
                        selected[currentItem.catalog_product_id] ? "active" : ""
                      }`}
                      onClick={() => toggleItem(currentItem.catalog_product_id)}
                    >
                      {selected[currentItem.catalog_product_id]
                        ? "✓ Produto selecionado"
                        : "+ Tenho interesse neste produto"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="modal-interest"
                      onClick={closeProductGallery}
                    >
                      Escolher variações e quantidades
                    </button>
                  ))}
              </div>
            </div>
          </div>
        );
      })()}

      <footer>
        <Image
          src="/brand/camel-colorido.svg"
          alt="Camel Paper"
          width={140}
          height={55}
        />
        <span>Catálogo comercial personalizado</span>
      </footer>

      <style jsx>{`
        .client-shell {
          min-height: 100vh;
          background: #f6f2ee;
          color: #2d211c;
        }

        .client-header {
          position: sticky;
          top: 0;
          z-index: 20;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid #e8ded8;
        }

        .header-inner {
          max-width: 1220px;
          min-height: 76px;
          margin: 0 auto;
          padding: 0 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .header-inner :global(img) {
          width: 155px;
          height: 58px;
          object-fit: contain;
          object-position: left center;
        }

        .header-validity {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .header-validity span {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.3px;
        }

        .header-validity strong {
          color: #8a2a18;
          font-size: 11px;
        }

        .hero {
          max-width: 1220px;
          margin: 0 auto;
          padding: 68px 22px 54px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 330px;
          gap: 40px;
          align-items: end;
        }

        .hero-copy > span,
        .section-title > span,
        .send-heading > div:first-child > span {
          color: #ef7a00;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.8px;
        }

        .hero h1 {
          max-width: 760px;
          margin: 9px 0 0;
          color: #8a2a18;
          font-size: clamp(44px, 7vw, 86px);
          line-height: 0.94;
          letter-spacing: -4px;
        }

        .hero-copy > p {
          margin: 15px 0 0;
          color: #867970;
          font-size: 17px;
        }

        .prepared-for {
          width: fit-content;
          margin-top: 28px;
          padding: 13px 16px;
          border: 1px solid #efd1b8;
          border-radius: 12px;
          background: #fff7ef;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .prepared-for small {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .prepared-for strong {
          color: #8a2a18;
          font-size: 14px;
        }

        .prepared-for span {
          color: #8c7c73;
          font-size: 10px;
        }

        .hero-card {
          border-radius: 20px;
          background: linear-gradient(145deg, #8d2a18, #aa381d);
          color: #fff;
          padding: 28px;
          box-shadow: 0 18px 50px rgba(111, 37, 20, 0.16);
        }

        .hero-card > strong {
          display: block;
          font-size: 52px;
          line-height: 1;
        }

        .hero-card > span {
          color: #f5b375;
          font-size: 12px;
          font-weight: 900;
        }

        .hero-card p {
          margin: 20px 0 0;
          color: rgba(255,255,255,.72);
          font-size: 11px;
          line-height: 1.6;
        }

        .expired-banner {
          max-width: 1176px;
          box-sizing: border-box;
          margin: 0 auto 26px;
          padding: 16px 18px;
          border: 1px solid #e6b9aa;
          border-radius: 13px;
          background: #fff0ec;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .expired-banner strong {
          color: #8a2a18;
          font-size: 12px;
        }

        .expired-banner span {
          color: #856d64;
          font-size: 10px;
        }

        .products-section {
          max-width: 1220px;
          margin: 0 auto;
          padding: 22px 22px 60px;
        }

        .section-title h2 {
          margin: 6px 0 22px;
          font-size: 30px;
          letter-spacing: -1px;
        }

        .products-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .product-card {
          overflow: hidden;
          border: 1px solid #e6ddd7;
          border-radius: 17px;
          background: #fff;
          box-shadow: 0 7px 25px rgba(64, 43, 33, 0.045);
          transition: 0.18s ease;
        }

        .product-card.selected {
          border-color: #ef7a00;
          box-shadow: 0 11px 32px rgba(239, 122, 0, 0.12);
        }

        .image-wrap {
          position: relative;
          height: 330px;
          background: radial-gradient(circle at 50% 45%, #fff, #fff 60%, #faf5f1);
          border-bottom: 1px solid #eee6e1;
        }

        .image-wrap > img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          box-sizing: border-box;
          padding: 22px;
        }

        .image-wrap.clickable {
          cursor: zoom-in;
        }

        .view-photos {
          position: absolute;
          top: 14px;
          right: 14px;
          padding: 8px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,.94);
          border: 1px solid #e2d7d0;
          color: #8a2a18;
          font-size: 8px;
          font-weight: 900;
          box-shadow: 0 5px 16px rgba(40,28,23,.06);
          pointer-events: none;
        }

        .no-image {
          height: 100%;
          display: grid;
          place-items: center;
          color: #9b8f88;
          font-size: 11px;
        }

        .select-button {
          position: absolute;
          left: 14px;
          bottom: 14px;
          min-height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid #dfd4cd;
          background: rgba(255,255,255,.96);
          color: #6e5e56;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 5px 16px rgba(40,28,23,.08);
        }

        .select-button.active {
          border-color: #ef7a00;
          background: #ef7a00;
          color: #fff;
        }

        .select-button:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .product-content {
          padding: 17px;
        }

        .product-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .product-top > div > span {
          color: #ef7a00;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .product-top h3 {
          margin: 4px 0 0;
          color: #3d2d27;
          font-size: 17px;
          line-height: 1.18;
        }

        .price {
          flex: 0 0 auto;
          color: #8a2a18;
          font-size: 17px;
        }

        .sku {
          display: block;
          margin-top: 8px;
          color: #a0948d;
          font-size: 8px;
          font-weight: 800;
        }

        .description {
          margin: 12px 0 0;
          color: #74665f;
          font-size: 10px;
          line-height: 1.55;
        }

        .highlight {
          margin-top: 12px;
          padding: 10px;
          border-radius: 9px;
          background: #fff6ed;
          color: #80533e;
          font-size: 9px;
          line-height: 1.5;
        }


        .variant-section {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid #eee5df;
        }

        .variant-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 9px;
        }

        .variant-heading span {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .variant-heading small {
          color: #9b8e87;
          font-size: 8px;
        }

        .variant-option.multi {
          padding: 0;
          overflow: hidden;
        }

        .variant-option.multi.selected {
          border-color: #ef7a00;
          background: #fffaf5;
          box-shadow: 0 0 0 1px rgba(239,122,0,.16);
        }

        .variant-main-button {
          width: 100%;
          min-width: 0;
          border: 0;
          background: transparent;
          padding: 10px;
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr) 18px;
          gap: 9px;
          align-items: center;
          text-align: left;
          color: inherit;
          cursor: pointer;
        }

        .variant-main-button:disabled {
          cursor: default;
        }

        .variant-order-row {
          border-top: 1px solid #eee5df;
          padding: 8px;
          background: #fff;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .variant-order-row .variant-interest {
          width: 100%;
          margin: 0;
        }

        .variant-qty {
          display: grid;
          grid-template-columns: auto auto minmax(0, 1fr);
          align-items: center;
          gap: 8px;
        }

        .variant-qty > span {
          color: #6d5d55;
          font-size: 8px;
          font-weight: 900;
        }

        .variant-qty > small {
          color: #8a2a18;
          font-size: 9px;
          font-weight: 900;
          text-align: right;
        }

        .variant-grid {
          display: grid;
          gap: 8px;
        }

        .variant-option {
          width: 100%;
          min-height: 78px;
          display: grid;
          grid-template-columns: 62px 1fr 24px;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border: 1px solid #e4d9d2;
          border-radius: 11px;
          background: #fff;
          text-align: left;
          cursor: pointer;
        }

        .variant-option.active {
          border-color: #ef7a00;
          background: #fff8f1;
          box-shadow: 0 0 0 2px rgba(239,122,0,.08);
        }

        .variant-image {
          width: 62px;
          height: 62px;
          border-radius: 8px;
          background: #faf6f2;
          overflow: hidden;
          display: grid;
          place-items: center;
        }

        .variant-image img { width: 100%; height: 100%; object-fit: contain; padding: 4px; box-sizing: border-box; }
        .variant-image span { color: #aa9d95; font-size: 7px; }
        .variant-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .variant-copy strong { color: #49362e; font-size: 10px; }
        .variant-copy small { color: #9a8c84; font-size: 7px; }
        .variant-copy b { color: #8a2a18; font-size: 10px; margin-top: 2px; }
        .variant-option i { font-style: normal; color: #ef7a00; font-weight: 900; font-size: 16px; text-align: center; }

        .variant-interest {
          width: 100%;
          min-height: 40px;
          margin-top: 9px;
          border: 1px solid #dfd4cd;
          border-radius: 9px;
          background: #fff;
          color: #7b655b;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .variant-interest.active { border-color: #ef7a00; background: #ef7a00; color: #fff; }

        .quantity-box {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid #eee5df;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }

        .quantity-box > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .quantity-box span {
          color: #55433b;
          font-size: 9px;
          font-weight: 900;
        }

        .quantity-box small {
          color: #a0938c;
          font-size: 8px;
        }

        .stepper {
          display: grid;
          grid-template-columns: 34px 48px 34px;
          overflow: hidden;
          border: 1px solid #ddd3cd;
          border-radius: 9px;
        }

        .stepper button,
        .stepper input {
          height: 34px;
          border: 0;
          background: #fff;
          text-align: center;
          color: #633e31;
          font-weight: 900;
        }

        .stepper button {
          cursor: pointer;
          background: #faf7f4;
        }

        .stepper input {
          min-width: 0;
          border-left: 1px solid #eee4de;
          border-right: 1px solid #eee4de;
          outline: none;
        }

        .send-section {
          padding: 0 22px 70px;
        }

        .send-card {
          max-width: 1176px;
          margin: 0 auto;
          padding: 28px;
          border-radius: 20px;
          background: #fff;
          border: 1px solid #e5dbd5;
          box-shadow: 0 13px 40px rgba(58, 40, 31, 0.06);
        }

        .send-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding-bottom: 19px;
          border-bottom: 1px solid #eee5df;
        }

        .send-heading h2 {
          margin: 6px 0 0;
          font-size: 24px;
        }

        .selection-count {
          min-width: 90px;
          padding: 10px 13px;
          border-radius: 11px;
          background: #fff5eb;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .selection-count strong {
          color: #8a2a18;
          font-size: 22px;
        }

        .selection-count small {
          color: #9a8d86;
          font-size: 8px;
        }

        .customer-grid {
          margin-top: 20px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .customer-grid label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .customer-grid label.full {
          grid-column: 1 / -1;
        }

        .customer-grid label > span {
          color: #66564e;
          font-size: 9px;
          font-weight: 900;
        }

        .customer-grid input,
        .customer-grid textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #ddd3cd;
          border-radius: 9px;
          padding: 11px 12px;
          color: #342722;
          background: #fff;
          outline: none;
          font: inherit;
          font-size: 10px;
        }

        .customer-grid input:focus,
        .customer-grid textarea:focus {
          border-color: #ef7a00;
          box-shadow: 0 0 0 3px rgba(239,122,0,.08);
        }

        .customer-grid textarea {
          resize: vertical;
        }

        .send-footer {
          margin-top: 22px;
          padding-top: 20px;
          border-top: 1px solid #eee5df;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
        }

        .total-box {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .total-box > span {
          color: #8a7b73;
          font-size: 9px;
          font-weight: 800;
        }

        .total-box strong {
          color: #8a2a18;
          font-size: 32px;
          line-height: 1;
        }

        .total-box small {
          margin-top: 4px;
          color: #a0938c;
          font-size: 8px;
        }

        .send-button {
          min-height: 50px;
          padding: 0 20px;
          border: 0;
          border-radius: 11px;
          background: #8a2a18;
          color: #fff;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .send-button:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .feedback {
          margin-top: 13px;
          padding: 10px 12px;
          border-radius: 9px;
          background: #fff0e8;
          color: #8a2a18;
          font-size: 9px;
          font-weight: 800;
        }

        .gallery-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          padding: 24px;
          background: rgba(38, 26, 21, .72);
          backdrop-filter: blur(6px);
          display: grid;
          place-items: center;
        }

        .gallery-modal {
          position: relative;
          width: min(980px, 96vw);
          max-height: 90vh;
          overflow: auto;
          border-radius: 20px;
          background: #fff;
          box-shadow: 0 30px 90px rgba(0,0,0,.25);
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(280px, .65fr);
        }

        .gallery-close {
          position: absolute;
          top: 14px;
          right: 14px;
          z-index: 2;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 1px solid #ded4ce;
          background: rgba(255,255,255,.96);
          color: #6b554b;
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
        }

        .gallery-main {
          min-height: 580px;
          background: radial-gradient(circle at 50% 45%, #fff, #fff 62%, #faf5f1);
          display: grid;
          place-items: center;
          border-right: 1px solid #eee5df;
        }

        .gallery-main > img {
          width: 100%;
          height: 100%;
          max-height: 680px;
          object-fit: contain;
          box-sizing: border-box;
          padding: 34px;
        }

        .gallery-empty {
          color: #998c85;
          font-size: 11px;
        }

        .gallery-info {
          padding: 34px 28px 28px;
          display: flex;
          flex-direction: column;
        }

        .gallery-info > span {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.2px;
        }

        .gallery-info h2 {
          margin: 6px 0 8px;
          color: #3d2d27;
          font-size: 26px;
          line-height: 1.05;
        }

        .gallery-info > strong {
          color: #8a2a18;
          font-size: 24px;
        }

        .gallery-info > p {
          margin: 14px 0 0;
          color: #74665f;
          font-size: 10px;
          line-height: 1.6;
        }

        .gallery-thumbs {
          margin-top: 22px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        .gallery-thumbs button {
          height: 82px;
          overflow: hidden;
          border-radius: 10px;
          border: 1px solid #e2d8d1;
          background: #fff;
          padding: 0;
          cursor: pointer;
        }

        .gallery-thumbs button.active {
          border: 2px solid #ef7a00;
        }

        .gallery-thumbs img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 6px;
          box-sizing: border-box;
        }

        .modal-interest {
          margin-top: auto;
          min-height: 46px;
          border: 0;
          border-radius: 10px;
          background: #8a2a18;
          color: #fff;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .modal-interest.active {
          background: #ef7a00;
        }

        footer {
          min-height: 110px;
          border-top: 1px solid #e6ddd7;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 3px;
          color: #9a8d86;
          font-size: 8px;
        }

        footer :global(img) {
          width: 115px;
          height: 44px;
          object-fit: contain;
        }

        .state-page,
        .success-page {
          min-height: 100vh;
          background: #f6f2ee;
          display: grid;
          place-items: center;
          text-align: center;
          color: #4c3931;
          padding: 24px;
        }

        .state-page :global(img) {
          width: 170px;
          height: 66px;
          object-fit: contain;
        }

        .state-page h1 {
          margin: 12px 0 0;
          color: #8a2a18;
        }

        .state-page p {
          color: #8c7e76;
        }

        .success-card {
          width: min(520px, 100%);
          box-sizing: border-box;
          border: 1px solid #e4dad4;
          border-radius: 22px;
          background: #fff;
          padding: 38px;
          box-shadow: 0 18px 55px rgba(60, 40, 31, .08);
        }

        .success-card :global(img) {
          width: 175px;
          height: 68px;
          object-fit: contain;
        }

        .success-icon {
          width: 58px;
          height: 58px;
          margin: 20px auto 15px;
          border-radius: 50%;
          background: #e7f7ec;
          color: #2f9a55;
          display: grid;
          place-items: center;
          font-size: 24px;
          font-weight: 900;
        }

        .success-card > span {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.5px;
        }

        .success-card h1 {
          margin: 8px 0 0;
          color: #8a2a18;
          font-size: 31px;
        }

        .success-card p {
          color: #7b6d65;
          font-size: 11px;
          line-height: 1.6;
        }

        .success-total {
          margin-top: 20px;
          border-radius: 12px;
          background: #fff6ed;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .success-total small {
          color: #8b7c73;
          font-size: 8px;
        }

        .success-total strong {
          color: #8a2a18;
          font-size: 25px;
        }

        @media (max-width: 980px) {
          .hero {
            grid-template-columns: 1fr;
          }

          .hero-card {
            max-width: 420px;
          }

          .products-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .header-inner {
            min-height: 68px;
          }

          .header-inner :global(img) {
            width: 125px;
          }

          .header-validity span {
            display: none;
          }

          .header-validity strong {
            max-width: 150px;
            text-align: right;
            font-size: 9px;
          }

          .hero {
            padding-top: 40px;
          }

          .hero h1 {
            font-size: 48px;
            letter-spacing: -2.5px;
          }

          .products-grid {
            grid-template-columns: 1fr;
          }

          .image-wrap {
            height: 300px;
          }

          .customer-grid {
            grid-template-columns: 1fr;
          }

          .customer-grid label.full {
            grid-column: auto;
          }

          .send-footer {
            align-items: stretch;
            flex-direction: column;
          }

          .send-button {
            width: 100%;
          }

          .total-box strong {
            font-size: 28px;
          }

          .gallery-backdrop {
            padding: 10px;
          }

          .gallery-modal {
            width: 100%;
            max-height: 94vh;
            grid-template-columns: 1fr;
          }

          .gallery-main {
            min-height: 360px;
            border-right: 0;
            border-bottom: 1px solid #eee5df;
          }

          .gallery-main > img {
            max-height: 420px;
            padding: 20px;
          }

          .gallery-info {
            padding: 22px 18px 18px;
          }

          .gallery-thumbs {
            grid-template-columns: repeat(4, 1fr);
          }

          .gallery-thumbs button {
            height: 64px;
          }

          .modal-interest {
            margin-top: 20px;
          }
        }
      `}</style>
    </main>
  );
}
