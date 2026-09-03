"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Category = {
  id: string;
  name: string;
};

type PhotoSlotKey = "front" | "back" | "product" | "detail";

type PhotoSlot = {
  key: PhotoSlotKey;
  title: string;
  description: string;
  file: File | null;
  preview: string | null;
};


type VariantDraft = {
  tempId: string;
  name: string;
  variation_type: string;
  sku: string;
  barcode: string;
  color: string;
  sale_price: string;
  active: boolean;
  photos: PhotoSlot[];
};

const PHOTO_DEFS: Array<Pick<PhotoSlot, "key" | "title" | "description">> = [
  { key: "front", title: "Frente da embalagem", description: "Foto principal desta variação." },
  { key: "back", title: "Verso da embalagem", description: "EAN, informações e especificações." },
  { key: "product", title: "Produto fora da embalagem", description: "Mostre esta variação fora da embalagem." },
  { key: "detail", title: "Detalhe", description: "Acabamento, cor, textura ou mecanismo." },
];

function emptyPhotoSlots(): PhotoSlot[] {
  return PHOTO_DEFS.map((item) => ({ ...item, file: null, preview: null }));
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function NovoProdutoPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [variantDraft, setVariantDraft] = useState({
    name: "", variation_type: "Cor", sku: "", barcode: "", color: "", sale_price: "",
  });
  const [photos, setPhotos] = useState<PhotoSlot[]>([
    {
      key: "front",
      title: "Frente da embalagem",
      description: "Foto principal e mais importante do produto.",
      file: null,
      preview: null,
    },
    {
      key: "back",
      title: "Verso da embalagem",
      description: "Ajuda a conferir EAN, informações e especificações.",
      file: null,
      preview: null,
    },
    {
      key: "product",
      title: "Produto fora da embalagem",
      description: "Mostre o produto real sempre que for possível.",
      file: null,
      preview: null,
    },
    {
      key: "detail",
      title: "Detalhe",
      description: "Foto complementar, acabamento, ponta, mecanismo etc.",
      file: null,
      preview: null,
    },
  ]);

  const [form, setForm] = useState({
    name: "",
    category_id: "",
    internal_code: "",
    sku: "",
    barcode: "",
    description: "",
    specifications: "",
    width_cm: "",
    height_cm: "",
    depth_cm: "",
    weight_g: "",
    material: "",
    package_quantity: "1",
    package_unit: "UNIDADE",
  });

  useEffect(() => {
    async function loadCategories() {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("active", true)
        .order("name");

      if (error) {
        console.error("Erro ao carregar categorias:", error);
        return;
      }

      setCategories(data || []);
    }

    loadCategories();
  }, []);

  const selectedPhotosCount = useMemo(
    () => photos.filter((photo) => photo.file).length,
    [photos]
  );

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handlePhotoChange(
    slotKey: PhotoSlotKey,
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("Use uma imagem JPG, PNG ou WEBP.");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert("A imagem deve ter no máximo 10 MB.");
      e.target.value = "";
      return;
    }

    const preview = URL.createObjectURL(file);

    setPhotos((current) =>
      current.map((photo) => {
        if (photo.key !== slotKey) return photo;

        if (photo.preview) {
          URL.revokeObjectURL(photo.preview);
        }

        return {
          ...photo,
          file,
          preview,
        };
      })
    );
  }

  function removePhoto(slotKey: PhotoSlotKey) {
    setPhotos((current) =>
      current.map((photo) => {
        if (photo.key !== slotKey) return photo;

        if (photo.preview) {
          URL.revokeObjectURL(photo.preview);
        }

        return {
          ...photo,
          file: null,
          preview: null,
        };
      })
    );
  }

  function addVariant() {
    if (!variantDraft.name.trim()) {
      setFeedback("Informe o nome/valor da variação, por exemplo: Rosa.");
      return;
    }
    setVariants((current) => [...current, {
      tempId: crypto.randomUUID(),
      name: variantDraft.name.trim(),
      variation_type: variantDraft.variation_type || "Cor",
      sku: variantDraft.sku.trim(), barcode: variantDraft.barcode.trim(),
      color: variantDraft.color.trim(), sale_price: variantDraft.sale_price,
      active: true, photos: emptyPhotoSlots(),
    }]);
    setVariantDraft((current) => ({ ...current, name: "", sku: "", barcode: "", color: "", sale_price: "" }));
    setFeedback("Variação adicionada. Agora envie as fotos específicas dela.");
  }

  function removeVariant(tempId: string) {
    setVariants((current) => {
      const target = current.find((v) => v.tempId === tempId);
      target?.photos.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      return current.filter((v) => v.tempId !== tempId);
    });
  }

  function handleVariantPhotoChange(tempId: string, slot: PhotoSlotKey, file?: File) {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) { setFeedback("Use uma imagem JPG, PNG ou WEBP."); return; }
    if (file.size > MAX_FILE_SIZE) { setFeedback("A imagem deve ter no máximo 10 MB."); return; }
    const preview = URL.createObjectURL(file);
    setVariants((current) => current.map((v) => v.tempId !== tempId ? v : ({
      ...v, photos: v.photos.map((p) => {
        if (p.key !== slot) return p;
        if (p.preview) URL.revokeObjectURL(p.preview);
        return { ...p, file, preview };
      })
    })));
  }

  async function uploadVariantPhotos(productId: string, variantId: string, variant: VariantDraft) {
    const list = variant.photos.filter((p): p is PhotoSlot & { file: File } => Boolean(p.file));
    for (let index = 0; index < list.length; index++) {
      const photo = list[index]; const file = photo.file;
      const ext0 = file.name.split(".").pop()?.toLowerCase();
      const ext = ext0 && ["jpg","jpeg","png","webp"].includes(ext0) ? ext0 : "jpg";
      const path = `${productId}/variants/${variantId}/${photo.key}-${Date.now()}-${index}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (uploadError) throw new Error(`Erro na foto da variação ${variant.name}: ${uploadError.message}`);
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
      const { error } = await supabase.from("product_images").insert({
        product_id: productId, variant_id: variantId, image_url: urlData.publicUrl,
        image_type: photo.key, source: "upload", is_primary: photo.key === "front",
        approved: true, position: index,
      });
      if (error) throw new Error(`Erro ao registrar foto da variação ${variant.name}: ${error.message}`);
    }
  }

  async function uploadProductPhotos(productId: string) {
    const photosToUpload = photos.filter(
      (photo): photo is PhotoSlot & { file: File } => Boolean(photo.file)
    );

    if (photosToUpload.length === 0) {
      return [] as Array<{
        image_url: string;
        image_type: PhotoSlotKey;
        position: number;
        is_primary: boolean;
      }>;
    }

    const uploaded: Array<{
      image_url: string;
      image_type: PhotoSlotKey;
      position: number;
      is_primary: boolean;
    }> = [];

    for (let index = 0; index < photosToUpload.length; index++) {
      const photo = photosToUpload[index];
      const file = photo.file;

      const originalExtension = file.name.split(".").pop()?.toLowerCase();
      const extension =
        originalExtension && ["jpg", "jpeg", "png", "webp"].includes(originalExtension)
          ? originalExtension
          : file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
          ? "webp"
          : "jpg";

      const filePath = `${productId}/${photo.key}-${Date.now()}-${index}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(
          `Não foi possível enviar a foto "${photo.title}": ${uploadError.message}`
        );
      }

      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      uploaded.push({
        image_url: publicUrlData.publicUrl,
        image_type: photo.key,
        position: index,
        is_primary: photo.key === "front",
      });
    }

    const hasFrontPhoto = uploaded.some((photo) => photo.image_type === "front");

    if (!hasFrontPhoto && uploaded.length > 0) {
      uploaded[0].is_primary = true;
    }

    return uploaded;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.name.trim()) {
      alert("Informe o nome do produto.");
      return;
    }

    setLoading(true);

    const slugBase = form.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const slug = `${slugBase}-${Date.now().toString().slice(-6)}`;

    try {
      const { data: product, error: productError } = await supabase
        .from("products")
        .insert({
          name: form.name.trim(),
          slug,
          category_id: form.category_id || null,
          internal_code: form.internal_code.trim() || null,
          sku: form.sku.trim() || null,
          barcode: form.barcode.trim() || null,
          description: form.description.trim() || null,
          specifications: form.specifications.trim() || null,
          width_cm: form.width_cm ? Number(form.width_cm) : null,
          height_cm: form.height_cm ? Number(form.height_cm) : null,
          depth_cm: form.depth_cm ? Number(form.depth_cm) : null,
          weight_g: form.weight_g ? Number(form.weight_g) : null,
          material: form.material.trim() || null,
          package_quantity: Number(form.package_quantity) || 1,
          package_unit: form.package_unit || "UNIDADE",
          active: true,
          has_variants: hasVariants,
        })
        .select("id")
        .single();

      if (productError) {
        throw new Error(productError.message);
      }

      const uploadedPhotos = await uploadProductPhotos(product.id);

      if (uploadedPhotos.length > 0) {
        const { error: imageInsertError } = await supabase
          .from("product_images")
          .insert(
            uploadedPhotos.map((photo) => ({
              product_id: product.id,
              image_url: photo.image_url,
              image_type: photo.image_type,
              source: "upload",
              is_primary: photo.is_primary,
              position: photo.position,
            }))
          );

        if (imageInsertError) {
          throw new Error(
            `Produto criado, mas houve erro ao registrar as fotos: ${imageInsertError.message}`
          );
        }

        const primaryPhoto =
          uploadedPhotos.find((photo) => photo.is_primary) ?? uploadedPhotos[0];

        const { error: primaryImageError } = await supabase
          .from("products")
          .update({
            main_image_url: primaryPhoto.image_url,
          })
          .eq("id", product.id);

        if (primaryImageError) {
          throw new Error(
            `Produto e fotos foram criados, mas não foi possível definir a foto principal: ${primaryImageError.message}`
          );
        }
      }


      if (hasVariants) {
        for (const variant of variants) {
          const { data: savedVariant, error: variantError } = await supabase
            .from("product_variants")
            .insert({
              product_id: product.id, name: variant.name,
              variation_type: variant.variation_type || "Cor",
              sku: variant.sku || null, barcode: variant.barcode || null,
              color: variant.color || null,
              sale_price: variant.sale_price ? Number(variant.sale_price) : null,
              active: true,
            })
            .select("id").single();
          if (variantError || !savedVariant) throw new Error(`Erro ao criar variação ${variant.name}: ${variantError?.message || "sem retorno"}`);
          await uploadVariantPhotos(product.id, savedVariant.id, variant);
        }
      }

      setFeedback("Produto cadastrado. Abrindo a edição para gerar as imagens profissionais com IA...");
      alert(
        uploadedPhotos.length > 0
          ? "Produto e fotos cadastrados com sucesso!"
          : "Produto cadastrado com sucesso!"
      );

      router.push(`/produtos/${product.id}/editar`);
      router.refresh();
    } catch (error) {
      console.error("Erro ao cadastrar produto:", error);

      alert(
        error instanceof Error
          ? `Erro ao cadastrar produto: ${error.message}`
          : "Erro inesperado ao cadastrar produto."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="page-container">
        <header className="page-header">
          <button
            type="button"
            className="back-button"
            onClick={() => router.back()}
          >
            ← Voltar
          </button>

          <div className="eyebrow">CATÁLOGO INTERNO</div>
          <h1>Novo produto</h1>
          <p>Cadastre as informações comerciais e técnicas do produto.</p>
        </header>

        <form onSubmit={handleSubmit} className="product-form">
          <section className="form-section">
            <div className="section-heading">
              <div>
                <h2>Informações principais</h2>
                <p>Identificação e organização do produto no catálogo.</p>
              </div>
            </div>

            <div className="form-grid">
              <Field label="Nome do produto *">
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Ex.: Caderno Disco 80 Folhas"
                  autoFocus
                />
              </Field>

              <Field label="Categoria">
                <select
                  name="category_id"
                  value={form.category_id}
                  onChange={handleChange}
                >
                  <option value="">Selecione...</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Código interno">
                <input
                  name="internal_code"
                  value={form.internal_code}
                  onChange={handleChange}
                  placeholder="Ex.: 73755"
                />
              </Field>

              <Field label="SKU">
                <input
                  name="sku"
                  value={form.sku}
                  onChange={handleChange}
                  placeholder="Ex.: CAMEL006"
                />
              </Field>

              <Field label="Código de barras / EAN">
                <input
                  name="barcode"
                  value={form.barcode}
                  onChange={handleChange}
                  placeholder="Ex.: 7908267035700"
                  inputMode="numeric"
                />
              </Field>

              <Field label="Material">
                <input
                  name="material"
                  value={form.material}
                  onChange={handleChange}
                  placeholder="Ex.: Papel 75 GSM"
                />
              </Field>
            </div>
          </section>

          <section className="form-section">
            <div className="section-heading">
              <div>
                <h2>Fotos do produto</h2>
                <p>
                  Envie fotos reais. Elas também serão a base para a geração
                  automática de imagens com IA.
                </p>
              </div>

              <span className="photo-counter">
                {selectedPhotosCount}/4 fotos
              </span>
            </div>

            <div className="photo-grid">
              {photos.map((photo) => (
                <div className="photo-card" key={photo.key}>
                  <div className="photo-preview">
                    {photo.preview ? (
                      <img src={photo.preview} alt={photo.title} />
                    ) : (
                      <div className="photo-empty">
                        <span className="photo-icon">＋</span>
                        <strong>{photo.title}</strong>
                        <small>{photo.description}</small>
                      </div>
                    )}
                  </div>

                  <div className="photo-card-footer">
                    <label className="upload-button">
                      {photo.file ? "Trocar foto" : "Selecionar foto"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) =>
                          handlePhotoChange(photo.key, event)
                        }
                      />
                    </label>

                    {photo.file && (
                      <button
                        type="button"
                        className="remove-photo"
                        onClick={() => removePhoto(photo.key)}
                      >
                        Remover
                      </button>
                    )}
                  </div>

                  {photo.file && (
                    <div className="file-name" title={photo.file.name}>
                      {photo.file.name}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="ai-banner">
              <div>
                <span className="ai-badge">IA</span>
                <strong>Preparado para geração automática</strong>
                <p>
                  Após cadastrar o produto, abriremos automaticamente a edição para gerar as fotos profissionais com IA.
                </p>
              </div>

              <span className="ai-next">Disponível após cadastrar</span>
            </div>
          </section>

          <section className="form-section">
            <div className="section-heading">
              <div>
                <h2>Variações do produto</h2>
                <p>Use para cores, tamanhos, modelos ou outras opções. Cada variação terá fotos próprias e IA separada.</p>
              </div>
              <span className="photo-counter">{variants.length} variação(ões)</span>
            </div>

            <div className="variant-toggle">
              <div><strong>Este produto possui variações?</strong><p>Ao selecionar Sim, cadastre cada opção e envie as fotos correspondentes.</p></div>
              <div className="toggle-actions">
                <button type="button" className={!hasVariants ? "toggle active" : "toggle"} onClick={() => setHasVariants(false)}>Não</button>
                <button type="button" className={hasVariants ? "toggle active" : "toggle"} onClick={() => setHasVariants(true)}>Sim</button>
              </div>
            </div>

            {hasVariants && <>
              <div className="variant-create">
                <div className="variant-label">NOVA VARIAÇÃO</div>
                <h3>Adicionar opção do produto</h3>
                <div className="variant-grid">
                  <Field label="Tipo"><select value={variantDraft.variation_type} onChange={(e) => setVariantDraft(v => ({...v, variation_type:e.target.value}))}><option>Cor</option><option>Tamanho</option><option>Modelo</option><option>Estampa</option><option>Outro</option></select></Field>
                  <Field label="Nome / valor da variação *"><input value={variantDraft.name} onChange={(e) => setVariantDraft(v => ({...v, name:e.target.value}))} placeholder="Ex.: Rosa" /></Field>
                  <Field label="SKU da variação"><input value={variantDraft.sku} onChange={(e) => setVariantDraft(v => ({...v, sku:e.target.value}))} placeholder="Ex.: CAD-001-ROSA" /></Field>
                  <Field label="EAN / código de barras"><input value={variantDraft.barcode} onChange={(e) => setVariantDraft(v => ({...v, barcode:e.target.value}))} /></Field>
                  <Field label="Cor (opcional)"><input value={variantDraft.color} onChange={(e) => setVariantDraft(v => ({...v, color:e.target.value}))} placeholder="Ex.: Rosa glitter" /></Field>
                  <Field label="Preço próprio (R$)"><input type="number" step="0.01" min="0" value={variantDraft.sale_price} onChange={(e) => setVariantDraft(v => ({...v, sale_price:e.target.value}))} placeholder="Vazio = preço do produto" /></Field>
                </div>
                <button type="button" className="add-variant" onClick={addVariant}>+ Adicionar variação</button>
              </div>

              {variants.length === 0 ? <div className="variant-empty"><strong>Nenhuma variação cadastrada ainda.</strong><span>Exemplo: Cor → Rosa, Azul, Verde.</span></div> : variants.map((variant) => <div className="variant-card" key={variant.tempId}>
                <div className="variant-card-head"><div><span>{variant.variation_type}</span><h3>{variant.name}</h3><small>{variant.sku || "Sem SKU específico"}</small></div><button type="button" className="remove-photo" onClick={() => removeVariant(variant.tempId)}>Remover variação</button></div>
                <div className="variant-photo-title"><strong>Fotos reais desta variação</strong><span>{variant.photos.filter(p => p.file).length}/4 fotos</span></div>
                <div className="photo-grid">
                  {variant.photos.map((photo) => <div className="photo-card" key={photo.key}><div className="photo-preview">{photo.preview ? <img src={photo.preview} alt={`${variant.name} - ${photo.title}`} /> : <div className="photo-empty"><span className="photo-icon">＋</span><strong>{photo.title}</strong><small>{photo.description}</small></div>}</div><div className="photo-card-footer"><label className="upload-button">{photo.file ? "Trocar foto" : "Selecionar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleVariantPhotoChange(variant.tempId, photo.key, e.target.files?.[0])}/></label></div></div>)}
                </div>
                <div className="ai-banner"><div><span className="ai-badge">IA</span><strong>IA exclusiva da variação {variant.name}</strong><p>Após cadastrar, você será levado à edição para gerar as 4 fotos profissionais usando somente estas referências.</p></div><span className="ai-next">Disponível após cadastrar</span></div>
              </div>)}
            </>}
            {feedback && <div className="inline-feedback">{feedback}</div>}
          </section>

          <section className="form-section">
            <div className="section-heading">
              <div>
                <h2>Medidas e embalagem</h2>
                <p>Esses campos poderão ser alterados posteriormente.</p>
              </div>
            </div>

            <div className="form-grid form-grid-four">
              <Field label="Largura (cm)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="width_cm"
                  value={form.width_cm}
                  onChange={handleChange}
                  placeholder="0,00"
                />
              </Field>

              <Field label="Altura (cm)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="height_cm"
                  value={form.height_cm}
                  onChange={handleChange}
                  placeholder="0,00"
                />
              </Field>

              <Field label="Profundidade (cm)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="depth_cm"
                  value={form.depth_cm}
                  onChange={handleChange}
                  placeholder="0,00"
                />
              </Field>

              <Field label="Peso (g)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="weight_g"
                  value={form.weight_g}
                  onChange={handleChange}
                  placeholder="0,00"
                />
              </Field>

              <Field label="Quantidade na embalagem">
                <input
                  type="number"
                  min="1"
                  name="package_quantity"
                  value={form.package_quantity}
                  onChange={handleChange}
                />
              </Field>

              <Field label="Unidade da embalagem">
                <select
                  name="package_unit"
                  value={form.package_unit}
                  onChange={handleChange}
                >
                  <option value="UNIDADE">Unidade</option>
                  <option value="UNIDADES">Unidades</option>
                  <option value="PACOTE">Pacote</option>
                  <option value="CAIXA">Caixa</option>
                  <option value="POTE">Pote</option>
                  <option value="KIT">Kit</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="form-section">
            <div className="section-heading">
              <div>
                <h2>Descrição do catálogo</h2>
                <p>Texto e especificações exibidos na ficha do produto.</p>
              </div>
            </div>

            <Field label="Descrição">
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={6}
                placeholder="Descrição completa do produto..."
              />
            </Field>

            <Field label="Especificações / informações adicionais">
              <textarea
                name="specifications"
                value={form.specifications}
                onChange={handleChange}
                rows={4}
                placeholder="Ex.: 75 GSM, 4 divisórias, cores sortidas..."
              />
            </Field>
          </section>

          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => router.back()}
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={loading}
            >
              {loading ? "Salvando produto..." : "Cadastrar produto"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .page-shell {
          min-height: 100vh;
          background: #f8f6f3;
          padding: 42px 34px 70px;
          color: #271b17;
        }

        .page-container {
          max-width: 1120px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 26px;
        }

        .back-button {
          appearance: none;
          border: 0;
          background: transparent;
          color: #8a2a18;
          font-size: 14px;
          font-weight: 800;
          padding: 0;
          margin-bottom: 24px;
          cursor: pointer;
        }

        .eyebrow {
          color: #ef7a00;
          font-size: 12px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: 2px;
          margin-bottom: 10px;
        }

        h1 {
          margin: 0;
          color: #281d19;
          font-size: clamp(32px, 4vw, 44px);
          line-height: 1.05;
          letter-spacing: -1.5px;
        }

        .page-header p {
          margin: 10px 0 0;
          color: #746b66;
          font-size: 15px;
        }

        .product-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .form-section {
          background: #ffffff;
          border: 1px solid #e8e1dc;
          border-radius: 18px;
          padding: 26px;
          box-shadow: 0 8px 26px rgba(76, 50, 38, 0.035);
        }

        .section-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 22px;
          padding-bottom: 18px;
          border-bottom: 1px solid #eee8e3;
        }

        .section-heading h2 {
          margin: 0;
          font-size: 18px;
          color: #2a1c18;
        }

        .section-heading p {
          margin: 5px 0 0;
          font-size: 13px;
          color: #8a807a;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          column-gap: 18px;
        }

        .form-grid-four {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .photo-counter {
          flex: 0 0 auto;
          background: #fff3e7;
          color: #9a371e;
          border: 1px solid #f1d7c3;
          border-radius: 999px;
          padding: 7px 11px;
          font-size: 12px;
          font-weight: 900;
        }

        .photo-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .photo-card {
          min-width: 0;
          border: 1px solid #e9e1dc;
          border-radius: 14px;
          overflow: hidden;
          background: #fcfaf8;
        }

        .photo-preview {
          position: relative;
          aspect-ratio: 1 / 1;
          background:
            radial-gradient(circle at 50% 35%, rgba(239, 122, 0, 0.08), transparent 38%),
            #f8f3ee;
          border-bottom: 1px solid #eee6df;
        }

        .photo-preview img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
          background: #fff;
        }

        .photo-empty {
          height: 100%;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          box-sizing: border-box;
        }

        .photo-empty strong {
          font-size: 13px;
          color: #3b2b24;
        }

        .photo-empty small {
          margin-top: 7px;
          color: #8c827c;
          font-size: 11px;
          line-height: 1.45;
        }

        .photo-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          margin-bottom: 12px;
          background: #fff0e3;
          color: #ef7a00;
          font-size: 22px;
          font-weight: 600;
        }

        .photo-card-footer {
          display: flex;
          gap: 8px;
          padding: 11px;
        }

        .upload-button,
        .remove-photo {
          min-height: 36px;
          border-radius: 9px;
          padding: 0 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
          box-sizing: border-box;
        }

        .upload-button {
          flex: 1;
          background: #ef7a00;
          border: 1px solid #ef7a00;
          color: #fff;
        }

        .upload-button input {
          display: none;
        }

        .remove-photo {
          border: 1px solid #eadbd4;
          background: #fff;
          color: #8a2a18;
        }

        .file-name {
          padding: 0 11px 11px;
          color: #8b817a;
          font-size: 10px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ai-banner {
          margin-top: 18px;
          border: 1px solid #efddcf;
          border-radius: 14px;
          background: linear-gradient(90deg, #fff9f3, #fff);
          padding: 16px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .ai-banner strong {
          color: #402820;
          font-size: 13px;
        }

        .ai-banner p {
          margin: 5px 0 0;
          color: #81766f;
          font-size: 12px;
        }

        .ai-badge {
          display: inline-flex;
          padding: 4px 7px;
          margin-right: 8px;
          border-radius: 7px;
          background: #8a2312;
          color: white;
          font-size: 10px;
          font-weight: 900;
        }

        .ai-button {
          flex: 0 0 auto;
          min-height: 40px;
          padding: 0 15px;
          border: 1px solid #dfd4cc;
          border-radius: 10px;
          background: #f2eeeb;
          color: #9b918b;
          font-weight: 900;
          cursor: not-allowed;
        }

        .variant-toggle { display:flex; justify-content:space-between; align-items:center; gap:18px; padding:18px; border:1px solid #eadfd8; border-radius:14px; background:#fcfaf8; margin-bottom:16px; }
        .variant-toggle strong { font-size:13px; } .variant-toggle p { margin:5px 0 0; color:#81766f; font-size:12px; }
        .toggle-actions { display:flex; gap:8px; } .toggle { min-width:72px; height:40px; border:1px solid #ddd4ce; background:#fff; border-radius:10px; font-weight:900; color:#6e625c; cursor:pointer; }
        .toggle.active { background:#ef7a00; border-color:#ef7a00; color:#fff; }
        .variant-create { border:1px solid #f0d2bb; background:#fffaf5; border-radius:15px; padding:20px; margin-bottom:16px; }
        .variant-label { color:#ef7a00; font-size:10px; font-weight:900; letter-spacing:1px; } .variant-create h3 { margin:5px 0 16px; font-size:16px; }
        .variant-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0 16px; }
        .add-variant { border:0; border-radius:10px; background:#9f2d1b; color:#fff; min-height:40px; padding:0 15px; font-weight:900; cursor:pointer; }
        .variant-empty { display:flex; flex-direction:column; align-items:center; gap:5px; border:1px dashed #dfd4cc; border-radius:14px; padding:28px; color:#766b65; font-size:12px; }
        .variant-card { border:1px solid #eadfd8; border-radius:16px; padding:20px; margin-top:16px; background:#fff; }
        .variant-card-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; padding-bottom:15px; border-bottom:1px solid #eee8e3; }
        .variant-card-head span { color:#ef7a00; font-size:10px; font-weight:900; text-transform:uppercase; } .variant-card-head h3 { margin:3px 0; font-size:20px; } .variant-card-head small { color:#8a807a; }
        .variant-photo-title { display:flex; justify-content:space-between; margin-bottom:12px; font-size:12px; color:#5c514c; }
        .ai-next { flex:0 0 auto; padding:10px 13px; border-radius:10px; background:#f2eeeb; color:#8f837d; font-size:11px; font-weight:900; }
        .inline-feedback { margin-top:14px; padding:12px 14px; border-radius:10px; background:#fff3e7; border:1px solid #f1d7c3; color:#8a2a18; font-size:12px; font-weight:700; }

        :global(input),
        :global(select),
        :global(textarea) {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #ddd6d1;
          background: #fff;
          padding: 13px 14px;
          border-radius: 10px;
          font-size: 14px;
          color: #2a211d;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        :global(input::placeholder),
        :global(textarea::placeholder) {
          color: #aaa29d;
        }

        :global(input:focus),
        :global(select:focus),
        :global(textarea:focus) {
          border-color: #ef7a00;
          box-shadow: 0 0 0 3px rgba(239, 122, 0, 0.1);
        }

        :global(textarea) {
          resize: vertical;
          min-height: 110px;
          font-family: inherit;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding-top: 4px;
        }

        .secondary-button,
        .primary-button {
          min-height: 46px;
          padding: 0 21px;
          border-radius: 11px;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 0.15s ease, opacity 0.15s ease;
        }

        .secondary-button {
          border: 1px solid #ded6d0;
          background: #ffffff;
          color: #443a35;
        }

        .primary-button {
          border: 1px solid #ef7a00;
          background: #ef7a00;
          color: white;
          box-shadow: 0 8px 18px rgba(239, 122, 0, 0.18);
        }

        .secondary-button:hover,
        .primary-button:hover {
          transform: translateY(-1px);
        }

        .secondary-button:disabled,
        .primary-button:disabled {
          cursor: not-allowed;
          opacity: 0.6;
          transform: none;
        }

        @media (max-width: 920px) {
          .form-grid-four,
          .photo-grid,
          .variant-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 680px) {
          .page-shell {
            padding: 26px 16px 46px;
          }

          .form-section {
            padding: 20px;
            border-radius: 15px;
          }

          .form-grid,
          .form-grid-four,
          .photo-grid,
          .variant-grid {
            grid-template-columns: 1fr;
          }

          .section-heading,
          .ai-banner,
          .variant-toggle {
            flex-direction: column;
          }

          .ai-button {
            width: 100%;
          }

          .form-actions {
            flex-direction: column-reverse;
          }

          .secondary-button,
          .primary-button {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 18,
      }}
    >
      <span
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 800,
          color: "#5c514c",
          marginBottom: 7,
        }}
      >
        {label}
      </span>

      {children}
    </label>
  );
}
