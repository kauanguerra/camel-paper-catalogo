"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppSidebar from "@/components/AppSidebar";
import { Download, Search } from "lucide-react";

type ProductRow = {
  id: string;
  name: string;
  category_id: string | null;
  sku: string | null;
  internal_code: string | null;
  barcode: string | null;
  active: boolean;
};

type VariantRow = {
  id: string;
  product_id: string;
  name: string;
  variation_type: string | null;
  sku: string | null;
  barcode: string | null;
  active: boolean;
};

type CategoryRow = { id: string; name: string };

type ReportRow = {
  key: string;
  category: string;
  product: string;
  variation: string;
  sku: string;
  internalCode: string;
  barcode: string;
  active: boolean;
};

const PAGE_SIZE = 1000;

async function fetchAll<T>(
  table: "products" | "product_variants",
  select: string
): Promise<{ data: T[]; error: Error | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { data: [], error };
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

export default function ProductReconciliationReportPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadReport() {
      setLoading(true);
      setError("");
      const [productsResult, categoriesResult, variantsResult] = await Promise.all([
        fetchAll<ProductRow>(
          "products",
          "id, name, category_id, sku, internal_code, barcode, active"
        ),
        supabase.from("categories").select("id, name").order("name"),
        fetchAll<VariantRow>(
          "product_variants",
          "id, product_id, name, variation_type, sku, barcode, active"
        ),
      ]);

      if (!mounted) return;
      if (productsResult.error || categoriesResult.error || variantsResult.error) {
        console.error("Erro ao montar relatório de conciliação:", {
          products: productsResult.error,
          categories: categoriesResult.error,
          variants: variantsResult.error,
        });
        setError("Não foi possível carregar todos os dados. Confira sua conexão e tente novamente.");
        setLoading(false);
        return;
      }

      const productRows = productsResult.data;
      const categoryName = new Map(
        ((categoriesResult.data || []) as CategoryRow[]).map((category) => [category.id, category.name])
      );
      const variantsByProduct = new Map<string, VariantRow[]>();
      for (const variant of variantsResult.data) {
        const current = variantsByProduct.get(variant.product_id) || [];
        current.push(variant);
        variantsByProduct.set(variant.product_id, current);
      }

      const reportRows: ReportRow[] = [];
      for (const product of productRows) {
        const variants = variantsByProduct.get(product.id) || [];
        const category = product.category_id
          ? categoryName.get(product.category_id) || "Sem categoria"
          : "Sem categoria";

        // A linha do produto principal preserva códigos que podem estar cadastrados
        // no nível do produto, mesmo quando ele também possui variações.
        reportRows.push({
          key: `product-${product.id}`,
          category,
          product: product.name,
          variation: variants.length ? "Produto principal" : "—",
          sku: product.sku?.trim() || "—",
          internalCode: product.internal_code?.trim() || "—",
          barcode: product.barcode?.trim() || "—",
          active: product.active,
        });

        for (const variant of variants) {
          reportRows.push({
            key: `variant-${variant.id}`,
            category,
            product: product.name,
            variation: [variant.variation_type?.trim(), variant.name?.trim()].filter(Boolean).join(": ") || "Variação",
            sku: variant.sku?.trim() || "—",
            internalCode: product.internal_code?.trim() || "—",
            barcode: variant.barcode?.trim() || "—",
            active: variant.active && product.active,
          });
        }
      }

      reportRows.sort((a, b) =>
        a.category.localeCompare(b.category, "pt-BR") ||
        a.product.localeCompare(b.product, "pt-BR") ||
        a.variation.localeCompare(b.variation, "pt-BR")
      );
      setRows(reportRows);
      setCategories((categoriesResult.data || []) as CategoryRow[]);
      setLoading(false);
    }

    void loadReport();
    return () => { mounted = false; };
  }, []);

  const categoryOptions = useMemo(
    () => ["Todas", ...categories.map((category) => category.name)],
    [categories]
  );

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => {
      if (!includeInactive && !row.active) return false;
      if (categoryFilter !== "Todas" && row.category !== categoryFilter) return false;
      if (!normalized) return true;
      return `${row.category} ${row.product} ${row.variation} ${row.sku} ${row.internalCode} ${row.barcode}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalized);
    });
  }, [rows, query, categoryFilter, includeInactive]);

  function exportPdf() {
    window.print();
  }

  return (
    <main className="report-shell">
      <AppSidebar />
      <section className="report-content">
        <header className="report-header">
          <div>
            <p className="eyebrow">CONFERÊNCIA DE ESTOQUE</p>
            <h1>Relatório de produtos</h1>
            <p className="muted">Compare os códigos cadastrados no sistema com os itens encontrados na loja.</p>
          </div>
          <button className="export-button no-print" type="button" onClick={exportPdf} disabled={loading || !!error || filteredRows.length === 0}>
            <Download size={17} /> Exportar PDF
          </button>
        </header>

        <div className="report-summary no-print">
          <strong>{filteredRows.length}</strong>
          <span>linhas no relatório</span>
          <small>O PDF terá somente os resultados exibidos abaixo.</small>
        </div>

        <div className="report-filters no-print">
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome, SKU, código interno ou barras" />
          </label>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filtrar por categoria">
            {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <label className="inactive-toggle">
            <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
            Incluir produtos inativos
          </label>
        </div>

        {loading && <div className="report-state">Carregando produtos e variações…</div>}
        {!loading && error && <div className="report-state error">{error}</div>}
        {!loading && !error && filteredRows.length === 0 && <div className="report-state">Nenhum produto corresponde aos filtros.</div>}

        {!loading && !error && filteredRows.length > 0 && (
          <div className="table-wrap">
            <div className="print-title">
              <span>CAMEL PAPER</span>
              <h2>Relatório de produtos para conciliação</h2>
              <p>Gerado em {new Date().toLocaleDateString("pt-BR")} · {filteredRows.length} registros</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Produto</th>
                  <th>Variação</th>
                  <th>SKU</th>
                  <th>Código interno</th>
                  <th>Código de barras</th>
                  <th className="status-column">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.key} className={!row.active ? "inactive-row" : ""}>
                    <td>{row.category}</td>
                    <td className="product-name">{row.product}</td>
                    <td>{row.variation}</td>
                    <td className="code-cell">{row.sku}</td>
                    <td className="code-cell">{row.internalCode}</td>
                    <td className="code-cell">{row.barcode}</td>
                    <td className="status-column">{row.active ? "Ativo" : "Inativo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style jsx>{`
        .report-shell{min-height:100vh;display:grid;grid-template-columns:250px minmax(0,1fr);background:#f8f6f4;color:#352923}
        .report-content{min-width:0;padding:34px clamp(20px,4vw,58px) 60px}
        .report-header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:24px}
        .eyebrow{margin:0 0 8px;color:#a13b20;font-size:10px;font-weight:900;letter-spacing:1.8px}
        h1{margin:0;color:#352923;font-size:clamp(27px,3vw,36px);letter-spacing:-1.1px}
        .muted{margin:8px 0 0;color:#82756e;font-size:14px}
        .export-button{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:44px;padding:0 17px;border:0;border-radius:11px;background:#962d19;color:#fff;font-weight:800;cursor:pointer;box-shadow:0 7px 18px #962d1922}
        .export-button:disabled{opacity:.5;cursor:not-allowed}
        .report-summary{display:flex;align-items:baseline;gap:8px;margin-bottom:15px;color:#74665f}
        .report-summary strong{color:#8f2a18;font-size:22px}.report-summary small{margin-left:auto;color:#91847e;font-size:11px}
        .report-filters{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px;padding:14px;border:1px solid #ece4df;border-radius:14px;background:#fff}
        .search-box{display:flex;align-items:center;gap:9px;flex:1 1 330px;min-height:40px;padding:0 11px;border:1px solid #e5dbd5;border-radius:9px;color:#92837b}
        .search-box input{width:100%;border:0;outline:0;color:#40342e;font:inherit;font-size:12px}
        .report-filters select{min-height:40px;max-width:260px;padding:0 30px 0 11px;border:1px solid #e5dbd5;border-radius:9px;background:#fff;color:#4f4039;font:inherit;font-size:12px}
        .inactive-toggle{display:flex;align-items:center;gap:7px;color:#75675f;font-size:11px;white-space:nowrap}.inactive-toggle input{accent-color:#982f1a}
        .report-state{padding:30px;border:1px dashed #d9ccc4;border-radius:13px;background:#fff;text-align:center;color:#74665f}.report-state.error{color:#9c2e1b}
        .table-wrap{overflow:auto;border:1px solid #e9dfd9;border-radius:13px;background:#fff;box-shadow:0 8px 28px #4931230a}
        table{width:100%;border-collapse:collapse;font-size:11px}th{position:sticky;top:0;background:#f7f1ed;color:#755c50;text-align:left;font-size:9px;font-weight:900;letter-spacing:.35px;text-transform:uppercase}
        th,td{padding:11px 12px;border-bottom:1px solid #eee8e4;vertical-align:top}tbody tr:last-child td{border-bottom:0}tbody tr:nth-child(even){background:#fdfbf9}
        .product-name{min-width:170px;font-weight:750;color:#382a24}.code-cell{white-space:nowrap;font-variant-numeric:tabular-nums}.inactive-row{color:#978c86}.status-column{text-align:center;white-space:nowrap}
        .print-title{display:none}
        @media(max-width:900px){.report-shell{grid-template-columns:1fr}.report-content{padding:24px 16px 40px}.report-header{flex-direction:column}.report-summary{flex-wrap:wrap}.report-summary small{flex-basis:100%;margin:0}.table-wrap{border-radius:10px}table{min-width:950px}}
        @media print{
          @page{size:A4 landscape;margin:12mm}
          :global(body){background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .report-shell{display:block;min-height:0;background:#fff}.report-content{padding:0}
          :global(.app-sidebar),.no-print{display:none!important}
          .report-header{display:none}.table-wrap{overflow:visible;border:0;border-radius:0;box-shadow:none}
          .print-title{display:block;margin:0 0 12px;padding-bottom:9px;border-bottom:2px solid #962d19}
          .print-title span{color:#962d19;font-size:9px;font-weight:900;letter-spacing:2px}.print-title h2{margin:4px 0;color:#352923;font-size:18px}.print-title p{margin:0;color:#75675f;font-size:9px}
          table{width:100%;font-size:8.5px;table-layout:auto}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
          th,td{padding:6px 7px;border-bottom:1px solid #ddd}th{position:static;background:#f2ece7!important;color:#624f44}
          .product-name{min-width:0}.code-cell{white-space:normal;overflow-wrap:anywhere}
        }
      `}</style>
    </main>
  );
}
