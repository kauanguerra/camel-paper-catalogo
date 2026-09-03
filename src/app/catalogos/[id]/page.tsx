"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Catalog = {
  id: string;
  name: string;
  description: string | null;
  cover_title: string | null;
  cover_subtitle: string | null;
  status: "draft" | "published" | "archived";
  client_name: string | null;
  client_company: string | null;
  client_contact: string | null;
  valid_until: string | null;
  share_token: string | null;
  share_enabled: boolean;
  sent_at: string | null;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  specifications: string | null;
  material: string | null;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  weight_g: number | null;
  package_quantity: number | null;
  package_unit: string | null;
  sale_price: number | null;
  commercial_visibility: Record<string, boolean> | null;
  commercial_variants: string | null;
  commercial_highlights: string | null;
};

type CatalogProduct = {
  position: number;
  custom_price: number | null;
  products: Product | Product[] | null;
};

type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  catalog_slot: string | null;
  approved: boolean;
  source: string | null;
  variant_id: string | null;
};

type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  color: string | null;
  sale_price: number | null;
  active: boolean;
};

type CatalogResponse = {
  id: string;
  customer_name: string | null;
  customer_company: string | null;
  customer_contact: string | null;
  message: string | null;
  total_amount: number;
  status: "submitted" | "reviewed" | "archived";
  submitted_at: string;
};

type CatalogResponseItem = {
  id: string;
  response_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  products: {
    id: string;
    name: string;
    sku: string | null;
  } | {
    id: string;
    name: string;
    sku: string | null;
  }[] | null;
};

