"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  specifications: string | null;
  material: string | null;
  package_quantity: number | null;
  package_unit: string | null;
  active: boolean;
  main_image_url: string | null;
  categories:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null;
};

type CategoryRow = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  subtitle: string;
  sku: string;
  ean: string;
  category: string;
  pack: string;
  status: string;
  imageUrl: string | null;
};

export default function Home() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("Todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    async function loadCatalog() {
      setLoading(true);
      setError("");

      const [productsResult, categoriesResult] = await Promise.all([
        supabase
          .from("products")
          .select(
            `
            id,
            name,
            sku,
            barcode,
            specifications,
            material,
            package_quantity,
            package_unit,
            active,
            main_image_url,
            categories (
              id,
              name
            )
          `
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("categories")
          .select("id, name")
          .eq("active", true)
          .order("name"),
      ]);

      if (productsResult.error) {
        console.error("Erro ao carregar produtos:", productsResult.error);
        setError("Não foi possível carregar os produtos do Supabase.");
        setLoading(false);
        return;
      }

      if (categoriesResult.error) {
        console.error("Erro ao carregar categorias:", categoriesResult.error);
      }

      const normalizedProducts = ((productsResult.data || []) as ProductRow[]).map(
        (product) => {
          const categoryData = Array.isArray(product.categories)
            ? product.categories[0]
            : product.categories;

          const subtitle =
            product.specifications?.trim() ||
            product.material?.trim() ||
            "Sem especificações cadastradas";

          const quantity = product.package_quantity ?? 1;
          const unit = product.package_unit?.trim() || "UNIDADE";

          return {
            id: product.id,
            name: product.name,
            subtitle,
            sku: product.sku?.trim() || "Não informado",
            ean: product.barcode?.trim() || "Não informado",
            category: categoryData?.name || "Sem categoria",
            pack: `${quantity} ${formatPackageUnit(unit, quantity)}`,
            status: product.active ? "Ativo" : "Inativo",
            imageUrl: product.main_image_url,
          };
        }
      );

      setProducts(normalizedProducts);
      setCategories((categoriesResult.data || []) as CategoryRow[]);
      setLoading(false);
    }

    loadCatalog();
  }, []);

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

  const cats = useMemo(
    () => ["Todos", ...categories.map((category) => category.name)],
    [categories]
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory = cat === "Todos" || product.category === cat;

      const matchesQuery =
        !normalizedQuery ||
        `${product.name} ${product.sku} ${product.ean} ${product.category}`
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesStatus =
        statusFilter === "Todos" || product.status === statusFilter;

      return matchesCategory && matchesQuery && matchesStatus;
    });
  }, [products, query, cat, statusFilter]);

  const activeProducts = useMemo(
    () => products.filter((product) => product.status === "Ativo").length,
    [products]
  );

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Image
            src="/brand/camel-paper-logo.png"
            alt="Camel Paper"
            width={180}
            height={90}
            priority
          />
        </div>

        <nav>
          <button className="nav active">
            ▦ <span>Produtos</span>
          </button>
          <Link href="/categorias" className="nav menu-nav-link">
            ▤ <span>Categorias</span>
          </Link>
          <Link href="/catalogos" className="nav catalog-nav-link">
            ◫ <span>Catálogos</span>
          </Link>
          <Link href="/usuarios" className="nav menu-nav-link">
            ♙ <span>Usuários</span>
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
        <header>
          <div>
            <p className="eyebrow">CATÁLOGO INTERNO</p>
            <h1>Produtos</h1>
            <p className="muted">
              Consulte e mantenha as informações dos produtos em um só lugar.
            </p>
          </div>

          <Link href="/produtos/novo" className="primary">
            ＋ Novo produto
          </Link>
        </header>

        <div className="stats">
          <div>
            <b>{products.length}</b>
            <span>Produtos cadastrados</span>
          </div>
          <div>
            <b>{categories.length}</b>
            <span>Categorias</span>
          </div>
          <div>
            <b>{activeProducts}</b>
            <span>Produtos ativos</span>
          </div>
        </div>

        <div className="toolbar">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, SKU ou código de barras..."
          />
          <button
            type="button"
            className={filtersOpen ? "filter active-filter" : "filter"}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            ☷ Filtros
            {(cat !== "Todos" || statusFilter !== "Todos") && (
              <span className="filter-count">
                {[cat !== "Todos", statusFilter !== "Todos"].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {filtersOpen && (
          <div className="filter-panel">
            <div className="filter-panel-head">
              <div>
                <span>FILTROS</span>
                <strong>Refine os produtos exibidos</strong>
              </div>

              <button
                type="button"
                className="close-filter"
                onClick={() => setFiltersOpen(false)}
                aria-label="Fechar filtros"
              >
                ×
              </button>
            </div>

            <div className="filter-options">
              <div className="filter-group">
                <span className="filter-label">Status</span>
                <div className="filter-buttons">
                  {["Todos", "Ativo", "Inativo"].map((status) => (
                    <button
                      type="button"
                      key={status}
                      className={
                        statusFilter === status
                          ? "filter-option selected-option"
                          : "filter-option"
                      }
                      onClick={() => setStatusFilter(status)}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <span className="filter-label">Categoria</span>
                <select
                  value={cat}
                  onChange={(event) => setCat(event.target.value)}
                >
                  {cats.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="clear-filters"
                onClick={() => {
                  setCat("Todos");
                  setStatusFilter("Todos");
                  setQuery("");
                }}
              >
                Limpar filtros
              </button>
            </div>
          </div>
        )}

        <div className="chips">
          {cats.map((category) => (
            <button
              key={category}
              onClick={() => setCat(category)}
              className={cat === category ? "chip selected" : "chip"}
            >
              {category}
            </button>
          ))}
        </div>

        {loading && (
          <div className="catalog-state">
            <strong>Carregando produtos...</strong>
            <span>Buscando os dados do catálogo no Supabase.</span>
          </div>
        )}

        {!loading && error && (
          <div className="catalog-state error-state">
            <strong>Não foi possível carregar o catálogo.</strong>
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="catalog-state">
            <strong>Nenhum produto encontrado.</strong>
            <span>
              Cadastre um novo produto ou altere os filtros da pesquisa.
            </span>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid">
            {filtered.map((product, index) => (
              <article className="card" key={product.id}>
                <div className="photo compact-photo">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="product-image"
                    />
                  ) : (
                    <span>
                      CAMEL
                      <br />
                      PAPER
                    </span>
                  )}

                  <em>{String(index + 1).padStart(2, "0")}</em>
                </div>

                <div className="cardbody">
                  <div className="row">
                    <span className="category">{product.category}</span>
                    <span
                      className={
                        product.status === "Ativo"
                          ? "status"
                          : "status inactive-status"
                      }
                    >
                      ● {product.status}
                    </span>
                  </div>

                  <h2>{product.name}</h2>
                  <p>{product.subtitle}</p>

                  <dl>
                    <div>
                      <dt>SKU</dt>
                      <dd>{product.sku}</dd>
                    </div>
                    <div>
                      <dt>Código de barras</dt>
                      <dd>{product.ean}</dd>
                    </div>
                    <div>
                      <dt>Embalagem</dt>
                      <dd>{product.pack}</dd>
                    </div>
                  </dl>

                  <Link
                    href={`/produtos/${product.id}/editar`}
                    className="edit-link"
                  >
                    Editar produto →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <style jsx>{`

        .account-footer {
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 11px !important;
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
          color: #8f2a18;
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

        .active-filter {
          border-color: #ef7a00 !important;
          color: #9b2414 !important;
          background: #fff8f0 !important;
        }

        .filter-count {
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          margin-left: 5px;
          border-radius: 999px;
          background: #ef7a00;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 900;
        }

        .filter-panel {
          margin-top: 12px;
          padding: 16px 18px;
          border: 1px solid #e3d8d1;
          border-radius: 14px;
          background: #fff;
          box-shadow: 0 12px 30px rgba(65, 42, 31, 0.06);
        }

        .filter-panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding-bottom: 13px;
          border-bottom: 1px solid #eee5df;
        }

        .filter-panel-head > div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .filter-panel-head span {
          color: #ef7a00;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.2px;
        }

        .filter-panel-head strong {
          color: #3b2c26;
          font-size: 14px;
        }

        .close-filter {
          width: 30px;
          height: 30px;
          border: 1px solid #e0d5cf;
          border-radius: 50%;
          background: #fff;
          color: #7c6c64;
          font-size: 17px;
          cursor: pointer;
        }

        .filter-options {
          padding-top: 14px;
          display: flex;
          align-items: flex-end;
          gap: 18px;
          flex-wrap: wrap;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .filter-label {
          color: #6d5e56;
          font-size: 10px;
          font-weight: 800;
        }

        .filter-buttons {
          display: flex;
          gap: 6px;
        }

        .filter-option,
        .clear-filters {
          min-height: 36px;
          padding: 0 12px;
          border: 1px solid #dfd5cf;
          border-radius: 9px;
          background: #fff;
          color: #675850;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .selected-option {
          border-color: #9b2414;
          background: #9b2414;
          color: #fff;
        }

        .filter-group select {
          min-width: 210px;
          min-height: 36px;
          border: 1px solid #dfd5cf;
          border-radius: 9px;
          background: #fff;
          color: #4c3d36;
          padding: 0 10px;
          outline: none;
          font-size: 11px;
        }

        .clear-filters {
          color: #9b2414;
          background: #fff8f4;
          border-color: #ebcfc3;
        }

        .catalog-state {
          margin-top: 18px;
          min-height: 220px;
          border: 1px dashed #ded5cf;
          border-radius: 16px;
          background: #fbf8f5;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 30px;
          color: #5d514c;
        }

        .catalog-state strong {
          font-size: 16px;
          margin-bottom: 6px;
          color: #382a25;
        }

        .catalog-state span {
          font-size: 13px;
          color: #81756f;
        }

        .error-state {
          border-color: #e7c8be;
          background: #fff8f5;
        }

        .compact-photo {
          height: 230px !important;
          min-height: 230px !important;
          max-height: 230px !important;
          overflow: hidden;
          position: relative;
          background: #fffaf4;
        }

        .product-image {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
          background: #fff;
        }

        .inactive-status {
          color: #8c817b !important;
        }

        :global(.catalog-nav-link),
        :global(.menu-nav-link) {
          text-decoration: none;
          box-sizing: border-box;
        }

        :global(.catalog-nav-link:hover),
        :global(.menu-nav-link:hover) {
          text-decoration: none;
        }

        :global(.edit-link) {
          display: inline-flex;
          align-items: center;
          margin-top: 14px;
          color: #9b2414;
          text-decoration: none;
          font-weight: 800;
          font-size: 14px;
        }

        :global(.edit-link:hover) {
          text-decoration: underline;
        }

        @media (max-width: 900px) {
          .filter-options {
            align-items: stretch;
            flex-direction: column;
          }

          .filter-group,
          .filter-group select,
          .clear-filters {
            width: 100%;
          }

          .filter-buttons {
            flex-wrap: wrap;
          }

          .compact-photo {
            height: 200px !important;
            min-height: 200px !important;
            max-height: 200px !important;
          }
        }
      `}</style>
    </main>
  );
}

function formatPackageUnit(unit: string, quantity: number) {
  const normalized = unit.toUpperCase();

  const singularPluralMap: Record<string, [string, string]> = {
    UNIDADE: ["unidade", "unidades"],
    UNIDADES: ["unidade", "unidades"],
    PACOTE: ["pacote", "pacotes"],
    CAIXA: ["caixa", "caixas"],
    POTE: ["pote", "potes"],
    KIT: ["kit", "kits"],
  };

  const pair = singularPluralMap[normalized];

  if (!pair) {
    return unit.toLowerCase();
  }

  return quantity === 1 ? pair[0] : pair[1];
}
