"use client";

import Image from "next/image";
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
  description: string | null;
  main_image_url: string | null;
  sale_price: number | null;
  commercial_visibility: Record<string, boolean> | null;
  active: boolean;
};

type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  catalog_slot: "front" | "back" | "product" | "detail" | null;
  approved: boolean;
  source: string | null;
  is_primary: boolean;
};

export default function CatalogoPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalogImages, setCatalogImages] = useState<ProductImage[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCatalog() {
      setLoading(true);

      const [productsResult, categoriesResult, imagesResult] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id, name, sku, internal_code, category_id, description, main_image_url, sale_price, commercial_visibility, active"
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
            "id, product_id, image_url, catalog_slot, approved, source, is_primary"
          )
          .eq("source", "ai")
          .eq("approved", true),
      ]);

      if (productsResult.error) {
        console.error("Erro ao carregar produtos:", productsResult.error);
      } else {
        setProducts((productsResult.data || []) as Product[]);
      }

      if (categoriesResult.error) {
        console.error("Erro ao carregar categorias:", categoriesResult.error);
      } else {
        setCategories((categoriesResult.data || []) as Category[]);
      }

      if (imagesResult.error) {
        console.error("Erro ao carregar imagens profissionais:", imagesResult.error);
      } else {
        setCatalogImages((imagesResult.data || []) as ProductImage[]);
      }

      setLoading(false);
    }

    loadCatalog();
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
    return (
      catalogImages.find(
        (image) =>
          image.product_id === productId &&
          image.catalog_slot === "front"
      ) ||
      catalogImages.find(
        (image) => image.product_id === productId && image.is_primary
      ) ||
      catalogImages.find((image) => image.product_id === productId) ||
      null
    );
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
              <span>Catálogo Comercial</span>
            </div>

            <div className="account-actions">
              <Link href="/" className="admin-link">
                Área administrativa →
              </Link>
            </div>
          </div>

          <div className="hero-content">
            <span className="eyebrow">CATÁLOGO DIGITAL</span>
            <h1>Produtos preparados para apresentar ao cliente.</h1>
            <p>
              Busque rapidamente um item, abra a ficha completa e apresente
              somente as fotos profissionais aprovadas.
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

          <small>{filteredProducts.length} produto(s)</small>
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
                  onClick={() => router.push(`/catalogo/${product.id}`)}
                >
                  <div className="product-image">
                    {professionalImage ? (
                      <img
                        src={professionalImage.image_url}
                        alt={product.name}
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

                    <button type="button">
                      Ver produto <span>→</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      </div>

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