export default function CatalogPreviewPage() {
  const params = useParams<{ id: string }>();
  const catalogId = params.id;

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");
  const [responses, setResponses] = useState<CatalogResponse[]>([]);
  const [responseItems, setResponseItems] = useState<CatalogResponseItem[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(true);
  const [openResponseId, setOpenResponseId] = useState<string | null>(null);
  const [printResponseId, setPrintResponseId] = useState<string | null>(null);

  useEffect(() => {
    if (!catalogId) return;

    async function loadCatalog() {
      setLoading(true);

      const [catalogResult, itemsResult] = await Promise.all([
        supabase
          .from("catalogs")
          .select(
            "id, name, description, cover_title, cover_subtitle, status, client_name, client_company, client_contact, valid_until, share_token, share_enabled, sent_at"
          )
          .eq("id", catalogId)
          .single(),

        supabase
          .from("catalog_products")
          .select(
            `
            position,
            custom_price,
            products (
              id,
              name,
              sku,
              barcode,
              description,
              specifications,
              material,
              width_cm,
              height_cm,
              depth_cm,
              weight_g,
              package_quantity,
              package_unit,
              sale_price,
              commercial_visibility,
              commercial_variants,
              commercial_highlights
            )
          `
          )
          .eq("catalog_id", catalogId)
          .order("position"),
      ]);

      if (!catalogResult.error && catalogResult.data) {
        setCatalog(catalogResult.data as Catalog);
      }

      const normalizedProducts = ((itemsResult.data || []) as CatalogProduct[])
        .map((item) => {
          const product = Array.isArray(item.products)
            ? item.products[0]
            : item.products;

          if (!product) return null;

          return {
            ...product,
            // Neste catálogo, custom_price tem prioridade.
            // Se não houver preço personalizado, usa o preço padrão do produto.
            sale_price:
              item.custom_price !== null && item.custom_price !== undefined
                ? Number(item.custom_price)
                : product.sale_price,
          };
        })
        .filter((product): product is Product => Boolean(product));

      setProducts(normalizedProducts);

      if (normalizedProducts.length > 0) {
        const productIds = normalizedProducts.map((product) => product.id);

        const [imageResult, variantResult] = await Promise.all([
          supabase
            .from("product_images")
            .select("id, product_id, image_url, catalog_slot, approved, source, variant_id")
            .in("product_id", productIds)
            .eq("source", "ai")
            .eq("approved", true),
          supabase
            .from("product_variants")
            .select("id, product_id, name, sku, barcode, color, sale_price, active")
            .in("product_id", productIds)
            .eq("active", true)
            .order("created_at", { ascending: true }),
        ]);

        setImages((imageResult.data || []) as ProductImage[]);
        setVariants((variantResult.data || []) as ProductVariant[]);
      } else {
        setImages([]);
        setVariants([]);
      }

      const { data: responseRows } = await supabase
        .from("catalog_responses")
        .select(
          "id, customer_name, customer_company, customer_contact, message, total_amount, status, submitted_at"
        )
        .eq("catalog_id", catalogId)
        .order("submitted_at", { ascending: false });

      const typedResponses = (responseRows || []) as CatalogResponse[];
      setResponses(typedResponses);

      if (typedResponses.length > 0) {
        const responseIds = typedResponses.map((response) => response.id);
        const { data: responseItemRows } = await supabase
          .from("catalog_response_items")
          .select(
            `
              id,
              response_id,
              product_id,
              variant_id,
              quantity,
              unit_price,
              line_total,
              products (
                id,
                name,
                sku
              )
            `
          )
          .in("response_id", responseIds);

        setResponseItems((responseItemRows || []) as CatalogResponseItem[]);
      } else {
        setResponseItems([]);
      }

      setResponsesLoading(false);
      setLoading(false);
    }

    loadCatalog();
  }, [catalogId]);

  function getImage(productId: string, slot = "front") {
    return (
      images.find(
        (image) =>
          image.product_id === productId &&
          image.variant_id === null &&
          image.catalog_slot === slot
      ) ||
      images.find((image) => image.product_id === productId && image.variant_id === null) ||
      images.find((image) => image.product_id === productId) ||
      null
    );
  }

  function getCatalogImages(productId: string) {
    const slots = ["front", "back", "product", "detail"];
    const labels: Record<string, string> = {
      front: "Frente",
      back: "Verso",
      product: "Produto",
      detail: "Detalhe",
    };

    return slots
      .map((slot) => ({
        slot,
        label: labels[slot],
        image: images.find(
          (item) =>
            item.product_id === productId &&
            item.variant_id === null &&
            item.catalog_slot === slot
        ),
      }))
      .filter(
        (item): item is { slot: string; label: string; image: ProductImage } =>
          Boolean(item.image)
      );
  }

  function getProductVariants(productId: string) {
    return variants.filter((variant) => variant.product_id === productId);
  }

  function getVariantImage(productId: string, variantId: string) {
    const variantImages = images.filter(
      (image) => image.product_id === productId && image.variant_id === variantId
    );

    return (
      variantImages.find((image) => image.catalog_slot === "front") ||
      variantImages[0] ||
      null
    );
  }

  function getPublicCatalogUrl() {
    if (!catalog?.share_token || typeof window === "undefined") return "";
    return `${window.location.origin}/catalogo-cliente/${catalog.share_token}`;
  }

  async function activateShare() {
    if (!catalog) return;

    if (!catalog.valid_until) {
      setShareFeedback("Defina a validade deste catálogo antes de enviá-lo ao cliente.");
      return;
    }

    setSharing(true);
    setShareFeedback("");

    const { data, error } = await supabase
      .from("catalogs")
      .update({
        share_enabled: true,
        sent_at: catalog.sent_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", catalog.id)
      .select("share_token, share_enabled, sent_at")
      .single();

    if (error || !data) {
      setShareFeedback(error?.message || "Não foi possível ativar o link do cliente.");
      setSharing(false);
      return;
    }

    setCatalog((current) =>
      current
        ? {
            ...current,
            share_token: data.share_token,
            share_enabled: data.share_enabled,
            sent_at: data.sent_at,
          }
        : current
    );

    setShareFeedback("Link do cliente ativado.");
    setSharing(false);
  }

  async function disableShare() {
    if (!catalog) return;

    setSharing(true);
    setShareFeedback("");

    const { error } = await supabase
      .from("catalogs")
      .update({
        share_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", catalog.id);

    if (error) {
      setShareFeedback(error.message);
    } else {
      setCatalog((current) =>
        current ? { ...current, share_enabled: false } : current
      );
      setShareFeedback("Link do cliente desativado.");
    }

    setSharing(false);
  }

  async function copyShareLink() {
    const url = getPublicCatalogUrl();
    if (!url) {
      setShareFeedback("O link público ainda não está disponível.");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareFeedback("Link copiado. Agora você pode enviar ao cliente.");
    } catch {
      setShareFeedback(url);
    }
  }

  function formatMoney(value: number | null | undefined) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(value || 0));
  }

  function responseProduct(
    item: CatalogResponseItem
  ): { id: string; name: string; sku: string | null } | null {
    return Array.isArray(item.products) ? item.products[0] || null : item.products;
  }

  function responseVariant(item: CatalogResponseItem) {
    if (!item.variant_id) return null;
    return variants.find((variant) => variant.id === item.variant_id) || null;
  }

  function getResponseItemImage(item: CatalogResponseItem) {
    if (item.variant_id) {
      const variantImage = getVariantImage(item.product_id, item.variant_id);
      if (variantImage) return variantImage;
    }

    return getImage(item.product_id, "front");
  }

  async function markResponseReviewed(responseId: string) {
    const { error } = await supabase
      .from("catalog_responses")
      .update({ status: "reviewed" })
      .eq("id", responseId);

    if (!error) {
      setResponses((current) =>
        current.map((response) =>
          response.id === responseId
            ? { ...response, status: "reviewed" }
            : response
        )
      );
    }
  }

  function printCustomerResponse(responseId: string) {
    setPrintResponseId(responseId);

    window.setTimeout(() => {
      window.print();

      window.setTimeout(() => {
        setPrintResponseId(null);
      }, 300);
    }, 150);
  }

  async function togglePublished() {
    if (!catalog) return;

    setPublishing(true);

    const nextStatus = catalog.status === "published" ? "draft" : "published";

    const { error } = await supabase
      .from("catalogs")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", catalog.id);

    if (!error) {
      setCatalog((current) =>
        current ? { ...current, status: nextStatus } : current
      );
    }

    setPublishing(false);
  }

  if (loading) {
    return <main className="loading-page">Carregando catálogo...</main>;
  }

  if (!catalog) {
    return <main className="loading-page">Catálogo não encontrado.</main>;
  }

  return (
    <main className="preview-shell">
      <div className="toolbar no-print">
        <div>
          <Link href="/catalogos">← Voltar aos catálogos</Link>
          <strong>{catalog.name}</strong>
        </div>

        <div className="toolbar-actions">
          {catalog.share_enabled && catalog.share_token ? (
            <>
              <button type="button" className="share-button" onClick={copyShareLink}>
                Copiar link do cliente
              </button>
              <button type="button" onClick={disableShare} disabled={sharing}>
                {sharing ? "Aguarde..." : "Desativar link"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="share-button"
              onClick={activateShare}
              disabled={sharing}
            >
              {sharing ? "Ativando..." : "Enviar para cliente"}
            </button>
          )}

          <button type="button" onClick={togglePublished} disabled={publishing}>
            {catalog.status === "published" ? "Voltar para rascunho" : "Publicar"}
          </button>
          <button type="button" className="print-button" onClick={() => window.print()}>
            Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      <section className="share-panel no-print">
        <div className="share-panel-copy">
          <span>ENVIO AO CLIENTE</span>
          <h2>{catalog.client_company || catalog.client_name || "Catálogo comercial"}</h2>
          <div className="client-meta">
            {catalog.client_company && catalog.client_name && (
              <small>A/C {catalog.client_name}</small>
            )}
            {catalog.client_contact && <small>{catalog.client_contact}</small>}
            {catalog.valid_until ? (
              <small>
                Condições válidas até{" "}
                {new Date(`${catalog.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}
              </small>
            ) : (
              <small className="warning">Validade ainda não definida</small>
            )}
          </div>
        </div>

        <div className="share-panel-status">
          <span className={`status-dot ${catalog.share_enabled ? "active" : ""}`} />
          <div>
            <strong>{catalog.share_enabled ? "Link ativo" : "Link não enviado"}</strong>
            <small>
              {catalog.share_enabled
                ? "O cliente poderá acessar pelo link exclusivo."
                : "Ative o envio para liberar o acesso do cliente."}
            </small>
          </div>
        </div>

        {catalog.share_enabled && catalog.share_token && (
          <div className="share-url-box">
            <span>LINK EXCLUSIVO</span>
            <code>{getPublicCatalogUrl()}</code>
            <button type="button" onClick={copyShareLink}>Copiar link</button>
          </div>
        )}

        {shareFeedback && <div className="share-feedback">{shareFeedback}</div>}
      </section>

      <section className="responses-panel no-print">
        <div className="responses-heading">
          <div>
            <span>RETORNO DO CLIENTE</span>
            <h2>Seleções recebidas</h2>
            <p>
              As escolhas enviadas pelo cliente ficam registradas aqui no sistema.
            </p>
          </div>

          <div className="response-counter">
            <strong>{responses.length}</strong>
            <small>{responses.length === 1 ? "resposta" : "respostas"}</small>
          </div>
        </div>

        {responsesLoading ? (
          <div className="responses-empty">Carregando respostas...</div>
        ) : responses.length === 0 ? (
          <div className="responses-empty">
            <strong>Nenhuma seleção recebida ainda.</strong>
            <span>
              Quando o cliente clicar em “Enviar minha seleção”, a resposta aparecerá aqui.
            </span>
          </div>
        ) : (
          <div className="responses-list">
            {responses.map((response) => {
              const items = responseItems.filter(
                (item) => item.response_id === response.id
              );
              const isOpen = openResponseId === response.id;

              return (
                <article
                  className={`response-card ${
                    response.status === "submitted" ? "new" : ""
                  }`}
                  key={response.id}
                >
                  <button
                    type="button"
                    className="response-summary"
                    onClick={() =>
                      setOpenResponseId((current) =>
                        current === response.id ? null : response.id
                      )
                    }
                  >
                    <div className="response-person">
                      <div className="response-avatar">
                        {(response.customer_company ||
                          response.customer_name ||
                          "C")
                          .slice(0, 1)
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="response-title-row">
                          <strong>
                            {response.customer_company ||
                              response.customer_name ||
                              "Cliente"}
                          </strong>
                          {response.status === "submitted" && (
                            <span className="new-badge">NOVA</span>
                          )}
                        </div>
                        <small>
                          {response.customer_company && response.customer_name
                            ? `A/C ${response.customer_name} • `
                            : ""}
                          {new Date(response.submitted_at).toLocaleString("pt-BR")}
                        </small>
                      </div>
                    </div>

                    <div className="response-numbers">
                      <div>
                        <small>ITENS</small>
                        <strong>{items.length}</strong>
                      </div>
                      <div>
                        <small>TOTAL</small>
                        <strong>{formatMoney(response.total_amount)}</strong>
                      </div>
                      <span className="response-chevron">{isOpen ? "−" : "+"}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="response-detail">
                      <div className="response-contact-grid">
                        <div>
                          <span>CLIENTE</span>
                          <strong>{response.customer_name || "Não informado"}</strong>
                        </div>
                        <div>
                          <span>EMPRESA</span>
                          <strong>{response.customer_company || "Não informada"}</strong>
                        </div>
                        <div>
                          <span>CONTATO</span>
                          <strong>{response.customer_contact || "Não informado"}</strong>
                        </div>
                        <div>
                          <span>STATUS</span>
                          <strong>
                            {response.status === "submitted"
                              ? "Nova resposta"
                              : response.status === "reviewed"
                                ? "Visualizada"
                                : "Arquivada"}
                          </strong>
                        </div>
                      </div>

                      {response.message && (
                        <div className="response-message">
                          <span>OBSERVAÇÃO DO CLIENTE</span>
                          <p>{response.message}</p>
                        </div>
                      )}

                      <div className="response-products">
                        <div className="response-products-head">
                          <span>Produto</span>
                          <span>Qtd.</span>
                          <span>Unitário</span>
                          <span>Total</span>
                        </div>

                        {items.map((item) => {
                          const product = responseProduct(item);
                          const variant = responseVariant(item);
                          const productImage = getResponseItemImage(item);
                          return (
                            <div className="response-product-row" key={item.id}>
                              <div className="response-product-info">
                                <div className="response-product-thumb">
                                  {productImage ? (
                                    <img
                                      src={productImage.image_url}
                                      alt={product?.name || "Produto"}
                                    />
                                  ) : (
                                    <span>Sem foto</span>
                                  )}
                                </div>
                                <div className="response-product-copy">
                                  <strong>
                                    {product?.name || "Produto"}
                                    {variant ? ` — ${variant.name}` : ""}
                                  </strong>
                                  <small>
                                    {variant?.sku || product?.sku || "SKU não informado"}
                                    {variant?.barcode ? ` • EAN ${variant.barcode}` : ""}
                                  </small>
                                </div>
                              </div>
                              <strong>{Number(item.quantity)}</strong>
                              <span>{formatMoney(item.unit_price)}</span>
                              <strong>{formatMoney(item.line_total)}</strong>
                            </div>
                          );
                        })}
                      </div>

                      <div className="response-detail-footer">
                        <div>
                          <small>TOTAL DA SELEÇÃO</small>
                          <strong>{formatMoney(response.total_amount)}</strong>
                        </div>

                        <div className="response-actions">
                          <button
                            type="button"
                            className="pdf-action"
                            onClick={() => printCustomerResponse(response.id)}
                          >
                            Gerar PDF da seleção
                          </button>

                          <button
                            type="button"
                            className="print-action"
                            onClick={() => printCustomerResponse(response.id)}
                          >
                            Imprimir seleção
                          </button>

                          {response.status === "submitted" && (
                            <button
                              type="button"
                              onClick={() => markResponseReviewed(response.id)}
                            >
                              ✓ Marcar como visualizada
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {printResponseId && (() => {
        const response = responses.find((item) => item.id === printResponseId);
        if (!response) return null;

        const items = responseItems.filter(
          (item) => item.response_id === response.id
        );

        return (
          <section className="response-print-sheet">
            <header className="response-print-header">
              <Image
                src="/brand/camel-paper-logo.png"
                alt="Camel Paper"
                width={190}
                height={74}
              />

              <div>
                <span>SELEÇÃO DO CLIENTE</span>
                <strong>{catalog.name}</strong>
              </div>
            </header>

            <div className="response-print-title">
              <span>RETORNO COMERCIAL</span>
              <h1>
                {response.customer_company ||
                  response.customer_name ||
                  "Seleção do cliente"}
              </h1>
              <p>
                Seleção enviada em{" "}
                {new Date(response.submitted_at).toLocaleString("pt-BR")}
              </p>
            </div>

            <div className="response-print-info">
              <div>
                <span>CLIENTE</span>
                <strong>{response.customer_name || "Não informado"}</strong>
              </div>
              <div>
                <span>EMPRESA</span>
                <strong>{response.customer_company || "Não informada"}</strong>
              </div>
              <div>
                <span>CONTATO</span>
                <strong>{response.customer_contact || "Não informado"}</strong>
              </div>
              <div>
                <span>VALIDADE</span>
                <strong>
                  {catalog.valid_until
                    ? new Date(`${catalog.valid_until}T12:00:00`).toLocaleDateString("pt-BR")
                    : "Não informada"}
                </strong>
              </div>
            </div>

            {response.message && (
              <div className="response-print-message">
                <span>OBSERVAÇÃO DO CLIENTE</span>
                <p>{response.message}</p>
              </div>
            )}

            <div className="response-print-products">
              <div className="response-print-products-head">
                <span>Produto</span>
                <span>Qtd.</span>
                <span>Unitário</span>
                <span>Total</span>
              </div>

              {items.map((item) => {
                const product = responseProduct(item);
                const variant = responseVariant(item);
                const productImage = getResponseItemImage(item);

                return (
                  <div className="response-print-product-row" key={item.id}>
                    <div className="response-print-product-info">
                      <div className="response-print-product-thumb">
                        {productImage ? (
                          <img
                            src={productImage.image_url}
                            alt={product?.name || "Produto"}
                          />
                        ) : (
                          <span>Sem foto</span>
                        )}
                      </div>
                      <div className="response-print-product-copy">
                        <strong>
                          {product?.name || "Produto"}
                          {variant ? ` — ${variant.name}` : ""}
                        </strong>
                        <small>
                          {variant?.sku || product?.sku || "SKU não informado"}
                          {variant?.barcode ? ` • EAN ${variant.barcode}` : ""}
                        </small>
                      </div>
                    </div>
                    <strong>{Number(item.quantity)}</strong>
                    <span>{formatMoney(item.unit_price)}</span>
                    <strong>{formatMoney(item.line_total)}</strong>
                  </div>
                );
              })}
            </div>

            <div className="response-print-total">
              <span>TOTAL DA SELEÇÃO</span>
              <strong>{formatMoney(response.total_amount)}</strong>
            </div>

            <footer className="response-print-footer">
              <span>Camel Paper • Catálogo comercial personalizado</span>
              <span>
                Documento gerado em {new Date().toLocaleDateString("pt-BR")}
              </span>
            </footer>
          </section>
        );
      })()}

      <section className="catalog-document">
        <section className="cover-page print-page">
          <div className="cover-brand">
            <Image
              src="/brand/camel-paper-logo.png"
              alt="Camel Paper"
              width={330}
              height={130}
              priority
            />
          </div>

          <div className="cover-copy">
            <span>CATÁLOGO COMERCIAL</span>
            <h1>{catalog.cover_title || "Catálogo de Produtos"}</h1>
            <p>{catalog.cover_subtitle || "Camel Paper"}</p>

            {(catalog.client_company || catalog.client_name) && (
              <div className="cover-client">
                <span>PREPARADO PARA</span>
                <strong>{catalog.client_company || catalog.client_name}</strong>
                {catalog.client_company && catalog.client_name && (
                  <small>A/C {catalog.client_name}</small>
                )}
                {catalog.valid_until && (
                  <small>
                    Condições válidas até{" "}
                    {new Date(`${catalog.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}
                  </small>
                )}
              </div>
            )}
          </div>

          <div className="cover-footer">
            <span>{products.length} produtos selecionados</span>
            <strong>Camel Paper</strong>
          </div>
        </section>

        <section className="index-page print-page">
          <div className="page-brand">
            <Image
              src="/brand/camel-paper-logo.png"
              alt="Camel Paper"
              width={180}
              height={70}
            />
          </div>

          <div className="index-content">
            <span className="section-eyebrow">CONTEÚDO</span>
            <h2>Produtos deste catálogo</h2>

            <div className="index-list">
              {products.map((product, index) => (
                <div key={product.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{product.name}</strong>
                  <small>{product.sku || "SKU não informado"}</small>
                </div>
              ))}
            </div>
          </div>
        </section>

        {products.map((product, index) => {
          const front = getImage(product.id, "front");
          const catalogImages = getCatalogImages(product.id);
          const secondaryImages = catalogImages.filter(
            ({ image }) => image.id !== front?.id
          );
          const productVariants = getProductVariants(product.id);
          const visibility = {
            sku: product.commercial_visibility?.sku ?? true,
            barcode: product.commercial_visibility?.barcode ?? true,
            description: product.commercial_visibility?.description ?? true,
            material: product.commercial_visibility?.material ?? true,
            dimensions: product.commercial_visibility?.dimensions ?? true,
            weight: product.commercial_visibility?.weight ?? true,
            package: product.commercial_visibility?.package ?? true,
            specifications:
              product.commercial_visibility?.specifications ?? true,
            variants: product.commercial_visibility?.variants ?? true,
            price: product.commercial_visibility?.price ?? true,
          };

          const specs = [
            visibility.material && product.material
              ? ["Material", product.material]
              : null,
            visibility.dimensions && product.width_cm !== null
              ? ["Largura", `${product.width_cm} cm`]
              : null,
            visibility.dimensions && product.height_cm !== null
              ? ["Altura", `${product.height_cm} cm`]
              : null,
            visibility.dimensions && product.depth_cm !== null
              ? ["Profundidade", `${product.depth_cm} cm`]
              : null,
            visibility.weight && product.weight_g !== null
              ? ["Peso", `${product.weight_g} g`]
              : null,
            visibility.package && product.package_quantity
              ? [
                  "Embalagem",
                  `${product.package_quantity} ${product.package_unit || "UNIDADE"}`,
                ]
              : null,
          ].filter((item): item is string[] => Boolean(item));

          return (
            <section className="product-page print-page" key={product.id}>
              <header className="product-page-header">
                <Image
                  src="/brand/camel-paper-logo.png"
                  alt="Camel Paper"
                  width={150}
                  height={60}
                />

                <span>{String(index + 1).padStart(2, "0")}</span>
              </header>

              <div className="product-layout">
                <div className="product-gallery">
                  <div className="product-main-image">
                    {front ? (
                      <img src={front.image_url} alt={product.name} />
                    ) : (
                      <div className="image-empty">Imagem profissional em preparação</div>
                    )}
                    <span className="image-label">Foto principal</span>
                  </div>

                  {secondaryImages.length > 0 && (
                    <div className="product-thumbnails">
                      {secondaryImages.slice(0, 3).map(({ label, image }) => (
                        <div className="thumbnail-card" key={image.id}>
                          <img src={image.image_url} alt={`${label} de ${product.name}`} />
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="product-info">
                  <span className="section-eyebrow">PRODUTO CAMEL PAPER</span>
                  <h2>{product.name}</h2>

                  {visibility.price && product.sale_price !== null && (
                    <div className="catalog-price">
                      <span>PREÇO DE VENDA</span>
                      <strong>
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(Number(product.sale_price))}
                      </strong>
                    </div>
                  )}

                  <div className="codes">
                    {visibility.sku && product.sku && (
                      <div>
                        <span>SKU</span>
                        <strong>{product.sku}</strong>
                      </div>
                    )}

                    {visibility.barcode && product.barcode && (
                      <div>
                        <span>EAN</span>
                        <strong>{product.barcode}</strong>
                      </div>
                    )}
                  </div>

                  {visibility.description && product.description && (
                    <div className="copy-block">
                      <h3>Sobre o produto</h3>
                      <p>{product.description}</p>
                    </div>
                  )}

                  {product.commercial_highlights && (
                    <div className="highlight-block">
                      <span>DESTAQUES</span>
                      <p>{product.commercial_highlights}</p>
                    </div>
                  )}

                  {specs.length > 0 && (
                    <div className="spec-grid">
                      {specs.map(([label, value]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {visibility.variants && productVariants.length > 0 && (
                    <div className="catalog-variants-block">
                      <div className="catalog-variants-heading">
                        <div>
                          <span>VARIAÇÕES DISPONÍVEIS</span>
                          <h3>{productVariants.length} {productVariants.length === 1 ? "opção" : "opções"}</h3>
                        </div>
                        <small>Fotos profissionais de cada variação</small>
                      </div>

                      <div className="catalog-variants-grid">
                        {productVariants.map((variant) => {
                          const variantImage = getVariantImage(product.id, variant.id);
                          const variantPrice = variant.sale_price ?? product.sale_price;

                          return (
                            <div className="catalog-variant-card" key={variant.id}>
                              <div className="catalog-variant-image">
                                {variantImage ? (
                                  <img src={variantImage.image_url} alt={`${product.name} - ${variant.name}`} />
                                ) : (
                                  <span>Sem foto</span>
                                )}
                              </div>

                              <div className="catalog-variant-copy">
                                <strong>{variant.name}</strong>
                                {variant.color && variant.color !== variant.name && (
                                  <small>{variant.color}</small>
                                )}
                                {visibility.sku && variant.sku && (
                                  <small>SKU: {variant.sku}</small>
                                )}
                                {visibility.barcode && variant.barcode && (
                                  <small>EAN: {variant.barcode}</small>
                                )}
                                {visibility.price && variantPrice !== null && (
                                  <b>{formatMoney(variantPrice)}</b>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {visibility.variants && productVariants.length === 0 && product.commercial_variants && (
                    <div className="copy-block">
                      <h3>Cores e variações</h3>
                      <p>{product.commercial_variants}</p>
                    </div>
                  )}

                  {visibility.specifications && product.specifications && (
                    <div className="copy-block compact">
                      <h3>Informações adicionais</h3>
                      <p>{product.specifications}</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </section>

      <style jsx>{`
        .preview-shell {
          min-height: 100vh;
          background: #e9e4df;
          color: #271d19;
          padding-bottom: 60px;
        }

        .loading-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          background: #f6f2ee;
          color: #6f625c;
        }

        .toolbar {
          position: sticky;
          top: 0;
          z-index: 20;
          min-height: 68px;
          padding: 0 28px;
          background: #fff;
          border-bottom: 1px solid #ded6d0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .toolbar > div:first-child {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .toolbar :global(a) {
          color: #8a2a18;
          text-decoration: none;
          font-size: 10px;
          font-weight: 900;
        }

        .toolbar strong {
          color: #4e3c34;
          font-size: 11px;
        }

        .toolbar-actions {
          display: flex;
          gap: 8px;
        }

        .toolbar button {
          min-height: 38px;
          border-radius: 9px;
          padding: 0 13px;
          border: 1px solid #d9cec8;
          background: #fff;
          color: #6d5e57;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .toolbar .print-button {
          border-color: #ef7a00;
          background: #ef7a00;
          color: #fff;
        }

        .toolbar .share-button {
          border-color: #8a2a18;
          background: #8a2a18;
          color: #fff;
        }

        .share-panel {
          width: min(1040px, calc(100% - 40px));
          box-sizing: border-box;
          margin: 24px auto 0;
          padding: 18px;
          border: 1px solid #e4d8d1;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 8px 28px rgba(50, 36, 29, 0.06);
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          align-items: center;
        }

        .share-panel-copy > span,
        .share-url-box > span {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.4px;
        }

        .share-panel-copy h2 {
          margin: 4px 0 7px;
          color: #3d2d27;
          font-size: 18px;
        }

        .client-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 12px;
        }

        .client-meta small {
          color: #82746d;
          font-size: 9px;
        }

        .client-meta .warning {
          color: #a63c22;
          font-weight: 900;
        }

        .share-panel-status {
          min-width: 210px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 11px 12px;
          border-radius: 11px;
          background: #faf7f5;
          border: 1px solid #ebe2dc;
        }

        .status-dot {
          width: 9px;
          height: 9px;
          flex: 0 0 auto;
          border-radius: 50%;
          background: #b9afa9;
        }

        .status-dot.active {
          background: #39a464;
          box-shadow: 0 0 0 4px rgba(57, 164, 100, 0.1);
        }

        .share-panel-status div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .share-panel-status strong {
          font-size: 10px;
          color: #4b3931;
        }

        .share-panel-status small {
          max-width: 220px;
          color: #8e817a;
          font-size: 8px;
          line-height: 1.4;
        }

        .share-url-box {
          grid-column: 1 / -1;
          padding: 11px;
          border-radius: 10px;
          background: #fff7ef;
          border: 1px solid #efd0b5;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
        }

        .share-url-box code {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #69483b;
          font-size: 9px;
        }

        .share-url-box button {
          min-height: 32px;
          padding: 0 11px;
          border: 0;
          border-radius: 8px;
          background: #ef7a00;
          color: #fff;
          font-size: 8px;
          font-weight: 900;
          cursor: pointer;
        }

        .share-feedback {
          grid-column: 1 / -1;
          padding: 9px 10px;
          border-radius: 9px;
          background: #f8f3ef;
          color: #8a2a18;
          font-size: 9px;
          font-weight: 800;
        }

        .responses-panel {
          width: min(1040px, calc(100% - 40px));
          box-sizing: border-box;
          margin: 16px auto 0;
          padding: 18px;
          border: 1px solid #e4d8d1;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 8px 28px rgba(50, 36, 29, 0.06);
        }

        .responses-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid #eee5df;
        }

        .responses-heading > div:first-child > span {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.4px;
        }

        .responses-heading h2 {
          margin: 4px 0 3px;
          color: #3d2d27;
          font-size: 18px;
        }

        .responses-heading p {
          margin: 0;
          color: #8b7e77;
          font-size: 9px;
        }

        .response-counter {
          min-width: 72px;
          padding: 9px 12px;
          border-radius: 10px;
          background: #fff5eb;
          text-align: center;
          display: flex;
          flex-direction: column;
        }

        .response-counter strong {
          color: #8a2a18;
          font-size: 19px;
        }

        .response-counter small {
          color: #998b83;
          font-size: 7px;
        }

        .responses-empty {
          min-height: 86px;
          padding: 15px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 4px;
          text-align: center;
          color: #8b7e77;
          font-size: 9px;
        }

        .responses-empty strong {
          color: #59463d;
          font-size: 10px;
        }

        .responses-list {
          margin-top: 13px;
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .response-card {
          overflow: hidden;
          border: 1px solid #e7ded8;
          border-radius: 12px;
          background: #fcfaf8;
        }

        .response-card.new {
          border-color: #efc9a8;
          background: #fffaf5;
        }

        .response-summary {
          width: 100%;
          min-height: 64px;
          border: 0;
          padding: 10px 12px;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          text-align: left;
          cursor: pointer;
        }

        .response-person {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .response-avatar {
          width: 36px;
          height: 36px;
          flex: 0 0 auto;
          border-radius: 10px;
          background: #8a2a18;
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 13px;
          font-weight: 900;
        }

        .response-title-row {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .response-title-row strong {
          color: #46352e;
          font-size: 10px;
        }

        .new-badge {
          padding: 3px 5px;
          border-radius: 999px;
          background: #ef7a00;
          color: #fff;
          font-size: 6px;
          font-weight: 900;
          letter-spacing: .5px;
        }

        .response-person small {
          display: block;
          margin-top: 3px;
          color: #9b8e87;
          font-size: 7px;
        }

        .response-numbers {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .response-numbers > div {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .response-numbers small {
          color: #a2958e;
          font-size: 6px;
          font-weight: 900;
        }

        .response-numbers strong {
          color: #633c30;
          font-size: 10px;
        }

        .response-chevron {
          width: 25px;
          height: 25px;
          border-radius: 7px;
          background: #fff;
          border: 1px solid #e4dad4;
          display: grid;
          place-items: center;
          color: #8a2a18;
          font-weight: 900;
        }

        .response-detail {
          padding: 14px;
          border-top: 1px solid #e9dfd9;
          background: #fff;
        }

        .response-contact-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        .response-contact-grid > div {
          padding: 9px;
          border: 1px solid #eee5df;
          border-radius: 8px;
          background: #fcfaf8;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .response-contact-grid span,
        .response-message span {
          color: #a0938c;
          font-size: 6px;
          font-weight: 900;
          letter-spacing: .6px;
        }

        .response-contact-grid strong {
          color: #59463d;
          font-size: 8px;
          overflow-wrap: anywhere;
        }

        .response-message {
          margin-top: 9px;
          padding: 10px;
          border-radius: 8px;
          background: #fff6ed;
          border: 1px solid #f0d7c0;
        }

        .response-message p {
          margin: 4px 0 0;
          color: #6e5b52;
          font-size: 8px;
          line-height: 1.5;
        }

        .response-products {
          margin-top: 12px;
          border: 1px solid #e9dfd9;
          border-radius: 9px;
          overflow: hidden;
        }

        .response-products-head,
        .response-product-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 70px 100px 110px;
          gap: 10px;
          align-items: center;
        }

        .response-products-head {
          padding: 7px 10px;
          background: #f7f3f0;
          color: #9a8d86;
          font-size: 6px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .response-product-row {
          min-height: 47px;
          padding: 7px 10px;
          border-top: 1px solid #eee5df;
          color: #59463d;
          font-size: 8px;
        }

        .response-product-row > div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .response-product-row > div strong {
          font-size: 9px;
        }

        .response-product-row small {
          color: #9e918a;
          font-size: 7px;
        }

        .response-product-info {
          min-width: 0;
          display: flex !important;
          flex-direction: row !important;
          align-items: center;
          gap: 9px !important;
        }

        .response-product-thumb {
          width: 44px;
          height: 44px;
          flex: 0 0 44px;
          overflow: hidden;
          border: 1px solid #eee5df;
          border-radius: 8px;
          background: #fff;
          display: grid !important;
          place-items: center;
        }

        .response-product-thumb img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .response-product-thumb span {
          color: #b0a49d;
          font-size: 6px;
          text-align: center;
        }

        .response-product-copy {
          min-width: 0;
          display: flex !important;
          flex-direction: column !important;
          gap: 2px !important;
        }

        .response-detail-footer {
          margin-top: 12px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }

        .response-detail-footer > div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .response-detail-footer small {
          color: #9b8e87;
          font-size: 6px;
          font-weight: 900;
        }

        .response-detail-footer strong {
          color: #8a2a18;
          font-size: 19px;
        }

        .response-detail-footer button {
          min-height: 34px;
          padding: 0 11px;
          border: 0;
          border-radius: 8px;
          background: #8a2a18;
          color: #fff;
          font-size: 8px;
          font-weight: 900;
          cursor: pointer;
        }

        .response-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 7px;
        }

        .response-detail-footer .response-actions button {
          min-height: 34px;
          padding: 0 11px;
          border: 0;
          border-radius: 8px;
          background: #8a2a18;
          color: #fff;
          font-size: 8px;
          font-weight: 900;
          cursor: pointer;
        }

        .response-detail-footer .response-actions .pdf-action {
          background: #ef7a00;
        }

        .response-detail-footer .response-actions .print-action {
          border: 1px solid #d9cec8;
          background: #fff;
          color: #6d5e57;
        }

        .response-print-sheet {
          display: none;
        }

        .catalog-document {
          width: 210mm;
          margin: 28px auto 0;
          box-shadow: 0 22px 70px rgba(50, 36, 29, 0.18);
        }

        .print-page {
          width: 210mm;
          min-height: 297mm;
          box-sizing: border-box;
          background: #fff;
          page-break-after: always;
          break-after: page;
        }

        .cover-page {
          position: relative;
          overflow: hidden;
          padding: 28mm 24mm 22mm;
          background:
            linear-gradient(
              135deg,
              rgba(119, 30, 15, 0.98),
              rgba(151, 48, 22, 0.97)
            );
          color: #fff;
          display: flex;
          flex-direction: column;
        }

        .cover-page::after {
          content: "";
          position: absolute;
          width: 170mm;
          height: 170mm;
          right: -70mm;
          bottom: -70mm;
          border-radius: 50%;
          border: 30mm solid rgba(239, 122, 0, 0.15);
        }

        .cover-brand {
          width: 90mm;
          height: 34mm;
        }

        .cover-brand :global(img) {
          width: 90mm;
          height: 34mm;
          object-fit: contain;
          object-position: left center;
          filter: brightness(0) invert(1);
        }

        .cover-copy {
          margin-top: 62mm;
          max-width: 145mm;
          position: relative;
          z-index: 2;
        }

        .cover-copy span,
        .section-eyebrow {
          color: #f6a85d;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 2px;
        }

        .cover-copy h1 {
          margin: 7mm 0 0;
          font-size: 26mm;
          line-height: 0.93;
          letter-spacing: -2.6mm;
        }

        .cover-copy p {
          margin: 6mm 0 0;
          color: rgba(255,255,255,0.74);
          font-size: 5mm;
        }

        .cover-client {
          margin-top: 12mm;
          width: fit-content;
          max-width: 115mm;
          padding: 5mm 6mm;
          border: 0.3mm solid rgba(255,255,255,0.24);
          border-radius: 4mm;
          background: rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
          gap: 1.4mm;
        }

        .cover-client > span {
          color: #f6a85d;
          font-size: 2.3mm;
          font-weight: 900;
          letter-spacing: 0.5mm;
        }

        .cover-client strong {
          color: #fff;
          font-size: 5mm;
        }

        .cover-client small {
          color: rgba(255,255,255,0.72);
          font-size: 2.8mm;
        }

        .cover-footer {
          margin-top: auto;
          position: relative;
          z-index: 2;
          padding-top: 8mm;
          border-top: 0.3mm solid rgba(255,255,255,0.28);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 3.3mm;
        }

        .cover-footer span {
          color: rgba(255,255,255,0.64);
        }

        .index-page {
          padding: 20mm 22mm;
        }

        .page-brand :global(img) {
          width: 48mm;
          height: 18mm;
          object-fit: contain;
          object-position: left center;
        }

        .index-content {
          margin-top: 26mm;
        }

        .index-content h2 {
          margin: 3mm 0 12mm;
          font-size: 12mm;
          letter-spacing: -0.8mm;
        }

        .index-list {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4mm 8mm;
        }

        .index-list > div {
          min-height: 16mm;
          border-bottom: 0.25mm solid #e7ded8;
          display: grid;
          grid-template-columns: 12mm 1fr;
          grid-template-rows: auto auto;
          align-content: center;
          column-gap: 3mm;
        }

        .index-list > div > span {
          grid-row: 1 / 3;
          color: #ef7a00;
          font-size: 4mm;
          font-weight: 900;
        }

        .index-list strong {
          font-size: 3.8mm;
        }

        .index-list small {
          color: #948982;
          font-size: 2.7mm;
        }

        .product-page {
          padding: 14mm 16mm 16mm;
        }

        .product-page-header {
          min-height: 16mm;
          border-bottom: 0.25mm solid #eadfd9;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .product-page-header :global(img) {
          width: 40mm;
          height: 14mm;
          object-fit: contain;
          object-position: left center;
        }

        .product-page-header > span {
          color: #ef7a00;
          font-size: 4mm;
          font-weight: 900;
        }

        .product-layout {
          margin-top: 12mm;
          display: grid;
          grid-template-columns: 92mm 1fr;
          gap: 12mm;
          align-items: start;
        }

        .product-gallery {
          min-width: 0;
        }

        .product-main-image {
          position: relative;
          height: 166mm;
          border: 0.25mm solid #eadfd9;
          border-radius: 5mm;
          background: radial-gradient(circle at 50% 42%, #fff 0%, #fff 58%, #fbf7f3 100%);
          display: grid;
          place-items: center;
          overflow: hidden;
        }

        .product-main-image > img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 8mm;
          box-sizing: border-box;
        }

        .image-label {
          position: absolute;
          left: 5mm;
          top: 5mm;
          padding: 1.8mm 3mm;
          border-radius: 999px;
          background: #fff4e8;
          border: 0.25mm solid #f2d2b4;
          color: #9b321d;
          font-size: 2.2mm;
          font-weight: 900;
          text-transform: uppercase;
        }

        .product-thumbnails {
          margin-top: 4mm;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 3mm;
        }

        .thumbnail-card {
          height: 54mm;
          overflow: hidden;
          border: 0.25mm solid #eadfd9;
          border-radius: 3.5mm;
          background: #fff;
          display: grid;
          grid-template-rows: 1fr 9mm;
        }

        .thumbnail-card img {
          width: 100%;
          height: 100%;
          min-height: 0;
          object-fit: contain;
          padding: 3mm;
          box-sizing: border-box;
        }

        .thumbnail-card span {
          border-top: 0.25mm solid #eee5df;
          display: grid;
          place-items: center;
          color: #7a6b64;
          background: #fcfaf8;
          font-size: 2.3mm;
          font-weight: 900;
          text-transform: uppercase;
        }

        .image-empty {
          padding: 10mm;
          text-align: center;
          color: #92867f;
          font-size: 3mm;
        }

        .product-info {
          padding-top: 3mm;
        }

        .product-info h2 {
          margin: 3mm 0 0;
          font-size: 11mm;
          line-height: 0.98;
          letter-spacing: -0.8mm;
        }

        .catalog-price {
          margin-top: 5mm;
          width: fit-content;
          min-width: 46mm;
          padding: 4mm 5mm;
          border-radius: 3mm;
          background: linear-gradient(135deg, #fff1e4, #fff8f2);
          border: 0.3mm solid #efc7a6;
          display: flex;
          flex-direction: column;
          gap: 1.2mm;
        }

        .catalog-price span {
          color: #9a4b22;
          font-size: 2.2mm;
          font-weight: 900;
          letter-spacing: 0.45mm;
        }

        .catalog-price strong {
          color: #8a2a18;
          font-size: 7mm;
          line-height: 1;
          letter-spacing: -0.35mm;
        }

        .codes {
          margin-top: 6mm;
          display: flex;
          flex-wrap: wrap;
          gap: 2.5mm;
        }

        .codes div,
        .spec-grid div {
          border: 0.25mm solid #e6ddd7;
          border-radius: 2.5mm;
          background: #fcfaf8;
          padding: 2.8mm;
        }

        .codes div {
          min-width: 28mm;
          display: flex;
          flex-direction: column;
          gap: 1mm;
        }

        .codes span,
        .spec-grid span {
          color: #9b8f88;
          font-size: 2.3mm;
          font-weight: 800;
          text-transform: uppercase;
        }

        .codes strong,
        .spec-grid strong {
          font-size: 3mm;
        }

        .copy-block {
          margin-top: 6mm;
          padding-top: 5mm;
          border-top: 0.25mm solid #e8ded8;
        }

        .copy-block h3 {
          margin: 0;
          font-size: 4mm;
        }

        .copy-block p,
        .highlight-block p {
          margin: 2.5mm 0 0;
          color: #74665f;
          font-size: 3.2mm;
          line-height: 1.55;
          white-space: pre-line;
        }

        .copy-block.compact p {
          font-size: 2.9mm;
        }

        .highlight-block {
          margin-top: 6mm;
          padding: 4mm;
          border-radius: 3mm;
          border: 0.25mm solid #efd6c0;
          background: #fff5eb;
        }

        .highlight-block > span {
          color: #ef7a00;
          font-size: 2.3mm;
          font-weight: 900;
          letter-spacing: 0.5mm;
        }

        .spec-grid {
          margin-top: 6mm;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2.5mm;
        }

        .spec-grid div {
          display: flex;
          flex-direction: column;
          gap: 1mm;
        }


        .catalog-variants-block {
          margin-top: 5mm;
          padding-top: 4mm;
          border-top: 0.25mm solid #eadfd9;
        }

        .catalog-variants-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 4mm;
          margin-bottom: 3mm;
        }

        .catalog-variants-heading > div {
          display: flex;
          flex-direction: column;
          gap: 0.8mm;
        }

        .catalog-variants-heading span {
          color: #ef7a00;
          font-size: 2mm;
          font-weight: 900;
          letter-spacing: 0.35mm;
        }

        .catalog-variants-heading h3 {
          margin: 0;
          color: #3f302a;
          font-size: 3.6mm;
        }

        .catalog-variants-heading small {
          color: #9a8d86;
          font-size: 2mm;
          text-align: right;
        }

        .catalog-variants-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 2.5mm;
        }

        .catalog-variant-card {
          min-width: 0;
          padding: 2.2mm;
          border: 0.25mm solid #eadfd9;
          border-radius: 2.8mm;
          background: #fcfaf8;
          display: grid;
          grid-template-columns: 19mm minmax(0, 1fr);
          gap: 2.5mm;
          align-items: center;
          break-inside: avoid;
        }

        .catalog-variant-image {
          width: 19mm;
          height: 19mm;
          border-radius: 2mm;
          overflow: hidden;
          background: #fff;
          display: grid;
          place-items: center;
        }

        .catalog-variant-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .catalog-variant-image span {
          color: #a89b94;
          font-size: 1.8mm;
        }

        .catalog-variant-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.7mm;
        }

        .catalog-variant-copy strong {
          color: #4a3730;
          font-size: 2.9mm;
          line-height: 1.15;
        }

        .catalog-variant-copy small {
          color: #8f817a;
          font-size: 1.9mm;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .catalog-variant-copy b {
          margin-top: 0.4mm;
          color: #8a2a18;
          font-size: 2.8mm;
        }

        @media print {
          @page {
            size: A4;
            margin: 0;
          }

          body {
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          .preview-shell {
            padding: 0;
            background: #fff;
          }

          .catalog-document {
            width: auto;
            margin: 0;
            box-shadow: none;
          }

          .print-page {
            margin: 0;
          }

          .response-print-sheet {
            display: block !important;
            width: 210mm;
            min-height: 297mm;
            box-sizing: border-box;
            padding: 16mm;
            background: #fff;
            color: #2d211c;
          }

          .response-print-sheet + .catalog-document {
            display: none !important;
          }

          .response-print-header {
            min-height: 22mm;
            padding-bottom: 5mm;
            border-bottom: 0.3mm solid #e4d9d2;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10mm;
          }

          .response-print-header :global(img) {
            width: 46mm;
            height: 18mm;
            object-fit: contain;
            object-position: left center;
          }

          .response-print-header > div {
            text-align: right;
            display: flex;
            flex-direction: column;
            gap: 1mm;
          }

          .response-print-header span,
          .response-print-title > span,
          .response-print-message > span,
          .response-print-total > span,
          .response-print-info span {
            color: #ef7a00;
            font-size: 2.2mm;
            font-weight: 900;
            letter-spacing: 0.45mm;
          }

          .response-print-header strong {
            color: #8a2a18;
            font-size: 3.2mm;
          }

          .response-print-title {
            margin-top: 13mm;
          }

          .response-print-title h1 {
            margin: 2mm 0 0;
            color: #8a2a18;
            font-size: 12mm;
            line-height: 1;
            letter-spacing: -0.7mm;
          }

          .response-print-title p {
            margin: 3mm 0 0;
            color: #81736b;
            font-size: 3mm;
          }

          .response-print-info {
            margin-top: 10mm;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 3mm;
          }

          .response-print-info > div {
            min-height: 16mm;
            padding: 3mm;
            box-sizing: border-box;
            border: 0.25mm solid #eadfd9;
            border-radius: 2.5mm;
            background: #fcfaf8;
            display: flex;
            flex-direction: column;
            gap: 1.2mm;
          }

          .response-print-info strong {
            color: #4c3931;
            font-size: 3mm;
            overflow-wrap: anywhere;
          }

          .response-print-message {
            margin-top: 5mm;
            padding: 4mm;
            border-radius: 3mm;
            border: 0.25mm solid #efd6c0;
            background: #fff6ed;
          }

          .response-print-message p {
            margin: 2mm 0 0;
            color: #67584f;
            font-size: 3mm;
            line-height: 1.5;
            white-space: pre-line;
          }

          .response-print-products {
            margin-top: 8mm;
            border: 0.25mm solid #e6dbd5;
            border-radius: 3mm;
            overflow: hidden;
          }

          .response-print-products-head,
          .response-print-product-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 18mm 28mm 30mm;
            gap: 3mm;
            align-items: center;
          }

          .response-print-products-head {
            padding: 3mm 4mm;
            background: #f6f1ed;
            color: #8e8179;
            font-size: 2.2mm;
            font-weight: 900;
            text-transform: uppercase;
          }

          .response-print-product-row {
            min-height: 17mm;
            padding: 3mm 4mm;
            border-top: 0.25mm solid #ece3dd;
            font-size: 3mm;
          }

          .response-print-product-row > div {
            display: flex;
            flex-direction: column;
            gap: 1mm;
          }

          .response-print-product-row > div strong {
            color: #3f302a;
            font-size: 3.2mm;
          }

          .response-print-product-row small {
            color: #968a83;
            font-size: 2.4mm;
          }


          .response-print-product-info {
            min-width: 0;
            display: flex !important;
            flex-direction: row !important;
            align-items: center;
            gap: 3mm !important;
          }

          .response-print-product-thumb {
            width: 15mm;
            height: 15mm;
            flex: 0 0 15mm;
            overflow: hidden;
            border: 0.25mm solid #e7ddd7;
            border-radius: 2mm;
            background: #fff;
            display: grid !important;
            place-items: center;
          }

          .response-print-product-thumb img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }

          .response-print-product-thumb span {
            color: #a99d96;
            font-size: 1.8mm;
            text-align: center;
          }

          .response-print-product-copy {
            min-width: 0;
            display: flex !important;
            flex-direction: column !important;
            gap: 1mm !important;
          }

          .response-print-product-row > strong:last-child {
            color: #8a2a18;
          }

          .response-print-total {
            margin-top: 8mm;
            margin-left: auto;
            width: 66mm;
            padding: 5mm;
            box-sizing: border-box;
            border-radius: 3mm;
            background: #fff3e7;
            border: 0.3mm solid #efcba9;
            display: flex;
            flex-direction: column;
            gap: 1.5mm;
          }

          .response-print-total strong {
            color: #8a2a18;
            font-size: 8mm;
            line-height: 1;
          }

          .response-print-footer {
            margin-top: 15mm;
            padding-top: 4mm;
            border-top: 0.25mm solid #e5dbd5;
            display: flex;
            justify-content: space-between;
            gap: 8mm;
            color: #958982;
            font-size: 2.3mm;
          }
        }

        @media (max-width: 900px) {
          .catalog-document {
            transform-origin: top left;
          }

          .preview-shell {
            overflow-x: auto;
          }

          .share-panel {
            grid-template-columns: 1fr;
          }

          .share-url-box {
            grid-template-columns: 1fr;
          }

          .responses-heading,
          .response-summary,
          .response-detail-footer {
            align-items: stretch;
            flex-direction: column;
          }

          .response-actions {
            justify-content: flex-start;
          }

          .response-counter {
            width: fit-content;
          }

          .response-numbers {
            justify-content: space-between;
          }

          .response-contact-grid {
            grid-template-columns: 1fr 1fr;
          }

          .response-products {
            overflow-x: auto;
          }

          .response-products-head,
          .response-product-row {
            min-width: 620px;
          }
        }
      `}</style>
    </main>
  );
}
