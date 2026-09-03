"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppSidebar from "@/components/AppSidebar";

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  internal_code: string | null;
  category_id: string | null;
  active: boolean;
  sale_price: number | null;
};

type ProductImage = {
  product_id: string;
  image_url: string;
  catalog_slot: string | null;
  approved: boolean;
  source: string | null;
};

type Catalog = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  created_at: string;
  client_name: string | null;
  client_company: string | null;
  valid_until: string | null;
  share_enabled: boolean;
};

type CatalogResponseSummary = {
  id: string;
  catalog_id: string;
  total_amount: number;
  status: "submitted" | "reviewed" | "archived";
  submitted_at: string;
};

export default function CatalogosAdminPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [catalogResponses, setCatalogResponses] = useState<CatalogResponseSummary[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [customPrices, setCustomPrices] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("Catálogo Geral Camel Paper");
  const [description, setDescription] = useState(
    "Seleção comercial de produtos Camel Paper."
  );
  const [coverTitle, setCoverTitle] = useState("Catálogo de Produtos");
  const [coverSubtitle, setCoverSubtitle] = useState("Camel Paper");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [shareAfterCreate, setShareAfterCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      const [
        categoriesResult,
        productsResult,
        imagesResult,
        catalogsResult,
        responsesResult,
      ] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name")
          .eq("active", true)
          .order("name"),

        supabase
          .from("products")
          .select("id, name, sku, internal_code, category_id, active, sale_price")
          .eq("active", true)
          .order("name"),

        supabase
          .from("product_images")
          .select("product_id, image_url, catalog_slot, approved, source")
          .eq("source", "ai")
          .eq("approved", true),

        supabase
          .from("catalogs")
          .select("id, name, description, status, created_at, client_name, client_company, valid_until, share_enabled")
          .eq("active", true)
          .order("created_at", { ascending: false }),

        supabase
          .from("catalog_responses")
          .select("id, catalog_id, total_amount, status, submitted_at")
          .order("submitted_at", { ascending: false }),
      ]);

      if (!categoriesResult.error) {
        setCategories((categoriesResult.data || []) as Category[]);
      }

      if (!productsResult.error) {
        setProducts((productsResult.data || []) as Product[]);
      }

      if (!imagesResult.error) {
        setImages((imagesResult.data || []) as ProductImage[]);
      }

      if (!catalogsResult.error) {
        setCatalogs((catalogsResult.data || []) as Catalog[]);
      }

      if (!responsesResult.error) {
        setCatalogResponses(
          (responsesResult.data || []) as CatalogResponseSummary[]
        );
      }

      setLoading(false);
    }

    loadData();
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const categoryMatch =
        selectedCategory === "all" || product.category_id === selectedCategory;

      const queryMatch =
        !normalizedQuery ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        (product.sku || "").toLowerCase().includes(normalizedQuery) ||
        (product.internal_code || "").toLowerCase().includes(normalizedQuery);

      return categoryMatch && queryMatch;
    });
  }, [products, selectedCategory, query]);

  function getImage(productId: string) {
    return (
      images.find(
        (image) =>
          image.product_id === productId &&
          image.catalog_slot === "front"
      ) ||
      images.find((image) => image.product_id === productId) ||
      null
    );
  }

  function formatPrice(value: number | null) {
    if (value == null) return "Preço não informado";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
  }

  function priceToNumber(value: string) {
    const parsed = Number(value.trim().replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getCatalogPrice(product: Product) {
    const value = customPrices[product.id];
    return value !== undefined && value.trim() !== "" ? priceToNumber(value) : product.sale_price;
  }

  function updateCustomPrice(productId: string, value: string) {
    setCustomPrices((current) => ({ ...current, [productId]: value.replace(/[^0-9,.-]/g, "") }));
  }

  function resetCustomPrice(productId: string) {
    setCustomPrices((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  function toggleProduct(productId: string) {
    setSelectedProducts((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  }

  function selectFiltered() {
    const ids = filteredProducts.map((product) => product.id);

    setSelectedProducts((current) =>
      Array.from(new Set([...current, ...ids]))
    );
  }

  function clearSelection() {
    setSelectedProducts([]);
    setCustomPrices({});
  }

  function getCatalogResponses(catalogId: string) {
    return catalogResponses.filter((response) => response.catalog_id === catalogId);
  }

  function getLatestCatalogResponse(catalogId: string) {
    return getCatalogResponses(catalogId)[0] || null;
  }

  function getNewResponseCount(catalogId: string) {
    return getCatalogResponses(catalogId).filter(
      (response) => response.status === "submitted"
    ).length;
  }

  function isCatalogExpired(validUntil: string | null) {
    if (!validUntil) return false;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}` > validUntil;
  }

  async function handleCreateCatalog() {
    if (!name.trim()) {
      setFeedback("Informe um nome para o catálogo.");
      return;
    }

    if (selectedProducts.length === 0) {
      setFeedback("Selecione pelo menos um produto.");
      return;
    }

    if (shareAfterCreate && !validUntil) {
      setFeedback("Informe a validade para enviar o catálogo ao cliente.");
      return;
    }

    setCreating(true);
    setFeedback("");

    try {
      const { data: catalog, error: catalogError } = await supabase
        .from("catalogs")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          cover_title: coverTitle.trim() || "Catálogo de Produtos",
          cover_subtitle: coverSubtitle.trim() || "Camel Paper",
          client_name: clientName.trim() || null,
          client_company: clientCompany.trim() || null,
          client_contact: clientContact.trim() || null,
          valid_until: validUntil || null,
          share_enabled: shareAfterCreate,
          sent_at: shareAfterCreate ? new Date().toISOString() : null,
          status: "draft",
          active: true,
        })
        .select("id")
        .single();

      if (catalogError || !catalog) {
        throw new Error(catalogError?.message || "Não foi possível criar o catálogo.");
      }

      const rows = selectedProducts.map((productId, index) => {
        const typedPrice = customPrices[productId];
        return {
          catalog_id: catalog.id,
          product_id: productId,
          position: index,
          custom_price:
            typedPrice !== undefined && typedPrice.trim() !== ""
              ? priceToNumber(typedPrice)
              : null,
        };
      });

      const { error: productsError } = await supabase
        .from("catalog_products")
        .insert(rows);

      if (productsError) {
        throw new Error(productsError.message);
      }

      router.push(`/catalogos/${catalog.id}`);
    } catch (error) {
      console.error("Erro ao criar catálogo:", error);

      setFeedback(
        error instanceof Error
          ? `Erro: ${error.message}`
          : "Erro inesperado ao criar catálogo."
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="page-shell">
      <AppSidebar />

      <section className="content">
        <header className="page-header">
          <div>
            <span className="eyebrow">MÓDULO DE CATÁLOGOS</span>
            <h1>Criar catálogo</h1>
            <p>
              Selecione produtos e monte uma apresentação comercial pronta para
              visualização e impressão.
            </p>
          </div>

          <Link href="/catalogo" className="seller-button">
            Abrir visão do vendedor →
          </Link>
        </header>

        <div className="layout-grid">
          <div className="left-column">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span>ETAPA 1</span>
                  <h2>Informações do catálogo</h2>
                </div>
              </div>

              <div className="field-grid">
                <label>
                  <span>Nome interno</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ex.: Catálogo Geral 2026"
                  />
                </label>

                <label>
                  <span>Título da capa</span>
                  <input
                    value={coverTitle}
                    onChange={(event) => setCoverTitle(event.target.value)}
                  />
                </label>

                <label>
                  <span>Subtítulo da capa</span>
                  <input
                    value={coverSubtitle}
                    onChange={(event) => setCoverSubtitle(event.target.value)}
                  />
                </label>

                <label className="full">
                  <span>Descrição interna</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                  />
                </label>
              </div>
            </section>

            <section className="panel client-panel">
              <div className="panel-heading">
                <div>
                  <span>ETAPA 2</span>
                  <h2>Cliente e validade</h2>
                  <p>
                    Personalize este catálogo para um cliente específico. A validade
                    será usada também no futuro link público de seleção.
                  </p>
                </div>
              </div>

              <div className="field-grid client-grid">
                <label>
                  <span>Nome do cliente</span>
                  <input
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    placeholder="Ex.: João Silva"
                  />
                </label>

                <label>
                  <span>Empresa</span>
                  <input
                    value={clientCompany}
                    onChange={(event) => setClientCompany(event.target.value)}
                    placeholder="Ex.: Papelaria ABC"
                  />
                </label>

                <label>
                  <span>Contato</span>
                  <input
                    value={clientContact}
                    onChange={(event) => setClientContact(event.target.value)}
                    placeholder="WhatsApp ou e-mail"
                  />
                </label>

                <label>
                  <span>Validade das condições</span>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(event) => setValidUntil(event.target.value)}
                  />
                </label>
              </div>

              <label className={`share-option ${shareAfterCreate ? "enabled" : ""}`}>
                <input
                  type="checkbox"
                  checked={shareAfterCreate}
                  onChange={(event) => setShareAfterCreate(event.target.checked)}
                />
                <span className="share-check">{shareAfterCreate ? "✓" : ""}</span>
                <div>
                  <strong>Preparar para enviar ao cliente</strong>
                  <small>
                    Ativa o link exclusivo após criar o catálogo. Na próxima etapa
                    criaremos a página pública onde o cliente selecionará produtos e quantidades.
                  </small>
                </div>
              </label>
            </section>

            <section className="panel">
              <div className="panel-heading selection-heading">
                <div>
                  <span>ETAPA 3</span>
                  <h2>Selecionar produtos</h2>
                  <p>
                    Apenas produtos ativos entram na seleção. As fotos do catálogo
                    usam as imagens profissionais aprovadas.
                  </p>
                </div>

                <strong>{selectedProducts.length} selecionado(s)</strong>
              </div>

              <div className="toolbar">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar produto, SKU ou código..."
                />

                <button type="button" onClick={selectFiltered}>
                  Selecionar filtrados
                </button>

                <button type="button" className="ghost" onClick={clearSelection}>
                  Limpar
                </button>
              </div>

              <div className="categories">
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

              {loading ? (
                <div className="state-box">Carregando produtos...</div>
              ) : (
                <div className="products-grid">
                  {filteredProducts.map((product) => {
                    const image = getImage(product.id);
                    const checked = selectedProducts.includes(product.id);

                    return (
                      <div
                        className={`product-card ${checked ? "selected" : ""}`}
                        key={product.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleProduct(product.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleProduct(product.id);
                          }
                        }}
                      >
                        <div className="product-image">
                          {image ? (
                            <img src={image.image_url} alt={product.name} />
                          ) : (
                            <div className="no-image">
                              <span>CP</span>
                              <small>Sem foto profissional aprovada</small>
                            </div>
                          )}
                          <span className="check">{checked ? "✓" : ""}</span>
                        </div>

                        <div className="product-copy">
                          <strong>{product.name}</strong>
                          <span>{product.sku || "SKU não informado"}</span>

                          <div className="default-price">
                            <small>Preço padrão</small>
                            <b>{formatPrice(product.sale_price)}</b>
                          </div>

                          {checked && (
                            <div
                              className="catalog-price-box"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <label>
                                <span>Preço neste catálogo</span>
                                <div className="price-input-wrap">
                                  <span>R$</span>
                                  <input
                                    inputMode="decimal"
                                    value={customPrices[product.id] ?? ""}
                                    onChange={(event) => updateCustomPrice(product.id, event.target.value)}
                                    placeholder={
                                      product.sale_price != null
                                        ? Number(product.sale_price).toFixed(2).replace(".", ",")
                                        : "0,00"
                                    }
                                  />
                                </div>
                              </label>
                              <div className="catalog-price-footer">
                                <small>Final: {formatPrice(getCatalogPrice(product))}</small>
                                {customPrices[product.id]?.trim() && (
                                  <button type="button" onClick={() => resetCustomPrice(product.id)}>
                                    Usar padrão
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="right-column">
            <section className="summary-card">
              <span className="summary-eyebrow">RESUMO</span>
              <h2>{coverTitle || "Catálogo de Produtos"}</h2>
              <p>{coverSubtitle || "Camel Paper"}</p>

              {(clientName || clientCompany || validUntil) && (
                <div className="client-summary">
                  <span>CATÁLOGO PERSONALIZADO</span>
                  <strong>{clientCompany || clientName || "Cliente"}</strong>
                  {clientCompany && clientName && <small>A/C {clientName}</small>}
                  {clientContact && <small>{clientContact}</small>}
                  {validUntil && (
                    <small>
                      Condições válidas até{" "}
                      {new Date(`${validUntil}T12:00:00`).toLocaleDateString("pt-BR")}
                    </small>
                  )}
                </div>
              )}

              <div className="summary-stats">
                <div>
                  <strong>{selectedProducts.length}</strong>
                  <span>Produtos</span>
                </div>
                <div>
                  <strong>{categories.length}</strong>
                  <span>Categorias disponíveis</span>
                </div>
              </div>

              {selectedProducts.length > 0 && (
                <div className="price-summary">
                  <span>Total pelos preços deste catálogo</span>
                  <strong>
                    {formatPrice(
                      selectedProducts.reduce((total, productId) => {
                        const product = products.find((item) => item.id === productId);
                        return product ? total + Number(getCatalogPrice(product) || 0) : total;
                      }, 0)
                    )}
                  </strong>
                  <small>Os preços personalizados ficam salvos somente neste catálogo.</small>
                </div>
              )}

              <button
                type="button"
                className="create-button"
                onClick={handleCreateCatalog}
                disabled={creating}
              >
                {creating
                  ? "Criando catálogo..."
                  : shareAfterCreate
                    ? "Criar catálogo para cliente →"
                    : "Criar e visualizar catálogo →"}
              </button>

              {feedback && <div className="feedback">{feedback}</div>}
            </section>

            <section className="existing-card management-shortcut">
              <div className="existing-heading">
                <div>
                  <strong>Central de catálogos</strong>
                  <small>Acompanhe respostas, validade e status dos catálogos enviados.</small>
                </div>
                <span>
                  {catalogResponses.filter((response) => response.status === "submitted").length}
                </span>
              </div>

              <div className="shortcut-stats">
                <div>
                  <strong>{catalogs.length}</strong>
                  <span>Catálogos</span>
                </div>
                <div>
                  <strong>
                    {catalogResponses.filter((response) => response.status === "submitted").length}
                  </strong>
                  <span>Novas respostas</span>
                </div>
              </div>

              <Link href="/catalogos/gerenciar" className="manage-button">
                Abrir central de catálogos →
              </Link>
            </section>
          </aside>
        </div>
      </section>

      <style jsx>{`
        .page-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 250px 1fr;
          background: #f7f4f1;
          color: #2b1f1b;
        }

        .sidebar {
          position: sticky;
          top: 0;
          height: 100vh;
          box-sizing: border-box;
          padding: 28px 22px 24px;
          border-right: 1px solid #e5ddd8;
          background: #fff;
          display: flex;
          flex-direction: column;
        }

        :global(.brand-link) {
          display: block;
          height: 82px;
          margin-bottom: 22px;
        }

        :global(.brand-link img) {
          width: 170px;
          height: 70px;
          object-fit: contain;
          object-position: left center;
        }

        nav {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        :global(.nav-link) {
          min-height: 44px;
          padding: 0 13px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #685b54;
          text-decoration: none;
          font-size: 12px;
          font-weight: 800;
        }

        :global(.nav-link.active) {
          background: #fff1e6;
          color: #8a2a18;
        }

        :global(.nav-link.muted) {
          opacity: 0.62;
        }

        .admin {
          margin-top: auto;
          padding-top: 18px;
          border-top: 1px solid #eee7e2;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .account-footer {
          flex-direction: column;
          align-items: stretch;
          gap: 11px;
        }

        .account-user {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .sidebar-logout {
          width: 100%;
          min-height: 36px;
          border: 1px solid #eadbd4;
          border-radius: 9px;
          background: #fff8f4;
          color: #8a2a18;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          transition: background 0.18s ease, border-color 0.18s ease;
        }

        .sidebar-logout:hover:not(:disabled) {
          background: #fff0e8;
          border-color: #e3c2b5;
        }

        .sidebar-logout:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .sidebar-logout span {
          font-size: 13px;
        }

        .avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #8a2a18;
          color: #fff;
          font-size: 10px;
          font-weight: 900;
        }

        .admin div:last-child {
          display: flex;
          flex-direction: column;
        }

        .admin strong {
          font-size: 11px;
        }

        .admin small {
          color: #948982;
          font-size: 9px;
        }

        .content {
          padding: 38px 34px 70px;
        }

        .page-header {
          max-width: 1320px;
          margin: 0 auto 24px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
        }

        .eyebrow,
        .panel-heading span,
        .summary-eyebrow {
          color: #ef7a00;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.7px;
        }

        h1 {
          margin: 6px 0 0;
          font-size: 38px;
          letter-spacing: -1.3px;
        }

        .page-header p {
          margin: 8px 0 0;
          color: #7d716b;
          font-size: 12px;
        }

        :global(.seller-button) {
          min-height: 42px;
          border-radius: 10px;
          padding: 0 14px;
          border: 1px solid #e0d5ce;
          background: #fff;
          color: #8a2a18;
          display: inline-flex;
          align-items: center;
          text-decoration: none;
          font-size: 10px;
          font-weight: 900;
        }

        .layout-grid {
          max-width: 1320px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 18px;
          align-items: start;
        }

        .left-column {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .panel,
        .summary-card,
        .existing-card {
          border: 1px solid #e6ded8;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 8px 26px rgba(65, 44, 34, 0.035);
        }

        .panel {
          padding: 22px;
        }

        .panel-heading {
          padding-bottom: 16px;
          margin-bottom: 17px;
          border-bottom: 1px solid #eee7e2;
        }

        .panel-heading h2,
        .summary-card h2 {
          margin: 5px 0 0;
          font-size: 18px;
        }

        .panel-heading p {
          margin: 6px 0 0;
          color: #847871;
          font-size: 10px;
          line-height: 1.5;
        }

        .selection-heading {
          display: flex;
          justify-content: space-between;
          gap: 20px;
        }

        .selection-heading > strong {
          flex: 0 0 auto;
          color: #8a2a18;
          font-size: 10px;
        }

        .field-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .field-grid label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field-grid label.full {
          grid-column: 1 / -1;
        }

        .field-grid span {
          color: #675b55;
          font-size: 10px;
          font-weight: 800;
        }

        input,
        textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #ddd4cf;
          border-radius: 9px;
          background: #fff;
          color: #2f2420;
          padding: 11px 12px;
          outline: none;
          font-family: inherit;
          font-size: 11px;
        }

        input:focus,
        textarea:focus {
          border-color: #ef7a00;
          box-shadow: 0 0 0 3px rgba(239, 122, 0, 0.08);
        }

        textarea {
          resize: vertical;
        }

        .client-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .share-option {
          margin-top: 15px;
          border: 1px solid #e6ddd8;
          border-radius: 12px;
          background: #fcfaf8;
          padding: 13px;
          display: grid;
          grid-template-columns: auto auto 1fr;
          gap: 10px;
          align-items: center;
          cursor: pointer;
        }

        .share-option.enabled {
          border-color: #efb27a;
          background: #fff6ed;
        }

        .share-option > input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
          width: 1px;
          height: 1px;
        }

        .share-check {
          width: 25px;
          height: 25px;
          border-radius: 7px;
          border: 1px solid #d8cec8;
          background: #fff;
          display: grid;
          place-items: center;
          color: #fff;
          font-size: 11px;
          font-weight: 900;
        }

        .share-option.enabled .share-check {
          border-color: #ef7a00;
          background: #ef7a00;
        }

        .share-option div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .share-option strong {
          color: #4a372f;
          font-size: 10px;
        }

        .share-option small {
          color: #897b74;
          font-size: 8px;
          line-height: 1.45;
        }

        .client-summary {
          margin-top: 14px;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid #f0d0b4;
          background: #fff8f2;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .client-summary > span {
          color: #ef7a00;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .client-summary strong {
          color: #8a2a18;
          font-size: 12px;
        }

        .client-summary small {
          color: #786a63;
          font-size: 8px;
        }

        .toolbar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 8px;
        }

        .toolbar button {
          min-height: 39px;
          border-radius: 9px;
          padding: 0 12px;
          border: 1px solid #ef7a00;
          background: #ef7a00;
          color: #fff;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .toolbar button.ghost {
          border-color: #ddd3cd;
          background: #fff;
          color: #73665f;
        }

        .categories {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin: 14px 0;
        }

        .categories button {
          min-height: 32px;
          border-radius: 999px;
          padding: 0 11px;
          border: 1px solid #e1d7d1;
          background: #fff;
          color: #776a63;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .categories button.active {
          border-color: #ef7a00;
          background: #ef7a00;
          color: #fff;
        }

        .products-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .product-card {
          position: relative;
          overflow: hidden;
          border: 1px solid #e6ddd8;
          border-radius: 12px;
          background: #fff;
          padding: 0;
          text-align: left;
          cursor: pointer;
        }

        .product-card.selected {
          border: 2px solid #ef7a00;
          box-shadow: 0 7px 18px rgba(239, 122, 0, 0.1);
        }

        .product-image {
          position: relative;
          height: 160px;
          border-bottom: 1px solid #eee7e2;
          background: #fff;
        }

        .product-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
          padding: 10px;
          box-sizing: border-box;
        }

        .check {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #fff;
          border: 1px solid #ddd4ce;
          color: #fff;
          font-size: 12px;
          font-weight: 900;
        }

        .selected .check {
          border-color: #ef7a00;
          background: #ef7a00;
        }

        .no-image {
          height: 100%;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 6px;
          color: #948983;
          text-align: center;
        }

        .no-image span {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: #fff1e6;
          color: #8a2a18;
          font-size: 9px;
          font-weight: 900;
        }

        .no-image small {
          max-width: 120px;
          font-size: 8px;
        }

        .product-copy {
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .product-copy strong {
          color: #382a24;
          font-size: 10px;
          line-height: 1.35;
        }

        .product-copy span {
          color: #9a8f88;
          font-size: 8px;
        }


        .default-price { margin-top: 6px; padding-top: 7px; border-top: 1px solid #f0e9e4; display:flex; justify-content:space-between; gap:8px; align-items:center; }
        .default-price small { color:#9a8f88; font-size:8px; }
        .default-price b { color:#8a2a18; font-size:10px; }
        .catalog-price-box { margin-top:9px; padding:9px; border:1px solid #f0c6a7; border-radius:9px; background:#fff8f2; cursor:default; }
        .catalog-price-box label { display:flex; flex-direction:column; gap:5px; }
        .catalog-price-box label > span { color:#8a2a18; font-size:8px; font-weight:900; }
        .price-input-wrap { display:grid; grid-template-columns:auto 1fr; align-items:center; overflow:hidden; border:1px solid #e5c5ae; border-radius:8px; background:#fff; }
        .price-input-wrap > span { padding-left:9px; color:#8a2a18; font-size:9px; font-weight:900; }
        .price-input-wrap input { min-width:0; border:0; box-shadow:none; padding:8px 9px 8px 5px; font-size:10px; font-weight:800; }
        .price-input-wrap input:focus { border:0; box-shadow:none; }
        .catalog-price-footer { margin-top:7px; display:flex; align-items:center; justify-content:space-between; gap:6px; }
        .catalog-price-footer small { color:#6f625b; font-size:7px; font-weight:800; }
        .catalog-price-footer button { border:0; background:transparent; color:#ef7a00; padding:0; font-size:7px; font-weight:900; cursor:pointer; }
        .price-summary { margin:-7px 0 16px; padding:11px; border:1px solid #f0c6a7; border-radius:10px; background:#fff8f2; display:flex; flex-direction:column; gap:4px; }
        .price-summary span { color:#766860; font-size:8px; font-weight:800; }
        .price-summary strong { color:#8a2a18; font-size:19px; }
        .price-summary small { color:#9a8f88; font-size:7px; line-height:1.4; }

        .right-column {
          position: sticky;
          top: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .summary-card,
        .existing-card {
          padding: 18px;
        }

        .summary-card > p {
          margin: 5px 0 0;
          color: #857970;
          font-size: 10px;
        }

        .summary-stats {
          margin: 18px 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .summary-stats div {
          border: 1px solid #eadfd9;
          border-radius: 10px;
          background: #fcfaf8;
          padding: 11px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .summary-stats strong {
          font-size: 18px;
          color: #8a2a18;
        }

        .summary-stats span {
          color: #958a83;
          font-size: 8px;
        }

        .create-button {
          width: 100%;
          min-height: 46px;
          border: 0;
          border-radius: 10px;
          background: #8a2a18;
          color: #fff;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .create-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .feedback {
          margin-top: 10px;
          border-radius: 9px;
          padding: 9px 10px;
          background: #fff3e8;
          color: #8a2a18;
          font-size: 9px;
          line-height: 1.4;
        }

        .existing-card {
          scroll-margin-top: 24px;
        }

        html {
          scroll-behavior: smooth;
        }

        .tracking-card {
          padding: 18px;
        }

        .tracking-card .existing-heading > div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .tracking-card .existing-heading small {
          color: #91857f;
          font-size: 8px;
          line-height: 1.4;
        }

        .tracking-overview {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 7px;
          margin: 12px 0;
        }

        .tracking-overview > div {
          padding: 9px;
          border-radius: 9px;
          border: 1px solid #eadfd9;
          background: #fcfaf8;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .tracking-overview span {
          color: #9b8f88;
          font-size: 6px;
          font-weight: 900;
          letter-spacing: .4px;
        }

        .tracking-overview strong {
          color: #8a2a18;
          font-size: 16px;
        }

        .tracking-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        :global(.tracking-row) {
          border: 1px solid #ebe2dc;
          border-radius: 10px;
          padding: 10px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          text-decoration: none;
          background: #fff;
        }

        :global(.tracking-row.has-new) {
          border-color: #efbf97;
          background: #fffaf5;
          box-shadow: 0 5px 14px rgba(239,122,0,.06);
        }

        .tracking-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .tracking-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }

        .tracking-title-row strong {
          color: #4b3931;
          font-size: 9px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tracking-new-badge {
          flex: 0 0 auto;
          padding: 3px 5px;
          border-radius: 999px;
          background: #ef7a00;
          color: #fff;
          font-size: 6px;
          font-weight: 900;
        }

        .tracking-main > small {
          color: #8f827b;
          font-size: 7px;
        }

        .tracking-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 8px;
          margin-top: 2px;
        }

        .tracking-meta span {
          color: #a0938c;
          font-size: 6px;
        }

        .tracking-value {
          min-width: 88px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: center;
          gap: 2px;
        }

        .tracking-value small {
          color: #a0938c;
          font-size: 6px;
          font-weight: 900;
        }

        .tracking-value strong {
          color: #8a2a18;
          font-size: 10px;
        }

        .tracking-value span {
          color: #a0938c;
          font-size: 6px;
        }

        .management-shortcut {
          padding: 18px;
        }

        .management-shortcut .existing-heading > div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .management-shortcut .existing-heading small {
          color: #91857f;
          font-size: 8px;
          line-height: 1.4;
        }

        .shortcut-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin: 12px 0;
        }

        .shortcut-stats > div {
          padding: 11px;
          border: 1px solid #eadfd9;
          border-radius: 10px;
          background: #fcfaf8;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .shortcut-stats strong {
          color: #8a2a18;
          font-size: 18px;
        }

        .shortcut-stats span {
          color: #958a83;
          font-size: 8px;
        }

        :global(.manage-button) {
          min-height: 42px;
          border-radius: 9px;
          background: #8a2a18;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          font-size: 9px;
          font-weight: 900;
        }

        .existing-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .existing-heading strong {
          font-size: 11px;
        }

        .existing-heading span {
          min-width: 23px;
          height: 23px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: #fff1e6;
          color: #8a2a18;
          font-size: 8px;
          font-weight: 900;
        }

        .existing-card > p {
          margin: 0;
          color: #91857f;
          font-size: 9px;
        }

        .existing-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        :global(.catalog-row) {
          border: 1px solid #ebe2dc;
          border-radius: 9px;
          padding: 9px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          text-decoration: none;
        }

        :global(.catalog-row div) {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        :global(.catalog-row strong) {
          color: #4b3931;
          font-size: 9px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        :global(.catalog-row small) {
          color: #9c918a;
          font-size: 8px;
        }

        :global(.catalog-row > span) {
          flex: 0 0 auto;
          color: #8a2a18;
          font-size: 8px;
          font-weight: 800;
        }

        .state-box {
          min-height: 180px;
          display: grid;
          place-items: center;
          color: #8e827b;
          font-size: 10px;
        }

        @media (max-width: 1120px) {
          .page-shell {
            grid-template-columns: 1fr;
          }

          .sidebar {
            display: none;
          }

          .products-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 820px) {
          .content {
            padding: 26px 16px 50px;
          }

          .layout-grid {
            grid-template-columns: 1fr;
          }

          .right-column {
            position: static;
          }

          .field-grid,
          .products-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 560px) {
          .page-header {
            flex-direction: column;
          }

          .field-grid,
          .client-grid,
          .products-grid {
            grid-template-columns: 1fr;
          }

          .toolbar {
            grid-template-columns: 1fr;
          }

          .tracking-overview {
            grid-template-columns: 1fr;
          }

          :global(.tracking-row) {
            grid-template-columns: 1fr;
          }

          .tracking-value {
            align-items: flex-start;
          }
        }
      `}</style>
    </main>
  );
}
