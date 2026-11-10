"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { categorySlug, type ClassificationProduct, type ClassificationCategory, type ClassificationGroup, type ClassificationSuggestion } from "@/lib/catalog-organization";

async function callApi(method: string, body?: unknown, offset=0) {
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) throw new Error("Faça login novamente para organizar os produtos.");
  const response=await fetch(`/api/ai/product-classification?offset=${offset}`,{
    method,cache:"no-store",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  const result=await response.json().catch(()=>({error:"Resposta inesperada. Confira sua conexão e sessão."}));
  if(!response.ok) throw new Error(result.error||"Não foi possível concluir.");
  return result;
}
export default function CatalogClassificationPanel({onApplied}:{onApplied:()=>void}) {
  const [products,setProducts]=useState<ClassificationProduct[]>([]);
  const [categories,setCategories]=useState<ClassificationCategory[]>([]);
  const [groups,setGroups]=useState<ClassificationGroup[]>([]);
  const [suggestions,setSuggestions]=useState<ClassificationSuggestion[]>([]);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState("");
  const [search,setSearch]=useState("");
  const [protectedOpen,setProtectedOpen]=useState(false);
  const selected=suggestions.filter(s=>s.selected);
  const pending=products.filter(p=>!p.taxonomy_locked&&!suggestions.some(s=>s.product.id===p.id));
  const locked=products.filter(p=>p.taxonomy_locked);
  const categoryName=(id:string|null)=>categories.find(c=>c.id===id)?.name||"Sem categoria";
  const groupName=(id:string|null)=>groups.find(g=>g.id===id)?.name||"Sem grupo";
  async function load() {
    if(suggestions.length && !window.confirm("Descartar as sugestões ainda não aplicadas e atualizar a lista?")) return;
    setBusy(true);setFeedback("");
    try{
      const all:ClassificationProduct[]=[];let offset=0;let result;
      do{result=await callApi("GET",undefined,offset);all.push(...result.products);offset+=200;}while(result.hasMore);
      setProducts(all);setCategories(result.categories);setGroups(result.groups);setSuggestions([]);setLoaded(true);
      setFeedback(`${all.length} produtos ativos carregados. Nenhuma classificação foi alterada.`);
    }catch(e){setFeedback(e instanceof Error?e.message:"Falha ao carregar.");}finally{setBusy(false);}
  }
  async function analyze() {
    const ids=pending.slice(0,20).map(p=>p.id);if(!ids.length)return;
    setBusy(true);setFeedback(`Analisando ${ids.length} produtos. Aguarde...`);
    try{const result=await callApi("POST",{action:"suggest",ids});setSuggestions(prev=>[...prev,...result.suggestions]);setFeedback("Análise pronta. Revise categorias, grupos e motivos. Marque os produtos que deseja aplicar.");}
    catch(e){setFeedback(e instanceof Error?e.message:"Falha na análise.");}finally{setBusy(false);}
  }
  function edit(id:string,patch:Partial<ClassificationSuggestion>){setSuggestions(prev=>prev.map(s=>s.product.id===id?{...s,...patch}:s));}
  async function apply() {
    if(selected.length<1||selected.length>20)return;
    setBusy(true);setFeedback("");
    try{
      const result=await callApi("POST",{action:"apply",items:selected.map(s=>({id:s.product.id,version:s.product.taxonomy_version,category:s.category,group_id:s.group_id}))});
      const ids=new Set(selected.map(s=>s.product.id));
      // O servidor pode criar categorias; recarrega referências sem descartar sugestões de outros produtos.
      const refs=await callApi("GET");setCategories(refs.categories);
      setProducts(prev=>prev.map(p=>ids.has(p.id)?{...p,taxonomy_locked:true,taxonomy_version:p.taxonomy_version+1}:p));
      setSuggestions(prev=>prev.filter(s=>!ids.has(s.product.id)));
      setFeedback(`${result.saved} classificações aplicadas e protegidas. Recarregue o catálogo; atualize o download offline nos dispositivos.`);onApplied();
    }catch(e){setFeedback((e instanceof Error?e.message:"Falha ao salvar.")+" Se a conexão caiu após salvar, atualize a lista antes de repetir.");}finally{setBusy(false);}
  }
  async function unlock(p:ClassificationProduct){
    if(!window.confirm(`Liberar “${p.name}” para nova análise? A categoria atual será mantida até uma nova aprovação.`))return;
    setBusy(true);
    try{await callApi("POST",{action:"unlock",items:[{id:p.id,version:p.taxonomy_version}]});setProducts(prev=>prev.map(v=>v.id===p.id?{...v,taxonomy_locked:false,taxonomy_version:v.taxonomy_version+1}:v));setFeedback("Produto liberado. Você pode analisar o próximo lote.");}
    catch(e){setFeedback(e instanceof Error?e.message:"Falha ao liberar.");}finally{setBusy(false);}
  }
  return <section className="classification">
    <header><span>ORGANIZAÇÃO ASSISTIDA</span><h2>Organizar produtos com IA</h2>
      <p>Analise até 20 produtos por vez. Revise antes de aplicar. Categorias novas são criadas somente na aprovação.</p></header>
    <p className="note">A análise utiliza a API de texto da OpenAI e tem consumo por lote. Sugestões não aplicadas ficam apenas nesta tela. Classificações aprovadas e futuras alterações manuais de categoria ou grupo ficam protegidas. Cadastros anteriores a esta atualização precisam desta primeira revisão.</p>
    <div className="tools">
      <button type="button" disabled={busy} onClick={load}>{loaded?"Atualizar lista":"Carregar produtos"}</button>
      {loaded&&<button type="button" className="primary" disabled={busy||pending.length===0} onClick={analyze}>Analisar próximos {Math.min(20,pending.length)}</button>}
      {loaded&&<span>{pending.length} pendentes · {locked.length} protegidos · {suggestions.length} para revisar</span>}
    </div>
    {feedback&&<p role="status" className="feedback">{feedback}</p>}
    {suggestions.length>0&&<>
      <div className="tools"><button type="button" disabled={busy} onClick={()=>setSuggestions(prev=>{let count=0;return prev.map(s=>({...s,selected:s.confidence==="alta"&&++count<=20}));})}>Marcar até 20 de confiança alta</button>
      <button type="button" disabled={busy} onClick={()=>setSuggestions(prev=>prev.map(s=>({...s,selected:false})))}>Desmarcar todos</button></div>
      <div className="rows">{suggestions.map(s=><article key={s.product.id}>
        <label className="choose"><input type="checkbox" checked={s.selected} disabled={busy} onChange={e=>edit(s.product.id,{selected:e.target.checked})}/><strong>{s.product.name}</strong></label>
        <small>SKU: {s.product.sku||"Não informado"} · Atual: {categoryName(s.product.category_id)} / {groupName(s.product.catalog_group_id)}</small>
        <div className="fields"><label>Categoria proposta<input list="classification-categories" maxLength={80} value={s.category} disabled={busy} onChange={e=>edit(s.product.id,{category:e.target.value})}/></label>
        <label>Grupo no catálogo<select value={s.group_id} disabled={busy} onChange={e=>edit(s.product.id,{group_id:e.target.value})}><option value="">Sem grupo comercial</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label></div>
        <p><b>Confiança {s.confidence}</b> · {s.reason}</p>
        {!categories.some(c=>categorySlug(c.name)===categorySlug(s.category))&&<small className="new">Nova categoria: será criada ao aplicar.</small>}
      </article>)}</div>
      <datalist id="classification-categories">{categories.map(c=><option key={c.id} value={c.name}/>)}</datalist>
      <div className="tools"><button type="button" className="primary" disabled={busy||selected.length===0||selected.length>20||selected.some(s=>s.category.trim().length<2)} onClick={apply}>Aplicar {selected.length} selecionados</button><span>Máximo de 20 por aplicação. Confiança alta também exige revisão.</span></div>
    </>}
    {loaded&&<><button type="button" disabled={busy} onClick={()=>setProtectedOpen(v=>!v)}>{protectedOpen?"Ocultar":"Ver"} produtos protegidos</button>
      {protectedOpen&&<div className="protected"><input aria-label="Buscar produto protegido" placeholder="Buscar produto protegido..." value={search} onChange={e=>setSearch(e.target.value)}/>
      {locked.filter(p=>p.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))).map(p=><div key={p.id}><span>{p.name}</span><button type="button" disabled={busy} onClick={()=>unlock(p)}>Liberar para análise</button></div>)}</div>}</>}
    <style jsx>{`
      .classification{background:#fff;border:1px solid #e5dbd5;border-radius:16px;padding:22px;margin:20px 0;color:#352821}
      header>span{font-size:10px;color:#a34813;font-weight:800;letter-spacing:1px}h2{margin:6px 0;font-size:24px}p{line-height:1.5;font-size:13px}.note,small{color:#75675f}.note{background:#faf7f3;padding:12px;border-radius:8px}
      .tools{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:14px 0}.tools span{font-size:12px;color:#75675f}button{border:1px solid #d9c6ba;background:white;padding:10px 14px;border-radius:9px;color:#862816;cursor:pointer;font-weight:700}button:disabled{opacity:.5;cursor:not-allowed}.primary{background:#862816;color:#fff}
      .feedback{background:#fff3df;padding:12px;border-radius:8px}.rows{display:grid;gap:12px;max-height:680px;overflow:auto}article{border:1px solid #e5dbd5;border-radius:10px;padding:16px}.choose{display:flex;gap:10px;align-items:center;margin-bottom:8px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}.fields label{display:grid;gap:6px;font-size:12px}input:not([type=checkbox]),select{box-sizing:border-box;width:100%;padding:10px;border:1px solid #d9c6ba;border-radius:7px;background:#fff;color:#352821;min-width:0}small{display:block}.new{color:#9b5200}.protected{margin-top:12px;max-height:350px;overflow:auto}.protected>div{display:flex;gap:12px;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;padding:10px 0;font-size:13px}
      @media(max-width:650px){.classification{padding:14px}.fields{grid-template-columns:1fr}.protected>div{align-items:flex-start;flex-direction:column}}
    `}</style>
  </section>;
}
