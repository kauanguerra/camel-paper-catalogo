"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppSidebar from "@/components/AppSidebar";

type Category = {
  id: string;
  name: string;
  slug: string | null;
  active: boolean;
  created_at?: string;
};

type ProductCategory = {
  category_id: string | null;
};

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [categoryResult, productResult] = await Promise.all([
      supabase.from("categories").select("id,name,slug,active,created_at").order("name"),
      supabase.from("products").select("category_id"),
    ]);

    if (categoryResult.error) {
      setFeedback(`Erro ao carregar categorias: ${categoryResult.error.message}`);
    } else {
      setCategories((categoryResult.data || []) as Category[]);
    }

    if (!productResult.error) {
      setProducts((productResult.data || []) as ProductCategory[]);
    }
    setLoading(false);
  }

  function productCount(categoryId: string) {
    return products.filter((product) => product.category_id === categoryId).length;
  }

  function makeSlug(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function createCategory() {
    const name = newName.trim();
    if (!name) return;

    setSaving(true);
    setFeedback("");
    const { data, error } = await supabase
      .from("categories")
      .insert({ name, slug: makeSlug(name), active: true })
      .select("id,name,slug,active,created_at")
      .single();

    if (error) {
      setFeedback(`Não foi possível criar: ${error.message}`);
    } else if (data) {
      setCategories((current) =>
        [...current, data as Category].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewName("");
      setFeedback(`Categoria "${name}" criada.`);
    }
    setSaving(false);
  }

  async function saveEdit(category: Category) {
    const name = editingName.trim();
    if (!name) return;

    setSaving(true);
    const { error } = await supabase
      .from("categories")
      .update({ name, slug: makeSlug(name), updated_at: new Date().toISOString() })
      .eq("id", category.id);

    if (error) {
      setFeedback(`Não foi possível editar: ${error.message}`);
    } else {
      setCategories((current) =>
        current
          .map((item) =>
            item.id === category.id ? { ...item, name, slug: makeSlug(name) } : item
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
      setFeedback("Categoria atualizada.");
    }
    setSaving(false);
  }

  async function toggleActive(category: Category) {
    setSaving(true);
    const active = !category.active;
    const { error } = await supabase
      .from("categories")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", category.id);

    if (error) {
      setFeedback(`Não foi possível alterar o status: ${error.message}`);
    } else {
      setCategories((current) =>
        current.map((item) => (item.id === category.id ? { ...item, active } : item))
      );
      setFeedback(active ? "Categoria ativada." : "Categoria desativada.");
    }
    setSaving(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories.filter((category) => !q || category.name.toLowerCase().includes(q));
  }, [categories, query]);

  const activeCount = categories.filter((category) => category.active).length;

  return (
    <main className="shell">
      <AppSidebar />

      <section className="content">
        <header>
          <div>
            <p className="eyebrow">ORGANIZAÇÃO DO CATÁLOGO</p>
            <h1>Categorias</h1>
            <p className="muted">Crie, edite e controle as categorias utilizadas nos produtos.</p>
          </div>
        </header>

        <div className="stats">
          <div><b>{categories.length}</b><span>Categorias cadastradas</span></div>
          <div><b>{activeCount}</b><span>Categorias ativas</span></div>
          <div><b>{products.length}</b><span>Produtos vinculados</span></div>
        </div>

        <section className="create-card">
          <div><p className="eyebrow">NOVA CATEGORIA</p><h2>Adicionar categoria</h2></div>
          <div className="create-row">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createCategory()} placeholder="Ex.: Mochilas" />
            <button onClick={createCategory} disabled={saving || !newName.trim()}>＋ Criar categoria</button>
          </div>
        </section>

        {feedback && <div className="feedback"><span>{feedback}</span><button onClick={() => setFeedback("")}>×</button></div>}

        <div className="toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar categoria..." /></div>

        <section className="table-card">
          <div className="table-head"><span>Categoria</span><span>Produtos</span><span>Status</span><span>Ações</span></div>
          {loading ? <div className="empty">Carregando categorias...</div> : filtered.map((category) => (
            <div className="table-row" key={category.id}>
              <div>
                {editingId === category.id ? (
                  <input className="edit-input" value={editingName} onChange={(e) => setEditingName(e.target.value)} autoFocus />
                ) : (
                  <><strong>{category.name}</strong><small>{category.slug || "Sem slug"}</small></>
                )}
              </div>
              <div><b>{productCount(category.id)}</b><small>produto(s)</small></div>
              <div><span className={category.active ? "status active-status" : "status"}>● {category.active ? "Ativa" : "Inativa"}</span></div>
              <div className="actions">
                {editingId === category.id ? (
                  <>
                    <button className="primary-small" onClick={() => saveEdit(category)} disabled={saving}>Salvar</button>
                    <button onClick={() => setEditingId(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditingId(category.id); setEditingName(category.name); }}>Editar</button>
                    <button className={category.active ? "danger" : "primary-small"} onClick={() => toggleActive(category)} disabled={saving}>{category.active ? "Desativar" : "Ativar"}</button>
                  </>
                )}
              </div>
            </div>
          ))}
          {!loading && filtered.length === 0 && <div className="empty">Nenhuma categoria encontrada.</div>}
        </section>
      </section>

      <style jsx>{`
        *{box-sizing:border-box}
        .shell{min-height:100vh;background:#f7f4f1;color:#352821;font-family:Arial,sans-serif;display:grid;grid-template-columns:245px 1fr}
        .content{padding:42px 54px;max-width:1450px;width:100%}
        header{display:flex;justify-content:space-between;align-items:flex-start}
        .eyebrow{font-size:10px;font-weight:900;letter-spacing:1.8px;color:#ef7a00;margin:0 0 7px}
        h1{font-size:38px;margin:0;letter-spacing:-1.3px}
        .muted{color:#81756f;margin:8px 0 0;font-size:14px}
        .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:28px 0}
        .stats>div,.create-card,.table-card{background:#fff;border:1px solid #e5dbd5;border-radius:16px}
        .stats>div{padding:18px}
        .stats b{display:block;font-size:26px;color:#8f2a18}
        .stats span{font-size:11px;color:#8b7f78}
        .create-card{padding:20px;margin-bottom:14px}
        .create-card h2{margin:0;font-size:20px}
        .create-row{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:16px}
        input{min-height:44px;border:1px solid #ddd2cc;border-radius:10px;padding:0 13px;font:inherit;outline:none}
        input:focus{border-color:#ef7a00;box-shadow:0 0 0 3px rgba(239,122,0,.08)}
        button{border:1px solid #ded2cc;background:#fff;color:#8f2a18;border-radius:9px;padding:0 13px;min-height:38px;font-weight:900;cursor:pointer}
        .create-row button,.primary-small{background:#8f2a18!important;color:#fff!important;border-color:#8f2a18!important}
        .create-row button{min-height:44px}
        .danger{background:#fff5f1;color:#a43a28}
        .feedback{margin:12px 0;background:#fff7ef;border:1px solid #f0d0b4;color:#8f2a18;border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:12px}
        .feedback button{min-height:25px;border:0;padding:0 5px}
        .toolbar{margin:14px 0}
        .toolbar input{width:100%;background:#fff}
        .table-card{overflow:hidden}
        .table-head,.table-row{display:grid;grid-template-columns:minmax(260px,1.4fr) 130px 150px 280px;align-items:center;gap:12px;padding:14px 18px}
        .table-head{background:#faf7f4;color:#988a83;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.7px}
        .table-row{border-top:1px solid #eee5df;min-height:72px}
        .table-row strong,.table-row small{display:block}
        .table-row small{color:#948780;font-size:10px;margin-top:4px}
        .table-row b{color:#8f2a18;font-size:18px}
        .status{font-size:11px;font-weight:800;color:#978b84}
        .active-status{color:#3d8d58}
        .actions{display:flex;justify-content:flex-end;gap:7px}
        .edit-input{width:100%;min-height:38px}
        .empty{padding:40px;text-align:center;color:#8e817a}
        @media(max-width:900px){
          .shell{grid-template-columns:1fr}
          .content{padding:25px 18px}
          .stats{grid-template-columns:1fr}
          .table-card{overflow:auto}
          .table-head,.table-row{min-width:820px}
          .create-row{grid-template-columns:1fr}
        }
      `}</style>
    </main>
  );
}
