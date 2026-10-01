"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./public-catalog.module.css";

type Photo = { id: string; image_url: string; catalog_slot: string | null; is_primary: boolean | null; variant_id: string | null };
type Variant = { id: string; name: string; color: string | null; sku: string | null; barcode: string | null };
type Product = {
  id: string; name: string; category_id: string | null; sku: string | null; barcode: string | null;
  description: string | null; specifications: string | null; material: string | null;
  width_cm: number | null; height_cm: number | null; depth_cm: number | null;
  package_quantity: number | null; package_unit: string | null; images: Photo[]; variants: Variant[];
};
type Catalog = { products: Product[]; categories: { id: string; name: string }[]; total: number };
const empty: Catalog = { products: [], categories: [], total: 0 };
const labels: Record<string, string> = { front: "Frente / apresentação", back: "Verso", product: "Produto", detail: "Detalhe" };
function clean(text: string | null) { return (text || "").replace(/<[^>]*>/g, " ").replace(/[*#`]/g, "").trim(); }
function cover(product: Product) { return product.images.find(i => !i.variant_id && i.catalog_slot === "front") || product.images.find(i => i.is_primary) || product.images[0]; }

export default function PublicCatalogPage() {
  return <Suspense fallback={<main className={styles.shell}><div className={styles.state}>Carregando catálogo…</div></main>}>
    <PublicCatalogContent />
  </Suspense>;
}

function PublicCatalogContent() {
  const searchParams = useSearchParams();
  const productId = searchParams.get("produto");
  const [data, setData] = useState<Catalog>(empty);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (productId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) {
      setData(empty); setError("O link deste produto é inválido."); setLoading(false); return;
    }
    let cancelled = false;
    setLoading(true); setError("");
    async function load() {
      try {
        const result = await supabase.rpc("camel_public_catalog_v1", {
          p_page: productId ? 0 : page, p_search: productId ? "" : query,
          p_category: productId ? null : category || null, p_product_id: productId,
        });
        if (cancelled) return;
        if (result.error) throw result.error;
        const next = result.data as Catalog;
        if (!next || !Array.isArray(next.products) || !Array.isArray(next.categories)) throw new Error("Resposta inválida");
        setData(next); setVariantId(null); setPhotoId(null);
      } catch (loadError) {
        console.error("Falha ao carregar catálogo público", loadError);
        if (!cancelled) { setData(empty); setError("Não foi possível carregar o catálogo. Tente novamente em instantes."); }
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [page, query, category, productId, retry]);

  const product = productId ? data.products[0] : null;
  const selectedVariant = product?.variants.find(v => v.id === variantId) || null;
  const gallery = product?.images.filter(i => variantId ? !i.variant_id || i.variant_id === variantId : true) || [];
  const photo = gallery.find(i => i.id === photoId) || gallery.find(i => variantId && i.variant_id === variantId) || gallery[0];
  const sku = selectedVariant ? selectedVariant.sku : product?.sku;
  const barcode = selectedVariant ? selectedVariant.barcode : product?.barcode;
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setShareMessage("Link copiado!"); }
    catch { setShareMessage("Copie o endereço na barra do navegador para compartilhar."); }
  }

  return <main className={styles.shell}>
    <header className={styles.header}>
      <a href="/catalogo-publico" aria-label="Início do catálogo"><img src="/brand/camel-colorido.svg" alt="Camel Paper" width={156} height={60} /></a>
      <span>CATÁLOGO DE PRODUTOS</span>
      <button type="button" onClick={share}>Compartilhar ↗</button>
    </header>
    {shareMessage && <p className={styles.feedback} role="status">{shareMessage}</p>}
    {!productId && <section className={styles.hero}>
      <span className={styles.eyebrow}>CONHEÇA A LINHA CAMEL PAPER</span>
      <h1>Ideias que ganham<br /><em>forma e cor.</em></h1>
      <p>Explore os produtos, descubra as variações e confira cada detalhe.</p>
      <label className={styles.search}><span>Buscar no catálogo</span><input type="search" maxLength={160} value={search} onChange={e => setSearch(e.target.value)} placeholder="Produto, cor, SKU ou código de barras" /></label>
    </section>}
    <div className={styles.content}>
      {!productId && <>
        <nav className={styles.categories} aria-label="Categorias">
          <button type="button" aria-pressed={!category} onClick={() => { setCategory(""); setPage(0); }}>Todos</button>
          {data.categories.map(c => <button type="button" aria-pressed={category === c.id} key={c.id} onClick={() => { setCategory(c.id); setPage(0); }}>{c.name}</button>)}
        </nav>
        <div className={styles.sectionHeading}><h2>{data.categories.find(c => c.id === category)?.name || "Todos os produtos"}</h2><span>{loading ? "Carregando…" : `${data.total} produtos`}</span></div>
      </>}
      {loading ? <div className={styles.state} role="status">Carregando produtos e variações…</div> : error ? <div className={styles.state} role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(v => v + 1)}>Tentar novamente</button><p><a href="/catalogo-publico">Voltar ao catálogo</a></p></div> : productId ? product ? <>
        <a className={styles.back} href="/catalogo-publico">← Voltar ao catálogo</a>
        <div className={styles.detail}>
          <section aria-label="Fotos do produto">
            <div className={styles.mainPhoto}>{photo ? <img src={photo.image_url} alt={`${product.name} - ${labels[photo.catalog_slot || ""] || "Foto"}`} /> : <span>Foto em preparação</span>}</div>
            {photo && <p className={styles.photoLabel}>{labels[photo.catalog_slot || ""] || "Foto do produto"}{photo.variant_id ? ` • ${product.variants.find(v => v.id === photo.variant_id)?.name || "Variação"}` : ""}{variantId && !photo.variant_id ? " • Foto geral do produto" : ""}</p>}
            <div className={styles.thumbnails}>{gallery.map(i => <button type="button" key={i.id} aria-label={`Ver ${labels[i.catalog_slot || ""] || "foto"}`} aria-pressed={photo?.id === i.id} onClick={() => setPhotoId(i.id)}><img src={i.image_url} alt={labels[i.catalog_slot || ""] || "Foto"} loading="lazy" /></button>)}</div>
          </section>
          <section className={styles.info}>
            <span className={styles.eyebrow}>{data.categories.find(c => c.id === product.category_id)?.name || "CAMEL PAPER"}</span>
            <h1>{product.name}</h1>
            {(sku || barcode) && <div className={styles.codes}>{sku && <span><b>SKU</b> {sku}</span>}{barcode && <span><b>Código de barras</b> {barcode}</span>}</div>}
            {product.variants.length > 0 && <section className={styles.options}>
              <div className={styles.sectionHeading}><h2>Variações disponíveis</h2><span>{product.variants.length} opções</span></div>
              <div className={styles.optionGrid}>{product.variants.map(v => <button type="button" key={v.id} aria-pressed={variantId === v.id} onClick={() => { setVariantId(v.id); setPhotoId(null); }}><strong>{v.name}</strong>{v.color && v.color !== v.name && <span>{v.color}</span>}{v.sku && <small>SKU {v.sku}</small>}{v.barcode && <small>Cód. barras {v.barcode}</small>}</button>)}</div>
              {variantId && <button className={styles.reset} type="button" onClick={() => { setVariantId(null); setPhotoId(null); }}>Ver todas as fotos</button>}
              {variantId && !gallery.some(i => i.variant_id === variantId) && <p className={styles.photoLabel}>Esta opção utiliza a apresentação geral do produto.</p>}
            </section>}
            {product.description && <div className={styles.copy}><h2>Sobre o produto</h2><p>{clean(product.description)}</p></div>}
            <dl className={styles.specs}>
              {product.material && <div><dt>Material</dt><dd>{product.material}</dd></div>}
              {product.width_cm != null && <div><dt>Largura</dt><dd>{product.width_cm} cm</dd></div>}
              {product.height_cm != null && <div><dt>Altura</dt><dd>{product.height_cm} cm</dd></div>}
              {product.depth_cm != null && <div><dt>Profundidade</dt><dd>{product.depth_cm} cm</dd></div>}
              {product.package_quantity != null && <div><dt>Embalagem</dt><dd>{product.package_quantity} {product.package_unit || "unidades"}</dd></div>}
            </dl>
            {product.specifications && <div className={styles.copy}><h2>Especificações</h2><p>{clean(product.specifications)}</p></div>}
          </section>
        </div>
      </> : <div className={styles.state}>Produto indisponível. <a href="/catalogo-publico">Voltar ao catálogo</a></div> : data.products.length ? <>
        <div className={styles.grid}>{data.products.map(p => { const image = cover(p); return <Link className={styles.card} key={p.id} href={`/catalogo-publico?produto=${p.id}`}>
          <div className={styles.cardPhoto}>{image ? <img src={image.image_url} alt={p.name} loading="lazy" decoding="async" /> : <span>Foto em preparação</span>}{p.variants.length > 0 && <b>{p.variants.length} variações</b>}</div>
          <div className={styles.cardInfo}><small>{data.categories.find(c => c.id === p.category_id)?.name || "Camel Paper"}</small><h3>{p.name}</h3>{p.sku && <p>SKU {p.sku}</p>}<span>Conhecer produto <b>↗</b></span></div>
        </Link>; })}</div>
        <nav className={styles.pagination} aria-label="Paginação"><button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Anterior</button><span>{page + 1} / {Math.max(1, Math.ceil(data.total / 24))}</span><button type="button" disabled={(page + 1) * 24 >= data.total} onClick={() => setPage(p => p + 1)}>Próxima →</button></nav>
      </> : <div className={styles.state}>Nenhum produto encontrado. Experimente outra busca ou categoria.</div>}
    </div>
    <footer className={styles.footer}><strong>Camel Paper</strong><span>Produtos, detalhes e possibilidades.</span></footer>
  </main>;
}
