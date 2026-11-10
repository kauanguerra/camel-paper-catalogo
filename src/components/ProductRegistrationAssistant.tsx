"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Key = "description" | "specifications" | "material" | "category_id" | "catalog_group_id";
type Values = Record<Key, string>;
type Result = { fields: Record<Key, { value: string; source: string; evidence: string }>; observations: string[]; warnings: string[] };
const labels: Record<Key, string> = { description: "Descrição", specifications: "Especificações", material: "Material", category_id: "Categoria", catalog_group_id: "Grupo no catálogo" };
const keys = Object.keys(labels) as Key[];
const sources: Record<string, string> = { titulo: "Identificado no título", foto: "Identificado na foto", titulo_e_foto: "Título e foto", nao_identificado: "Não identificado" };
async function analysisPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Não foi possível preparar a foto.");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5, 0.35]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 800_000) return blob;
    }
    throw new Error("Uma foto está muito grande para análise. Use uma foto menor.");
  } finally { URL.revokeObjectURL(url); }
}
export default function ProductRegistrationAssistant({ name, brand, photos, values, categories, groups, disabled, onApply, onBusyChange }: {
  name: string; brand: string; photos: { file: File | null }[]; values: Values;
  categories: { id: string; name: string }[]; groups: { id: string; name: string }[];
  disabled: boolean; onApply: (patch: Partial<Values>) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<Partial<Record<Key, boolean>>>({});
  const [snapshot, setSnapshot] = useState<{ name: string; brand: string; files: (File | null)[] } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const stale = !!snapshot && (name !== snapshot.name || brand !== snapshot.brand || photos.some((p,i) => p.file !== snapshot.files[i]));
  async function analyze() {
    if (lock.current || disabled) return;
    if (!name.trim()) { setMessage("Informe primeiro o nome do produto."); return; }
    lock.current = true; setBusy(true); onBusyChange(true); setMessage(""); setResult(null);
    setSnapshot({ name, brand, files: photos.map(p => p.file) });
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 100000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Faça login novamente.");
      const body = new FormData(); body.set("name", name); body.set("brand", brand);
      for (const photo of photos) if (photo.file) body.append("photos", await analysisPhoto(photo.file), "reference.jpg");
      const response = await fetch("/api/ai/product-assistance", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body, signal: abort.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Falha na análise. Tente novamente.");
      if (!data?.fields || keys.some(k => typeof data.fields[k]?.value !== "string") || !Array.isArray(data.warnings) || !Array.isArray(data.observations)) throw new Error("Resposta inválida. Nenhum campo foi alterado.");
      setResult(data); setSelected(Object.fromEntries(keys.map(k => [k, !values[k].trim() && !!data.fields[k].value])));
      setMessage("Revise as sugestões e marque o que deseja aplicar. Campos preenchidos ficam desmarcados.");
    } catch (e) { setMessage(e instanceof Error && e.name === "AbortError" ? "A análise demorou demais ou foi cancelada. Tente novamente." : e instanceof Error ? e.message : "Falha na análise."); }
    finally { clearTimeout(timer); lock.current = false; setBusy(false); onBusyChange(false); }
  }
  function display(key: Key, value: string) {
    return (key === "category_id" ? categories : key === "catalog_group_id" ? groups : []).find(v => v.id === value)?.name || value || "Não informado";
  }
  function apply() {
    if (!result || stale || busy || disabled) return;
    const chosen = keys.filter(k => selected[k] && result.fields[k].value);
    const overwritten = chosen.filter(k => values[k].trim() && values[k] !== result.fields[k].value);
    if (overwritten.length && !window.confirm(`Substituir os campos já preenchidos: ${overwritten.map(k => labels[k]).join(", ")}?`)) return;
    onApply(Object.fromEntries(chosen.map(k => [k, result.fields[k].value])));
    setSelected({}); setMessage("Sugestões aplicadas ao formulário. Revise e clique em Cadastrar produto para salvar.");
  }
  return <div className="assistant">
    <h3>Preencher com IA</h3>
    <p>Analise o título e até quatro fotos originais do produto. Revise antes de aplicar. Cada análise utiliza a API; sem fotos, usamos somente o título. Fotos das variações não entram nesta análise.</p>
    <button type="button" onClick={analyze} disabled={busy || disabled}>{busy ? "Analisando título e fotos…" : result ? "Analisar novamente" : "Analisar e sugerir preenchimento"}</button>
    {message && <p role="status">{message}</p>}
    {stale && <p role="alert">O nome, a marca ou as fotos mudaram. Analise novamente antes de aplicar.</p>}
    {result && <>
      {result.warnings.length > 0 && <div className="notice"><strong>Confira antes de cadastrar</strong><ul>{result.warnings.map((v,i) => <li key={i}>{v}</li>)}</ul></div>}
      {keys.map(key => <div className="suggestion" key={key}>
        <label className="suggestion-heading"><input type="checkbox" checked={!!selected[key]} disabled={stale || busy || disabled || !result.fields[key].value} onChange={e => setSelected(s => ({...s,[key]:e.target.checked}))}/><strong>{labels[key]}</strong></label>
        <small>{sources[result.fields[key].source] || "Conferir"} · {result.fields[key].evidence}</small>
        {values[key] && <p>Atual: {display(key,values[key])}</p>}
        <p className="proposed">{display(key,result.fields[key].value)}</p>
      </div>)}
      {result.observations.length > 0 && <div className="notice"><strong>Observações da embalagem — somente conferência</strong><p>Estas informações não preenchem medidas, embalagem, preços ou caixa master.</p><ul>{result.observations.map((v,i) => <li key={i}>{v}</li>)}</ul></div>}
      <button type="button" disabled={stale || busy || disabled || !keys.some(k => selected[k])} onClick={apply}>Aplicar campos marcados</button>
    </>}
    <style jsx>{`
      .assistant {background:#fff8f1;border:1px solid #ebd2bf;border-radius:16px;padding:20px;margin-bottom:24px;}
      h3 {margin:0 0 8px;color:#8a2a18;} p,li {font-size:14px;line-height:1.6;overflow-wrap:anywhere;}
      button {background:#8a2a18;color:white;border:0;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer;}
      button:disabled {opacity:.5;cursor:not-allowed;} .suggestion {background:white;border:1px solid #e7dcd3;border-radius:12px;padding:14px;margin:12px 0;}
      .assistant .suggestion .suggestion-heading {display:flex;flex-direction:row;justify-content:flex-start;gap:10px;align-items:center;width:100%;text-align:left;}
      .assistant .suggestion .suggestion-heading input[type="checkbox"] {appearance:auto;width:18px;min-width:18px;max-width:18px;height:18px;min-height:18px;flex:0 0 18px;margin:0;padding:0;box-shadow:none;accent-color:#8a2a18;}
      .assistant .suggestion .suggestion-heading strong {flex:1;min-width:0;text-align:left;} small {display:block;margin-top:8px;color:#75675d;} .proposed {white-space:pre-wrap;}
      .notice {background:#fff0d2;padding:14px;border-radius:12px;margin:14px 0;} ul {padding-left:20px;}
    `}</style>
  </div>;
}
