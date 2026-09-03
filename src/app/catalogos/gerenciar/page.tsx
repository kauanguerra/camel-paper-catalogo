"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Catalog = {
  id: string;
  name: string;
  description: string | null;
  cover_title: string | null;
  cover_subtitle: string | null;
  status: "draft" | "published" | "archived";
  created_at: string;
  client_name: string | null;
  client_company: string | null;
  client_contact: string | null;
  valid_until: string | null;
  share_enabled: boolean;
  share_token: string | null;
};

type CatalogResponse = {
  id: string;
  catalog_id: string;
  customer_name: string | null;
  customer_company: string | null;
  total_amount: number;
  status: "submitted" | "reviewed" | "archived";
  submitted_at: string;
};

type Filter = "all" | "new" | "active" | "expired";

export default function GerenciarCatalogosPage() {
  const router = useRouter();
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [responses, setResponses] = useState<CatalogResponse[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [actionCatalogId, setActionCatalogId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState("");
  const [duplicateSource, setDuplicateSource] = useState<Catalog | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicateClientName, setDuplicateClientName] = useState("");
  const [duplicateCompany, setDuplicateCompany] = useState("");
  const [duplicateContact, setDuplicateContact] = useState("");
  const [duplicateValidUntil, setDuplicateValidUntil] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateFeedback, setDuplicateFeedback] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      const [catalogResult, responseResult] = await Promise.all([
        supabase
          .from("catalogs")
          .select(
            "id, name, description, cover_title, cover_subtitle, status, created_at, client_name, client_company, client_contact, valid_until, share_enabled, share_token"
          )
          .eq("active", true)
          .order("created_at", { ascending: false }),

        supabase
          .from("catalog_responses")
          .select(
            "id, catalog_id, customer_name, customer_company, total_amount, status, submitted_at"
          )
          .order("submitted_at", { ascending: false }),
      ]);

      if (!catalogResult.error) {
        setCatalogs((catalogResult.data || []) as Catalog[]);
      }

      if (!responseResult.error) {
        setResponses((responseResult.data || []) as CatalogResponse[]);
      }

      setLoading(false);
    }

    loadData();
  }, []);

  function localDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function isExpired(catalog: Catalog) {
    return Boolean(catalog.valid_until && localDateString() > catalog.valid_until);
  }

  function formatDate(value: string | null) {
    if (!value) return "Sem validade";
    return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
  }

  function formatPrice(value: number | null | undefined) {
    if (value == null) return "—";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(value));
  }

  function catalogResponses(catalogId: string) {
    return responses.filter((response) => response.catalog_id === catalogId);
  }

  function latestResponse(catalogId: string) {
    return catalogResponses(catalogId)[0] || null;
  }

  function newResponseCount(catalogId: string) {
    return catalogResponses(catalogId).filter(
      (response) => response.status === "submitted"
    ).length;
  }

  function getPublicCatalogUrl(catalog: Catalog) {
    if (!catalog.share_token || typeof window === "undefined") return "";
    return `${window.location.origin}/catalogo-cliente/${catalog.share_token}`;
  }

  async function copyCatalogLink(catalog: Catalog) {
    if (!catalog.share_enabled || !catalog.share_token) {
      setActionFeedback("Ative o link desse catálogo antes de copiá-lo.");
      return;
    }

    const url = getPublicCatalogUrl(catalog);

    try {
      await navigator.clipboard.writeText(url);
      setActionFeedback(`Link de "${catalog.name}" copiado.`);
    } catch {
      setActionFeedback(url);
    }
  }

  async function toggleCatalogShare(catalog: Catalog) {
    if (!catalog.share_enabled && !catalog.valid_until) {
      setActionFeedback(
        `Defina a validade de "${catalog.name}" antes de ativar o link.`
      );
      return;
    }

    setActionCatalogId(catalog.id);
    setActionFeedback("");

    const nextEnabled = !catalog.share_enabled;

    const { error } = await supabase
      .from("catalogs")
      .update({
        share_enabled: nextEnabled,
        sent_at: nextEnabled ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", catalog.id);

    if (error) {
      setActionFeedback(`Erro: ${error.message}`);
      setActionCatalogId(null);
      return;
    }

    setCatalogs((current) =>
      current.map((item) =>
        item.id === catalog.id
          ? { ...item, share_enabled: nextEnabled }
          : item
      )
    );

    setActionFeedback(
      nextEnabled
        ? `Link de "${catalog.name}" ativado.`
        : `Link de "${catalog.name}" desativado.`
    );
    setActionCatalogId(null);
  }

  function openDuplicateModal(catalog: Catalog) {
    setDuplicateSource(catalog);
    setDuplicateName(`${catalog.name} - Cópia`);
    setDuplicateClientName("");
    setDuplicateCompany("");
    setDuplicateContact("");
    setDuplicateValidUntil("");
    setDuplicateFeedback("");
  }

  function closeDuplicateModal() {
    if (duplicating) return;
    setDuplicateSource(null);
    setDuplicateFeedback("");
  }

  async function duplicateCatalog() {
    if (!duplicateSource) return;

    if (!duplicateName.trim()) {
      setDuplicateFeedback("Informe um nome para o novo catálogo.");
      return;
    }

    if (!duplicateValidUntil) {
      setDuplicateFeedback("Informe a validade do novo catálogo.");
      return;
    }

    setDuplicating(true);
    setDuplicateFeedback("");

    try {
      const { data: sourceProducts, error: sourceProductsError } = await supabase
        .from("catalog_products")
        .select("product_id, position, custom_price")
        .eq("catalog_id", duplicateSource.id)
        .order("position");

      if (sourceProductsError) {
        throw new Error(sourceProductsError.message);
      }

      const { data: newCatalog, error: catalogError } = await supabase
        .from("catalogs")
        .insert({
          name: duplicateName.trim(),
          description: duplicateSource.description,
          cover_title: duplicateSource.cover_title,
          cover_subtitle: duplicateSource.cover_subtitle,
          client_name: duplicateClientName.trim() || null,
          client_company: duplicateCompany.trim() || null,
          client_contact: duplicateContact.trim() || null,
          valid_until: duplicateValidUntil,
          share_enabled: false,
          sent_at: null,
          status: "draft",
          active: true,
        })
        .select(
          "id, name, description, cover_title, cover_subtitle, status, created_at, client_name, client_company, client_contact, valid_until, share_enabled, share_token"
        )
        .single();

      if (catalogError || !newCatalog) {
        throw new Error(catalogError?.message || "Não foi possível duplicar o catálogo.");
      }

      if ((sourceProducts || []).length > 0) {
        const copiedProducts = (sourceProducts || []).map((item) => ({
          catalog_id: newCatalog.id,
          product_id: item.product_id,
          position: item.position,
          custom_price: item.custom_price,
        }));

        const { error: insertProductsError } = await supabase
          .from("catalog_products")
          .insert(copiedProducts);

        if (insertProductsError) {
          throw new Error(insertProductsError.message);
        }
      }

      setCatalogs((current) => [newCatalog as Catalog, ...current]);
      setDuplicateSource(null);
      setActionFeedback(
        `Catálogo duplicado para ${
          duplicateCompany.trim() || duplicateClientName.trim() || "o novo cliente"
        }.`
      );

      router.push(`/catalogos/${newCatalog.id}`);
    } catch (error) {
      setDuplicateFeedback(
        error instanceof Error
          ? error.message
          : "Ocorreu um erro ao duplicar o catálogo."
      );
    } finally {
      setDuplicating(false);
    }
  }

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const filteredCatalogs = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return catalogs.filter((catalog) => {
      const newCount = newResponseCount(catalog.id);
      const expired = isExpired(catalog);

      const filterMatch =
        filter === "all" ||
        (filter === "new" && newCount > 0) ||
        (filter === "active" && catalog.share_enabled) ||
        (filter === "expired" && expired);

      const text = [
        catalog.name,
        catalog.client_name || "",
        catalog.client_company || "",
        catalog.client_contact || "",
      ]
        .join(" ")
        .toLowerCase();

      return filterMatch && (!normalized || text.includes(normalized));
    });
  }, [catalogs, responses, query, filter]);

  const totalNew = responses.filter((response) => response.status === "submitted").length;
  const activeLinks = catalogs.filter((catalog) => catalog.share_enabled).length;
  const expiredCount = catalogs.filter((catalog) => isExpired(catalog)).length;

  return (
    <main className="page-shell">
      <aside className="sidebar">
        <Link href="/" className="brand-link">
          <Image
            src="/brand/camel-paper-logo.png"
            alt="Camel Paper"
            width={170}
            height={70}
            priority
          />
        </Link>

        <nav>
          <Link href="/" className="nav-link">
            ▦ <span>Produtos</span>
          </Link>
          <span className="nav-link muted">
            ▤ <span>Categorias</span>
          </span>
          <Link href="/catalogos" className="nav-link">
            ＋ <span>Criar catálogo</span>
          </Link>
          <Link href="/catalogos/gerenciar" className="nav-link active">
            ◫ <span>Central de catálogos</span>
          </Link>
          <Link href="/catalogo" className="nav-link">
            ◉ <span>Catálogo de vendedor</span>
          </Link>
        </nav>

        <div className="admin account-footer">
          <div className="account-user">
            <div className="avatar">KG</div>
            <div>
              <strong>Administrador</strong>
              <small>Camel Paper</small>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-logout"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <span>↪</span>
            {signingOut ? "Saindo..." : "Sair da conta"}
          </button>
        </div>
      </aside>

      <section className="content">
        <header className="page-header">
          <div>
            <span className="eyebrow">GESTÃO COMERCIAL</span>
            <h1>Central de catálogos</h1>
            <p>
              Acompanhe catálogos enviados, respostas dos clientes, validade e valores.
            </p>
          </div>

          <Link href="/catalogos" className="new-button">
            + Criar novo catálogo
          </Link>
        </header>

        <section className="stats-grid">
          <div>
            <span>CATÁLOGOS</span>
            <strong>{catalogs.length}</strong>
            <small>ativos no sistema</small>
          </div>
          <div className={totalNew > 0 ? "highlight" : ""}>
            <span>RESPOSTAS NOVAS</span>
            <strong>{totalNew}</strong>
            <small>aguardando visualização</small>
          </div>
          <div>
            <span>LINKS ATIVOS</span>
            <strong>{activeLinks}</strong>
            <small>disponíveis para clientes</small>
          </div>
          <div>
            <span>EXPIRADOS</span>
            <strong>{expiredCount}</strong>
            <small>fora da validade</small>
          </div>
        </section>

        <section className="management-card">
          <div className="management-toolbar">
            <div className="search-wrap">
              <span>⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar catálogo, cliente, empresa ou contato..."
              />
            </div>

            <div className="filters">
              <button
                type="button"
                className={filter === "all" ? "active" : ""}
                onClick={() => setFilter("all")}
              >
                Todos
              </button>
              <button
                type="button"
                className={filter === "new" ? "active" : ""}
                onClick={() => setFilter("new")}
              >
                Com resposta nova
              </button>
              <button
                type="button"
                className={filter === "active" ? "active" : ""}
                onClick={() => setFilter("active")}
              >
                Link ativo
              </button>
              <button
                type="button"
                className={filter === "expired" ? "active" : ""}
                onClick={() => setFilter("expired")}
              >
                Expirados
              </button>
            </div>
          </div>

          {actionFeedback && (
            <div className="action-feedback">
              <span>{actionFeedback}</span>
              <button type="button" onClick={() => setActionFeedback("")}>
                ×
              </button>
            </div>
          )}

          {loading ? (
            <div className="empty-state">Carregando catálogos...</div>
          ) : filteredCatalogs.length === 0 ? (
            <div className="empty-state">
              Nenhum catálogo encontrado com esses filtros.
            </div>
          ) : (
            <div className="table">
              <div className="table-head">
                <span>Catálogo / cliente</span>
                <span>Validade</span>
                <span>Status</span>
                <span>Respostas</span>
                <span>Última seleção</span>
                <span>Ações</span>
              </div>

              {filteredCatalogs.map((catalog) => {
                const latest = latestResponse(catalog.id);
                const newCount = newResponseCount(catalog.id);
                const expired = isExpired(catalog);
                const responseCount = catalogResponses(catalog.id).length;

                return (
                  <div
                    className={`table-row ${newCount > 0 ? "has-new" : ""}`}
                    key={catalog.id}
                  >
                    <div className="catalog-cell">
                      <div className="catalog-icon">CP</div>
                      <div>
                        <div className="catalog-name-row">
                          <strong>{catalog.name}</strong>
                          {newCount > 0 && (
                            <span className="new-badge">
                              {newCount} nova{newCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <span>
                          {catalog.client_company ||
                            catalog.client_name ||
                            "Sem cliente definido"}
                        </span>
                        {catalog.client_company && catalog.client_name && (
                          <small>A/C {catalog.client_name}</small>
                        )}
                      </div>
                    </div>

                    <div className="date-cell">
                      <strong>{formatDate(catalog.valid_until)}</strong>
                      <small className={expired ? "danger" : ""}>
                        {expired
                          ? "Expirado"
                          : catalog.valid_until
                            ? "Dentro da validade"
                            : "Não definida"}
                      </small>
                    </div>

                    <div className="status-cell">
                      <span className={`status-pill ${catalog.share_enabled ? "active" : ""}`}>
                        <i />
                        {catalog.share_enabled ? "Link ativo" : "Link inativo"}
                      </span>
                      <small>
                        {catalog.status === "published"
                          ? "Publicado"
                          : catalog.status === "archived"
                            ? "Arquivado"
                            : "Rascunho"}
                      </small>
                    </div>

                    <div className="response-cell">
                      <strong>{responseCount}</strong>
                      <span>{responseCount === 1 ? "resposta" : "respostas"}</span>
                    </div>

                    <div className="value-cell">
                      <strong>{latest ? formatPrice(latest.total_amount) : "—"}</strong>
                      <span>
                        {latest
                          ? new Date(latest.submitted_at).toLocaleString("pt-BR")
                          : "Sem seleção"}
                      </span>
                    </div>

                    <div className="quick-actions">
                      {newCount > 0 ? (
                        <Link
                          href={`/catalogos/${catalog.id}`}
                          className="action-button response-action"
                        >
                          Ver resposta
                        </Link>
                      ) : (
                        <Link
                          href={`/catalogos/${catalog.id}`}
                          className="action-button"
                        >
                          Abrir
                        </Link>
                      )}

                      <button
                        type="button"
                        className="action-button duplicate-action"
                        onClick={() => openDuplicateModal(catalog)}
                      >
                        Duplicar
                      </button>

                      <button
                        type="button"
                        className="action-button"
                        onClick={() => copyCatalogLink(catalog)}
                        disabled={!catalog.share_enabled || !catalog.share_token}
                        title={
                          catalog.share_enabled
                            ? "Copiar link do cliente"
                            : "Ative o link antes de copiar"
                        }
                      >
                        Copiar link
                      </button>

                      <button
                        type="button"
                        className={`action-button ${
                          catalog.share_enabled ? "danger-action" : "activate-action"
                        }`}
                        onClick={() => toggleCatalogShare(catalog)}
                        disabled={actionCatalogId === catalog.id}
                      >
                        {actionCatalogId === catalog.id
                          ? "Aguarde..."
                          : catalog.share_enabled
                            ? "Desativar"
                            : "Ativar link"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>

      {duplicateSource && (
        <div className="duplicate-backdrop" onClick={closeDuplicateModal}>
          <section
            className="duplicate-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Duplicar catálogo"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="duplicate-header">
              <div>
                <span>DUPLICAR CATÁLOGO</span>
                <h2>Novo catálogo para outro cliente</h2>
                <p>
                  Produtos e preços de <strong>{duplicateSource.name}</strong> serão copiados.
                </p>
              </div>

              <button
                type="button"
                className="duplicate-close"
                onClick={closeDuplicateModal}
                disabled={duplicating}
              >
                ×
              </button>
            </div>

            <div className="duplicate-grid">
              <label className="full">
                <span>Nome interno do novo catálogo</span>
                <input
                  value={duplicateName}
                  onChange={(event) => setDuplicateName(event.target.value)}
                  placeholder="Ex.: Catálogo Papelaria Centro"
                />
              </label>

              <label>
                <span>Nome do cliente</span>
                <input
                  value={duplicateClientName}
                  onChange={(event) => setDuplicateClientName(event.target.value)}
                  placeholder="Ex.: João Silva"
                />
              </label>

              <label>
                <span>Empresa</span>
                <input
                  value={duplicateCompany}
                  onChange={(event) => setDuplicateCompany(event.target.value)}
                  placeholder="Ex.: Papelaria ABC"
                />
              </label>

              <label>
                <span>Contato</span>
                <input
                  value={duplicateContact}
                  onChange={(event) => setDuplicateContact(event.target.value)}
                  placeholder="WhatsApp ou e-mail"
                />
              </label>

              <label>
                <span>Validade das condições</span>
                <input
                  type="date"
                  value={duplicateValidUntil}
                  onChange={(event) => setDuplicateValidUntil(event.target.value)}
                />
              </label>
            </div>

            <div className="duplicate-note">
              <strong>O que será copiado?</strong>
              <span>
                Produtos, ordem, preços personalizados, descrição e dados da capa.
                O link do cliente ficará desativado até você revisar e ativar.
              </span>
            </div>

            {duplicateFeedback && (
              <div className="duplicate-feedback">{duplicateFeedback}</div>
            )}

            <div className="duplicate-actions">
              <button
                type="button"
                className="cancel-duplicate"
                onClick={closeDuplicateModal}
                disabled={duplicating}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="confirm-duplicate"
                onClick={duplicateCatalog}
                disabled={duplicating}
              >
                {duplicating ? "Duplicando..." : "Duplicar catálogo →"}
              </button>
            </div>
          </section>
        </div>
      )}

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
          background: #8a2a18;
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 10px;
          font-weight: 900;
        }

        .admin > div:last-child {
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
          max-width: 1360px;
          margin: 0 auto 24px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
        }

        .eyebrow {
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

        :global(.new-button) {
          min-height: 42px;
          border-radius: 10px;
          padding: 0 15px;
          background: #8a2a18;
          color: #fff;
          display: inline-flex;
          align-items: center;
          text-decoration: none;
          font-size: 9px;
          font-weight: 900;
        }

        .stats-grid {
          max-width: 1360px;
          margin: 0 auto 16px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .stats-grid > div {
          padding: 17px;
          border: 1px solid #e6ddd8;
          border-radius: 14px;
          background: #fff;
          box-shadow: 0 7px 24px rgba(60, 41, 32, .035);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .stats-grid > div.highlight {
          border-color: #efc197;
          background: #fff9f3;
        }

        .stats-grid span {
          color: #9a8d86;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .7px;
        }

        .stats-grid strong {
          color: #8a2a18;
          font-size: 27px;
          line-height: 1;
        }

        .stats-grid small {
          color: #9b8f88;
          font-size: 8px;
        }

        .management-card {
          max-width: 1360px;
          margin: 0 auto;
          border: 1px solid #e6ddd8;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 8px 26px rgba(65, 44, 34, 0.035);
          overflow: hidden;
        }

        .management-toolbar {
          padding: 16px;
          border-bottom: 1px solid #eee6e1;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
        }

        .search-wrap {
          width: min(420px, 100%);
          min-height: 40px;
          border: 1px solid #ddd4cf;
          border-radius: 9px;
          padding: 0 11px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .search-wrap > span {
          color: #8a2a18;
          font-weight: 900;
        }

        .search-wrap input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: #342722;
          font: inherit;
          font-size: 10px;
        }

        .filters {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .filters button {
          min-height: 34px;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid #e1d7d1;
          background: #fff;
          color: #776a63;
          font-size: 8px;
          font-weight: 900;
          cursor: pointer;
        }

        .filters button.active {
          border-color: #ef7a00;
          background: #ef7a00;
          color: #fff;
        }

        .table {
          overflow-x: auto;
        }

        .table-head,
        .table-row {
          min-width: 1120px;
          display: grid;
          grid-template-columns: minmax(290px, 1.45fr) 135px 135px 90px 150px minmax(230px, .9fr);
          gap: 12px;
          align-items: center;
        }

        .table-head {
          padding: 10px 16px;
          background: #faf7f4;
          color: #9b8f88;
          font-size: 7px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .5px;
        }

        .table-row {
          min-height: 82px;
          padding: 11px 16px;
          box-sizing: border-box;
          border-top: 1px solid #eee6e1;
          transition: .15s ease;
        }

        .table-row:hover {
          background: #fdfaf8;
        }

        .table-row.has-new {
          background: #fffaf5;
          box-shadow: inset 4px 0 0 #ef7a00;
        }

        .catalog-cell {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .catalog-icon {
          width: 38px;
          height: 38px;
          flex: 0 0 auto;
          border-radius: 10px;
          background: #fff1e6;
          color: #8a2a18;
          display: grid;
          place-items: center;
          font-size: 8px;
          font-weight: 900;
        }

        .catalog-cell > div:last-child {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .catalog-name-row {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .catalog-name-row strong {
          min-width: 0;
          color: #44332c;
          font-size: 10px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .new-badge {
          flex: 0 0 auto;
          padding: 3px 6px;
          border-radius: 999px;
          background: #ef7a00;
          color: #fff;
          font-size: 6px;
          font-weight: 900;
        }

        .catalog-cell span {
          color: #776961;
          font-size: 8px;
        }

        .catalog-cell small {
          color: #a0938c;
          font-size: 7px;
        }

        .date-cell,
        .status-cell,
        .response-cell,
        .value-cell {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .date-cell strong,
        .response-cell strong,
        .value-cell strong {
          color: #56443b;
          font-size: 9px;
        }

        .date-cell small,
        .status-cell small,
        .response-cell span,
        .value-cell span {
          color: #9b8f88;
          font-size: 7px;
        }

        .date-cell small.danger {
          color: #b33a26;
          font-weight: 900;
        }

        .status-pill {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #8e8179;
          font-size: 8px;
          font-weight: 900;
        }

        .status-pill i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #b8ada6;
        }

        .status-pill.active {
          color: #43825c;
        }

        .status-pill.active i {
          background: #42a566;
          box-shadow: 0 0 0 3px rgba(66,165,102,.1);
        }

        .response-cell {
          align-items: flex-start;
        }

        .response-cell strong {
          color: #8a2a18;
          font-size: 17px;
          line-height: 1;
        }

        .value-cell strong {
          color: #8a2a18;
          font-size: 11px;
        }

        .quick-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 5px;
        }

        :global(.action-button) {
          min-height: 32px;
          border-radius: 8px;
          border: 1px solid #e1d6d0;
          background: #fff;
          color: #8a2a18;
          padding: 0 9px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          font-family: inherit;
          font-size: 7px;
          font-weight: 900;
          white-space: nowrap;
          cursor: pointer;
        }

        :global(.action-button.response-action) {
          border-color: #ef7a00;
          background: #ef7a00;
          color: #fff;
        }

        .quick-actions .activate-action {
          border-color: #8a2a18;
          background: #8a2a18;
          color: #fff;
        }

        .quick-actions .danger-action {
          border-color: #ead5ce;
          background: #fff6f3;
          color: #a13a28;
        }

        .quick-actions button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .action-feedback {
          margin: 0 16px 12px;
          padding: 10px 12px;
          border-radius: 9px;
          border: 1px solid #efd0b5;
          background: #fff7ef;
          color: #8a2a18;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 8px;
          font-weight: 800;
        }

        .action-feedback button {
          width: 24px;
          height: 24px;
          flex: 0 0 auto;
          border: 0;
          border-radius: 50%;
          background: #fff;
          color: #8a2a18;
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
        }

        .quick-actions .duplicate-action {
          border-color: #efd6c0;
          background: #fff8f2;
          color: #8a2a18;
        }

        .duplicate-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          padding: 24px;
          background: rgba(39, 27, 22, .62);
          backdrop-filter: blur(5px);
          display: grid;
          place-items: center;
        }

        .duplicate-modal {
          width: min(680px, 96vw);
          max-height: 92vh;
          overflow: auto;
          box-sizing: border-box;
          border-radius: 18px;
          background: #fff;
          border: 1px solid #e4dad4;
          padding: 22px;
          box-shadow: 0 28px 85px rgba(37, 25, 20, .24);
        }

        .duplicate-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #eee5df;
        }

        .duplicate-header > div > span {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.3px;
        }

        .duplicate-header h2 {
          margin: 5px 0 0;
          color: #352821;
          font-size: 23px;
          letter-spacing: -.5px;
        }

        .duplicate-header p {
          margin: 6px 0 0;
          color: #867970;
          font-size: 9px;
          line-height: 1.5;
        }

        .duplicate-header p strong {
          color: #8a2a18;
        }

        .duplicate-close {
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          border-radius: 50%;
          border: 1px solid #dfd4ce;
          background: #fff;
          color: #75665e;
          font-size: 18px;
          cursor: pointer;
        }

        .duplicate-grid {
          margin-top: 17px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .duplicate-grid label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .duplicate-grid label.full {
          grid-column: 1 / -1;
        }

        .duplicate-grid label > span {
          color: #625149;
          font-size: 9px;
          font-weight: 900;
        }

        .duplicate-grid input {
          width: 100%;
          min-height: 41px;
          box-sizing: border-box;
          border: 1px solid #ddd3cd;
          border-radius: 9px;
          background: #fff;
          color: #342722;
          padding: 0 11px;
          outline: none;
          font: inherit;
          font-size: 10px;
        }

        .duplicate-grid input:focus {
          border-color: #ef7a00;
          box-shadow: 0 0 0 3px rgba(239,122,0,.08);
        }

        .duplicate-note {
          margin-top: 15px;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid #efd4bd;
          background: #fff8f2;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .duplicate-note strong {
          color: #8a2a18;
          font-size: 9px;
        }

        .duplicate-note span {
          color: #806f66;
          font-size: 8px;
          line-height: 1.5;
        }

        .duplicate-feedback {
          margin-top: 11px;
          padding: 9px 10px;
          border-radius: 9px;
          background: #fff0e8;
          color: #8a2a18;
          font-size: 9px;
          font-weight: 800;
        }

        .duplicate-actions {
          margin-top: 18px;
          padding-top: 15px;
          border-top: 1px solid #eee5df;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .duplicate-actions button {
          min-height: 40px;
          padding: 0 14px;
          border-radius: 9px;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .cancel-duplicate {
          border: 1px solid #ddd3cd;
          background: #fff;
          color: #74665f;
        }

        .confirm-duplicate {
          border: 0;
          background: #8a2a18;
          color: #fff;
        }

        .duplicate-actions button:disabled,
        .duplicate-close:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .empty-state {
          min-height: 220px;
          display: grid;
          place-items: center;
          color: #91857e;
          font-size: 10px;
        }

        @media (max-width: 1120px) {
          .page-shell {
            grid-template-columns: 1fr;
          }

          .sidebar {
            display: none;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .management-toolbar {
            align-items: stretch;
            flex-direction: column;
          }
        }

        @media (max-width: 640px) {
          .content {
            padding: 26px 14px 50px;
          }

          .page-header {
            flex-direction: column;
          }

          .stats-grid {
            grid-template-columns: 1fr 1fr;
          }

          .filters {
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 4px;
          }

          .filters button {
            flex: 0 0 auto;
          }

          .duplicate-backdrop {
            padding: 10px;
          }

          .duplicate-grid {
            grid-template-columns: 1fr;
          }

          .duplicate-grid label.full {
            grid-column: auto;
          }

          .duplicate-actions {
            flex-direction: column-reverse;
          }

          .duplicate-actions button {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
