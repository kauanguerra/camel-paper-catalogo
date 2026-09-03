"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Category = {
  id: string;
  name: string;
};

type PhotoSlotKey = "front" | "back" | "product" | "detail";

type ExistingImage = {
  id: string;
  image_url: string;
  image_type: string | null;
  position: number;
  is_primary: boolean;
  source?: string | null;
  catalog_slot?: PhotoSlotKey | null;
  approved?: boolean;
  variant_id?: string | null;
};

type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  variation_type: string;
  sku: string;
  barcode: string;
  color: string;
  sale_price: string;
  active: boolean;
};

type VariantDraft = {
  name: string;
  variation_type: string;
  sku: string;
  barcode: string;
  color: string;
  sale_price: string;
  active: boolean;
};

type PhotoSlot = {
  key: PhotoSlotKey;
  title: string;
  description: string;
  existing: ExistingImage | null;
  file: File | null;
  preview: string | null;
  removeExisting: boolean;
};

type AiFeedback = {
  type: "success" | "error" | "info";
  message: string;
};

const AI_GENERATION_STEPS = [
  "Analisando as fotos de referência...",
  "Preservando formato, cores e detalhes...",
  "Preparando iluminação de estúdio...",
  "Refinando fundo e enquadramento...",
  "Finalizando a foto profissional...",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const EMPTY_SLOTS: Omit<PhotoSlot, "existing" | "file" | "preview" | "removeExisting">[] = [
  {
    key: "front",
    title: "Frente da embalagem",
    description: "Foto principal e mais importante do produto.",
  },
  {
    key: "back",
    title: "Verso da embalagem",
    description: "Ajuda a conferir EAN, informações e especificações.",
  },
  {
    key: "product",
    title: "Produto fora da embalagem",
    description: "Mostre o produto real sempre que for possível.",
  },
  {
    key: "detail",
    title: "Detalhe",
    description: "Foto complementar, acabamento, ponta, mecanismo etc.",
  },
];

type CommercialVisibility = {
  sku: boolean;
  internal_code: boolean;
  barcode: boolean;
  description: boolean;
  material: boolean;
  dimensions: boolean;
  weight: boolean;
  package: boolean;
  specifications: boolean;
  variants: boolean;
  price: boolean;
};

const DEFAULT_COMMERCIAL_VISIBILITY: CommercialVisibility = {
  sku: true,
  internal_code: true,
  barcode: true,
  description: true,
  material: true,
  dimensions: true,
  weight: true,
  package: true,
  specifications: true,
  variants: true,
  price: true,
};

export default function EditarProdutoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = params.id;

  const [categories, setCategories] = useState<Category[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiGeneratingSlot, setAiGeneratingSlot] = useState<PhotoSlotKey | null>(null);
  const [aiGenerationStep, setAiGenerationStep] = useState(0);
  const [aiFeedback, setAiFeedback] = useState<Record<PhotoSlotKey, AiFeedback | null>>({
    front: null,
    back: null,
    product: null,
    detail: null,
  });
  const [catalogImages, setCatalogImages] = useState<Record<PhotoSlotKey, ExistingImage | null>>({
    front: null,
    back: null,
    product: null,
    detail: null,
  });
  const [previewImage, setPreviewImage] = useState<ExistingImage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [commercialVisibility, setCommercialVisibility] =
    useState<CommercialVisibility>(DEFAULT_COMMERCIAL_VISIBILITY);

  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantDraft, setVariantDraft] = useState<VariantDraft>({
    name: "",
    variation_type: "Cor",
    sku: "",
    barcode: "",
    color: "",
    sale_price: "",
    active: true,
  });
  const [savingVariant, setSavingVariant] = useState(false);
  const [variantFeedback, setVariantFeedback] = useState("");
  const [variantUploading, setVariantUploading] = useState<string | null>(null);
  const [variantAiGenerating, setVariantAiGenerating] = useState<string | null>(null);
  const [variantImages, setVariantImages] = useState<Record<string, ExistingImage[]>>({});

  const [photos, setPhotos] = useState<PhotoSlot[]>(
    EMPTY_SLOTS.map((slot) => ({
      ...slot,
      existing: null,
      file: null,
      preview: null,
      removeExisting: false,
    }))
  );

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
    sale_price: "",
    commercial_variants: "",
    commercial_highlights: "",
    active: true,
  });

  useEffect(() => {
    if (!productId) return;

    async function loadData() {
      setPageLoading(true);
      setLoadError("");

      const [categoriesResult, productResult, imagesResult, variantsResult] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name")
          .eq("active", true)
          .order("name"),

        supabase
          .from("products")
          .select(
            `
            id,
            name,
            category_id,
            internal_code,
            sku,
            barcode,
            description,
            specifications,
            width_cm,
            height_cm,
            depth_cm,
            weight_g,
            material,
            package_quantity,
            package_unit,
            sale_price,
            commercial_visibility,
            commercial_variants,
            commercial_highlights,
            has_variants,
            active,
            main_image_url
          `
          )
          .eq("id", productId)
          .single(),

        supabase
          .from("product_images")
          .select("id, image_url, image_type, position, is_primary, source, catalog_slot, approved, variant_id")
          .eq("product_id", productId)
          .order("position"),

        supabase
          .from("product_variants")
          .select("id, product_id, name, variation_type, sku, barcode, color, sale_price, active")
          .eq("product_id", productId)
          .order("created_at"),
      ]);

      if (categoriesResult.error) {
        console.error("Erro ao carregar categorias:", categoriesResult.error);
      } else {
        setCategories(categoriesResult.data || []);
      }

      if (productResult.error || !productResult.data) {
        console.error("Erro ao carregar produto:", productResult.error);
        setLoadError("Não foi possível carregar este produto.");
        setPageLoading(false);
        return;
      }

      const product = productResult.data;

      setForm({
        name: product.name || "",
        category_id: product.category_id || "",
        internal_code: product.internal_code || "",
        sku: product.sku || "",
        barcode: product.barcode || "",
        description: product.description || "",
        specifications: product.specifications || "",
        width_cm: product.width_cm?.toString() || "",
        height_cm: product.height_cm?.toString() || "",
        depth_cm: product.depth_cm?.toString() || "",
        weight_g: product.weight_g?.toString() || "",
        material: product.material || "",
        package_quantity: product.package_quantity?.toString() || "1",
        package_unit: product.package_unit || "UNIDADE",
        sale_price:
          product.sale_price !== null && product.sale_price !== undefined
            ? Number(product.sale_price).toFixed(2)
            : "",
        commercial_variants: product.commercial_variants || "",
        commercial_highlights: product.commercial_highlights || "",
        active: Boolean(product.active),
      });

      setCommercialVisibility({
        ...DEFAULT_COMMERCIAL_VISIBILITY,
        ...(product.commercial_visibility || {}),
      });

      const loadedVariants = (variantsResult.data || []).map((variant) => ({
        ...variant,
        name: variant.name || "",
        variation_type: variant.variation_type || "Cor",
        sku: variant.sku || "",
        barcode: variant.barcode || "",
        color: variant.color || "",
        sale_price:
          variant.sale_price !== null && variant.sale_price !== undefined
            ? Number(variant.sale_price).toFixed(2)
            : "",
        active: Boolean(variant.active),
      })) as ProductVariant[];

      setVariants(loadedVariants);
      setHasVariants(Boolean(product.has_variants) || loadedVariants.length > 0);

      if (variantsResult.error) {
        console.error("Erro ao carregar variações:", variantsResult.error);
      }

      if (imagesResult.error) {
        console.error("Erro ao carregar fotos:", imagesResult.error);
      }

      const existingImages = (imagesResult.data || []) as ExistingImage[];
      const mainProductImages = existingImages.filter((image) => !image.variant_id);

      const groupedVariantImages = existingImages
        .filter((image) => Boolean(image.variant_id))
        .reduce<Record<string, ExistingImage[]>>((acc, image) => {
          const key = image.variant_id as string;
          acc[key] = [...(acc[key] || []), image];
          return acc;
        }, {});
      setVariantImages(groupedVariantImages);

      const aiImages = mainProductImages.filter(
        (image) => image.source === "ai" || image.image_type === "ai_catalog"
      );

      const pickCatalogImage = (slot: PhotoSlotKey) => {
        const slotImages = aiImages.filter(
          (image) =>
            image.catalog_slot === slot ||
            (slot === "front" && !image.catalog_slot && image.image_type === "ai_catalog")
        );

        return (
          slotImages.find((image) => image.approved) ||
          slotImages[slotImages.length - 1] ||
          null
        );
      };

      setCatalogImages({
        front: pickCatalogImage("front"),
        back: pickCatalogImage("back"),
        product: pickCatalogImage("product"),
        detail: pickCatalogImage("detail"),
      });

      setPhotos(
        EMPTY_SLOTS.map((slot) => {
          let matched = mainProductImages.find(
            (image) => image.image_type === slot.key
          );

          if (!matched && slot.key === "front") {
            matched =
              mainProductImages.find((image) => image.is_primary) ||
              mainProductImages[0];
          }

          return {
            ...slot,
            existing: matched || null,
            file: null,
            preview: null,
            removeExisting: false,
          };
        })
      );

      setPageLoading(false);
    }

    loadData();
  }, [productId]);

  useEffect(() => {
    if (!aiGeneratingSlot) {
      setAiGenerationStep(0);
      return;
    }

    setAiGenerationStep(0);

    const interval = window.setInterval(() => {
      setAiGenerationStep((current) =>
        Math.min(current + 1, AI_GENERATION_STEPS.length - 1)
      );
    }, 2200);

    return () => window.clearInterval(interval);
  }, [aiGeneratingSlot]);

  const visiblePhotosCount = useMemo(
    () =>
      photos.filter(
        (photo) =>
          photo.file || (photo.existing && !photo.removeExisting)
      ).length,
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

  function toggleCommercialVisibility(key: keyof CommercialVisibility) {
    setCommercialVisibility((current) => ({
      ...current,
      [key]: !current[key],
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
          removeExisting: Boolean(photo.existing),
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
          removeExisting: Boolean(photo.existing),
        };
      })
    );
  }

  function undoRemovePhoto(slotKey: PhotoSlotKey) {
    setPhotos((current) =>
      current.map((photo) =>
        photo.key === slotKey
          ? {
              ...photo,
              removeExisting: false,
            }
          : photo
      )
    );
  }

  function getStoragePathFromPublicUrl(url: string) {
    const marker = "/storage/v1/object/public/product-images/";
    const index = url.indexOf(marker);

    if (index === -1) return null;

    return decodeURIComponent(url.slice(index + marker.length));
  }

  async function deleteExistingImage(image: ExistingImage) {
    const storagePath = getStoragePathFromPublicUrl(image.image_url);

    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from("product-images")
        .remove([storagePath]);

      if (storageError) {
        console.warn("Não foi possível remover o arquivo do Storage:", storageError);
      }
    }

    const { error: rowError } = await supabase
      .from("product_images")
      .delete()
      .eq("id", image.id);

    if (rowError) {
      throw new Error(
        `Não foi possível remover uma das fotos antigas: ${rowError.message}`
      );
    }
  }

  async function uploadPhoto(
    slot: PhotoSlot,
    position: number,
    isPrimary: boolean
  ) {
    if (!slot.file) return null;

    const file = slot.file;
    const originalExtension = file.name.split(".").pop()?.toLowerCase();

    const extension =
      originalExtension &&
      ["jpg", "jpeg", "png", "webp"].includes(originalExtension)
        ? originalExtension
        : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
        ? "webp"
        : "jpg";

    const filePath = `${productId}/${slot.key}-${Date.now()}-${position}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      throw new Error(
        `Erro ao enviar a foto "${slot.title}": ${uploadError.message}`
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(filePath);

    const imageUrl = publicUrlData.publicUrl;

    const { data: inserted, error: insertError } = await supabase
      .from("product_images")
      .insert({
        product_id: productId,
        image_url: imageUrl,
        image_type: slot.key,
        source: "upload",
        is_primary: isPrimary,
        position,
      })
      .select("id, image_url, image_type, position, is_primary, source, catalog_slot, approved, variant_id")
      .single();

    if (insertError) {
      throw new Error(
        `A foto foi enviada, mas não foi registrada: ${insertError.message}`
      );
    }

    return inserted as ExistingImage;
  }

  function base64ToBlob(base64: string, mimeType = "image/png") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: mimeType });
  }

  async function handleGenerateAiImage(targetSlot: PhotoSlotKey) {
    const slotPriority: PhotoSlotKey[] = ["front", "back", "product", "detail"];

    setAiFeedback((current) => ({
      ...current,
      [targetSlot]: null,
    }));

    const referenceUrls = slotPriority
      .map((slotKey) => {
        const photo = photos.find((item) => item.key === slotKey);

        if (
          !photo ||
          !photo.existing ||
          photo.removeExisting ||
          photo.file ||
          !photo.existing.image_url
        ) {
          return null;
        }

        return photo.existing.image_url;
      })
      .filter((url): url is string => Boolean(url))
      .slice(0, 4);

    if (referenceUrls.length === 0) {
      setAiFeedback((current) => ({
        ...current,
        [targetSlot]: {
          type: "error",
          message:
            "Salve pelo menos uma foto real do produto antes de gerar uma imagem profissional.",
        },
      }));
      return;
    }

    const hasUnsavedPhotos = photos.some((photo) => Boolean(photo.file));

    if (hasUnsavedPhotos) {
      setAiFeedback((current) => ({
        ...current,
        [targetSlot]: {
          type: "info",
          message:
            "Existem novas fotos ainda não salvas. Salve as alterações para que a IA use essas referências.",
        },
      }));
      return;
    }

    setAiGeneratingSlot(targetSlot);

    try {
      const response = await fetch("/api/ai/product-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productName: form.name,
          sku: form.sku,
          imageUrls: referenceUrls,
          catalogSlot: targetSlot,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Não foi possível gerar a imagem.");
      }

      if (!result?.imageBase64) {
        throw new Error("A API não retornou a imagem gerada.");
      }

      const blob = base64ToBlob(
        result.imageBase64,
        result.mimeType || "image/png"
      );

      const storagePath = `${productId}/ai-${targetSlot}-${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(storagePath, blob, {
          contentType: "image/png",
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(
          `A imagem foi gerada, mas não foi salva no Storage: ${uploadError.message}`
        );
      }

      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(storagePath);

      const positionMap: Record<PhotoSlotKey, number> = {
        front: 100,
        back: 101,
        product: 102,
        detail: 103,
      };

      const { data: insertedImage, error: insertError } = await supabase
        .from("product_images")
        .insert({
          product_id: productId,
          image_url: publicUrlData.publicUrl,
          image_type: "ai_catalog",
          source: "ai",
          catalog_slot: targetSlot,
          approved: false,
          is_primary: false,
          position: positionMap[targetSlot],
        })
        .select(
          "id, image_url, image_type, position, is_primary, source, catalog_slot, approved, variant_id"
        )
        .single();

      if (insertError) {
        throw new Error(
          `A imagem foi salva, mas não foi registrada no produto: ${insertError.message}`
        );
      }

      setCatalogImages((current) => ({
        ...current,
        [targetSlot]: insertedImage as ExistingImage,
      }));

      setAiFeedback((current) => ({
        ...current,
        [targetSlot]: {
          type: "success",
          message: "Foto gerada com sucesso. Confira o resultado e aprove quando estiver correta.",
        },
      }));
    } catch (error) {
      console.error("Erro ao gerar foto com IA:", error);

      setAiFeedback((current) => ({
        ...current,
        [targetSlot]: {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Erro inesperado ao gerar foto com IA.",
        },
      }));
    } finally {
      setAiGeneratingSlot(null);
    }
  }

  async function handleApproveCatalogImage(slot: PhotoSlotKey) {
    const image = catalogImages[slot];
    if (!image) return;

    setAiFeedback((current) => ({
      ...current,
      [slot]: null,
    }));

    try {
      const { error: resetSlotError } = await supabase
        .from("product_images")
        .update({ approved: false })
        .eq("product_id", productId)
        .is("variant_id", null)
        .eq("source", "ai")
        .eq("catalog_slot", slot);

      if (resetSlotError) {
        throw new Error(resetSlotError.message);
      }

      const { error: approveError } = await supabase
        .from("product_images")
        .update({ approved: true })
        .eq("id", image.id);

      if (approveError) {
        throw new Error(approveError.message);
      }

      if (slot === "front") {
        const { error: resetPrimaryError } = await supabase
          .from("product_images")
          .update({ is_primary: false })
          .eq("product_id", productId)
          .is("variant_id", null);

        if (resetPrimaryError) {
          throw new Error(resetPrimaryError.message);
        }

        const { error: primaryError } = await supabase
          .from("product_images")
          .update({ is_primary: true })
          .eq("id", image.id);

        if (primaryError) {
          throw new Error(primaryError.message);
        }

        const { error: productError } = await supabase
          .from("products")
          .update({ main_image_url: image.image_url })
          .eq("id", productId);

        if (productError) {
          throw new Error(productError.message);
        }
      }

      setCatalogImages((current) => ({
        ...current,
        [slot]: current[slot]
          ? {
              ...current[slot]!,
              approved: true,
              is_primary: slot === "front" ? true : current[slot]!.is_primary,
            }
          : null,
      }));

      setAiFeedback((current) => ({
        ...current,
        [slot]: {
          type: "success",
          message:
            slot === "front"
              ? "Aprovada para o catálogo e definida como imagem principal."
              : "Aprovada para o catálogo.",
        },
      }));
    } catch (error) {
      console.error("Erro ao aprovar imagem:", error);

      setAiFeedback((current) => ({
        ...current,
        [slot]: {
          type: "error",
          message:
            error instanceof Error
              ? `Erro ao aprovar imagem: ${error.message}`
              : "Erro inesperado ao aprovar imagem.",
        },
      }));
    }
  }

  async function handleDiscardCatalogImage(slot: PhotoSlotKey) {
    const image = catalogImages[slot];
    if (!image) return;

    if (image.approved) {
      alert(
        "Esta imagem já está aprovada. Gere uma nova versão primeiro; depois você poderá aprovar a nova sem perder a atual."
      );
      return;
    }

    const confirmed = window.confirm(
      `Descartar a imagem gerada para "${getSlotTitle(slot)}"?`
    );

    if (!confirmed) return;

    try {
      await deleteExistingImage(image);

      setCatalogImages((current) => ({
        ...current,
        [slot]: null,
      }));

      setAiFeedback((current) => ({
        ...current,
        [slot]: {
          type: "info",
          message: "Imagem descartada. Você pode gerar uma nova versão quando quiser.",
        },
      }));

      if (previewImage?.id === image.id) {
        setPreviewImage(null);
      }
    } catch (error) {
      console.error("Erro ao descartar imagem:", error);

      setAiFeedback((current) => ({
        ...current,
        [slot]: {
          type: "error",
          message:
            error instanceof Error
              ? `Erro ao descartar imagem: ${error.message}`
              : "Erro inesperado ao descartar imagem.",
        },
      }));
    }
  }

  async function persistHasVariants(nextValue: boolean) {
    setHasVariants(nextValue);
    setVariantFeedback("");

    const { error } = await supabase
      .from("products")
      .update({ has_variants: nextValue })
      .eq("id", productId);

    if (error) {
      setHasVariants(!nextValue);
      setVariantFeedback(`Não foi possível alterar a opção de variações: ${error.message}`);
    }
  }

  async function addVariant() {
    if (!variantDraft.name.trim()) {
      setVariantFeedback("Informe o nome/valor da variação, por exemplo: Rosa.");
      return;
    }

    setSavingVariant(true);
    setVariantFeedback("");

    const { data, error } = await supabase
      .from("product_variants")
      .insert({
        product_id: productId,
        name: variantDraft.name.trim(),
        variation_type: variantDraft.variation_type.trim() || "Cor",
        sku: variantDraft.sku.trim() || null,
        barcode: variantDraft.barcode.trim() || null,
        color: variantDraft.color.trim() || null,
        sale_price: variantDraft.sale_price ? Number(variantDraft.sale_price) : null,
        active: variantDraft.active,
      })
      .select("id, product_id, name, variation_type, sku, barcode, color, sale_price, active")
      .single();

    if (error || !data) {
      setVariantFeedback(`Erro ao criar variação: ${error?.message || "registro não retornado"}`);
      setSavingVariant(false);
      return;
    }

    setVariants((current) => [
      ...current,
      {
        ...data,
        name: data.name || "",
        variation_type: data.variation_type || "Cor",
        sku: data.sku || "",
        barcode: data.barcode || "",
        color: data.color || "",
        sale_price:
          data.sale_price !== null && data.sale_price !== undefined
            ? Number(data.sale_price).toFixed(2)
            : "",
        active: Boolean(data.active),
      } as ProductVariant,
    ]);

    setVariantDraft({
      name: "",
      variation_type: variantDraft.variation_type || "Cor",
      sku: "",
      barcode: "",
      color: "",
      sale_price: "",
      active: true,
    });
    setVariantFeedback("Variação adicionada. Agora você pode enviar as fotos dela.");
    setSavingVariant(false);
  }

  function updateVariantLocal(id: string, field: keyof ProductVariant, value: string | boolean) {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === id ? { ...variant, [field]: value } : variant
      )
    );
  }

  async function saveVariant(variant: ProductVariant) {
    setSavingVariant(true);
    setVariantFeedback("");

    const { error } = await supabase
      .from("product_variants")
      .update({
        name: variant.name.trim(),
        variation_type: variant.variation_type.trim() || "Cor",
        sku: variant.sku.trim() || null,
        barcode: variant.barcode.trim() || null,
        color: variant.color.trim() || null,
        sale_price: variant.sale_price ? Number(variant.sale_price) : null,
        active: variant.active,
      })
      .eq("id", variant.id);

    setSavingVariant(false);
    setVariantFeedback(
      error ? `Erro ao salvar variação: ${error.message}` : `Variação "${variant.name}" salva.`
    );
  }

  async function deleteVariant(variant: ProductVariant) {
    if (!window.confirm(`Excluir a variação "${variant.name}" e todas as fotos dela?`)) return;

    setSavingVariant(true);
    setVariantFeedback("");

    const images = variantImages[variant.id] || [];
    for (const image of images) {
      const path = getStoragePathFromPublicUrl(image.image_url);
      if (path) {
        await supabase.storage.from("product-images").remove([path]);
      }
    }

    const { error } = await supabase
      .from("product_variants")
      .delete()
      .eq("id", variant.id);

    if (error) {
      setVariantFeedback(`Erro ao excluir variação: ${error.message}`);
      setSavingVariant(false);
      return;
    }

    setVariants((current) => current.filter((item) => item.id !== variant.id));
    setVariantImages((current) => {
      const next = { ...current };
      delete next[variant.id];
      return next;
    });
    setVariantFeedback("Variação excluída.");
    setSavingVariant(false);
  }

  function getVariantImage(variantId: string, slot: PhotoSlotKey, source: "upload" | "ai") {
    const images = variantImages[variantId] || [];
    const matches = images.filter((image) =>
      source === "ai"
        ? image.source === "ai" && image.catalog_slot === slot
        : image.source !== "ai" && image.image_type === slot
    );

    return (
      matches.find((image) => image.approved) ||
      matches[matches.length - 1] ||
      null
    );
  }

  async function handleVariantPhotoUpload(
    variant: ProductVariant,
    slot: PhotoSlotKey,
    file: File | undefined
  ) {
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setVariantFeedback("Use uma imagem JPG, PNG ou WEBP.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setVariantFeedback("A imagem deve ter no máximo 10 MB.");
      return;
    }

    const uploadKey = `${variant.id}-${slot}`;
    setVariantUploading(uploadKey);
    setVariantFeedback("");

    try {
      const oldImage = getVariantImage(variant.id, slot, "upload");
      const ext =
        file.name.split(".").pop()?.toLowerCase() === "png"
          ? "png"
          : file.name.split(".").pop()?.toLowerCase() === "webp"
          ? "webp"
          : "jpg";
      const path = `${productId}/variants/${variant.id}/${slot}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);

      const { data: inserted, error: insertError } = await supabase
        .from("product_images")
        .insert({
          product_id: productId,
          variant_id: variant.id,
          image_url: urlData.publicUrl,
          image_type: slot,
          source: "upload",
          catalog_slot: null,
          approved: true,
          is_primary: slot === "front",
          position: ["front", "back", "product", "detail"].indexOf(slot),
        })
        .select("id, image_url, image_type, position, is_primary, source, catalog_slot, approved, variant_id")
        .single();

      if (insertError || !inserted) throw new Error(insertError?.message || "Falha ao registrar foto.");

      if (oldImage) {
        await deleteExistingImage(oldImage);
      }

      setVariantImages((current) => ({
        ...current,
        [variant.id]: [
          ...(current[variant.id] || []).filter((image) => image.id !== oldImage?.id),
          inserted as ExistingImage,
        ],
      }));
      setVariantFeedback(`Foto "${getSlotTitle(slot)}" de "${variant.name}" salva.`);
    } catch (error) {
      setVariantFeedback(
        error instanceof Error ? `Erro ao enviar foto: ${error.message}` : "Erro ao enviar foto."
      );
    } finally {
      setVariantUploading(null);
    }
  }

  async function generateVariantAiImage(variant: ProductVariant, slot: PhotoSlotKey) {
    const refs = (variantImages[variant.id] || [])
      .filter((image) => image.source !== "ai" && image.image_url)
      .sort((a, b) => a.position - b.position)
      .map((image) => image.image_url)
      .slice(0, 4);

    if (refs.length === 0) {
      setVariantFeedback(`Envie pelo menos uma foto real da variação "${variant.name}".`);
      return;
    }

    const generationKey = `${variant.id}-${slot}`;
    setVariantAiGenerating(generationKey);
    setVariantFeedback("");

    try {
      const response = await fetch("/api/ai/product-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: `${form.name} - ${variant.variation_type}: ${variant.name}`,
          sku: variant.sku || form.sku,
          imageUrls: refs,
          catalogSlot: slot,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Não foi possível gerar a imagem.");
      if (!result?.imageBase64) throw new Error("A API não retornou a imagem gerada.");

      const blob = base64ToBlob(result.imageBase64, result.mimeType || "image/png");
      const path = `${productId}/variants/${variant.id}/ai-${slot}-${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, blob, {
          contentType: "image/png",
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);

      const { data: inserted, error: insertError } = await supabase
        .from("product_images")
        .insert({
          product_id: productId,
          variant_id: variant.id,
          image_url: urlData.publicUrl,
          image_type: "ai_catalog",
          source: "ai",
          catalog_slot: slot,
          approved: false,
          is_primary: false,
          position: 200 + ["front", "back", "product", "detail"].indexOf(slot),
        })
        .select("id, image_url, image_type, position, is_primary, source, catalog_slot, approved, variant_id")
        .single();

      if (insertError || !inserted) throw new Error(insertError?.message || "Falha ao registrar imagem.");

      setVariantImages((current) => ({
        ...current,
        [variant.id]: [...(current[variant.id] || []), inserted as ExistingImage],
      }));
      setVariantFeedback(`IA gerou a foto de "${variant.name}". Confira e aprove.`);
    } catch (error) {
      setVariantFeedback(
        error instanceof Error ? `Erro na IA: ${error.message}` : "Erro ao gerar imagem."
      );
    } finally {
      setVariantAiGenerating(null);
    }
  }

  async function approveVariantAiImage(variant: ProductVariant, slot: PhotoSlotKey) {
    const image = getVariantImage(variant.id, slot, "ai");
    if (!image) return;

    const { error: resetError } = await supabase
      .from("product_images")
      .update({ approved: false })
      .eq("variant_id", variant.id)
      .eq("source", "ai")
      .eq("catalog_slot", slot);

    if (resetError) {
      setVariantFeedback(`Erro ao aprovar: ${resetError.message}`);
      return;
    }

    const { error } = await supabase
      .from("product_images")
      .update({ approved: true })
      .eq("id", image.id);

    if (error) {
      setVariantFeedback(`Erro ao aprovar: ${error.message}`);
      return;
    }

    setVariantImages((current) => ({
      ...current,
      [variant.id]: (current[variant.id] || []).map((item) => ({
        ...item,
        approved:
          item.source === "ai" && item.catalog_slot === slot
            ? item.id === image.id
            : item.approved,
      })),
    }));
    setVariantFeedback(`Foto profissional de "${variant.name}" aprovada.`);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.name.trim()) {
      alert("Informe o nome do produto.");
      return;
    }

    setSaving(true);

    try {
      const slugBase = form.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const { error: updateError } = await supabase
        .from("products")
        .update({
          name: form.name.trim(),
          slug: slugBase,
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
          sale_price: form.sale_price ? Number(form.sale_price) : null,
          commercial_visibility: commercialVisibility,
          commercial_variants: form.commercial_variants.trim() || null,
          commercial_highlights: form.commercial_highlights.trim() || null,
          has_variants: hasVariants,
          active: form.active,
        })
        .eq("id", productId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      for (const photo of photos) {
        if (photo.existing && photo.removeExisting) {
          await deleteExistingImage(photo.existing);
        }
      }

      const uploadedImages: ExistingImage[] = [];

      for (let index = 0; index < photos.length; index++) {
        const photo = photos[index];

        if (photo.file) {
          const uploaded = await uploadPhoto(
            photo,
            index,
            photo.key === "front"
          );

          if (uploaded) {
            uploadedImages.push(uploaded);
          }
        }
      }

      const { data: finalImages, error: finalImagesError } = await supabase
        .from("product_images")
        .select("id, image_url, image_type, position, is_primary, source, catalog_slot, approved, variant_id")
        .eq("product_id", productId)
        .is("variant_id", null)
        .order("position");

      if (finalImagesError) {
        throw new Error(
          `Produto salvo, mas houve erro ao conferir as fotos: ${finalImagesError.message}`
        );
      }

      const normalizedFinalImages = (finalImages || []) as ExistingImage[];

      const primaryImage =
        normalizedFinalImages.find((image) => image.is_primary) ||
        normalizedFinalImages.find((image) => image.image_type === "front") ||
        normalizedFinalImages[0] ||
        null;

      await supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("product_id", productId);

      if (primaryImage) {
        await supabase
          .from("product_images")
          .update({ is_primary: true })
          .eq("id", primaryImage.id);
      }

      const { error: mainImageError } = await supabase
        .from("products")
        .update({
          main_image_url: primaryImage?.image_url || null,
        })
        .eq("id", productId);

      if (mainImageError) {
        throw new Error(
          `Produto salvo, mas houve erro ao atualizar a foto principal: ${mainImageError.message}`
        );
      }

      alert("Produto atualizado com sucesso!");

      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Erro ao atualizar produto:", error);

      alert(
        error instanceof Error
          ? `Erro ao atualizar produto: ${error.message}`
          : "Erro inesperado ao atualizar produto."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct() {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir este produto? Essa ação também removerá as fotos cadastradas."
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      const { data: images, error: imagesError } = await supabase
        .from("product_images")
        .select("id, image_url, image_type, position, is_primary, source, catalog_slot, approved, variant_id")
        .eq("product_id", productId);

      if (imagesError) {
        throw new Error(imagesError.message);
      }

      for (const image of (images || []) as ExistingImage[]) {
        const path = getStoragePathFromPublicUrl(image.image_url);
        if (path) {
          await supabase.storage.from("product-images").remove([path]);
        }
      }

      const { error: deleteError } = await supabase
        .from("products")
        .delete()
        .eq("id", productId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      alert("Produto excluído com sucesso.");
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Erro ao excluir produto:", error);

      alert(
        error instanceof Error
          ? `Erro ao excluir produto: ${error.message}`
          : "Erro inesperado ao excluir produto."
      );
    } finally {
      setDeleting(false);
    }
  }

  if (pageLoading) {
    return (
      <main className="state-page">
        <div>
          <strong>Carregando produto...</strong>
          <span>Buscando dados e fotos no Supabase.</span>
        </div>

        {previewImage && (
        <div
          className="image-modal-backdrop"
          onClick={() => setPreviewImage(null)}
          role="presentation"
        >
          <div
            className="image-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="image-modal-header">
              <div>
                <strong>Visualização da foto profissional</strong>
                <span>Confira detalhes, textos, formato e acabamento antes de aprovar.</span>
              </div>

              <button
                type="button"
                className="image-modal-close"
                onClick={() => setPreviewImage(null)}
              >
                ×
              </button>
            </div>

            <div className="image-modal-content">
              <img src={previewImage.image_url} alt="Prévia ampliada da imagem profissional" />
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
          .state-page {
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f8f6f3;
            color: #382a25;
          }

          .state-page div {
            display: flex;
            flex-direction: column;
            gap: 7px;
            text-align: center;
          }

          .state-page span {
            color: #81756f;
            font-size: 13px;
          }
        `}</style>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="state-page">
        <div>
          <strong>{loadError}</strong>
          <button onClick={() => router.push("/")}>Voltar aos produtos</button>
        </div>

        <style jsx>{`
          .state-page {
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f8f6f3;
            color: #382a25;
          }

          .state-page div {
            display: flex;
            flex-direction: column;
            gap: 14px;
            text-align: center;
          }

          .state-page button {
            border: 0;
            border-radius: 10px;
            background: #ef7a00;
            color: #fff;
            padding: 12px 16px;
            font-weight: 800;
            cursor: pointer;
          }
        `}</style>
      </main>
    );
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

          <div className="header-row">
            <div>
              <div className="eyebrow">CATÁLOGO INTERNO</div>
              <h1>Editar produto</h1>
              <p>
                Atualize dados, fotos, medidas e status do produto.
              </p>
            </div>

            <span className={form.active ? "status-pill active" : "status-pill"}>
              {form.active ? "● Produto ativo" : "● Produto inativo"}
            </span>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="product-form">
          <section className="form-section">
            <div className="section-heading">
              <div>
                <h2>Informações principais</h2>
                <p>Todos estes campos podem ser alterados.</p>
              </div>
            </div>

            <div className="form-grid">
              <Field label="Nome do produto *">
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Ex.: Caderno Disco 80 Folhas"
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

            <label className="active-toggle">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    active: e.target.checked,
                  }))
                }
              />
              <span>
                <strong>Produto ativo</strong>
                <small>
                  Produtos inativos continuam cadastrados, mas podem ser
                  identificados como fora de linha.
                </small>
              </span>
            </label>
          </section>

          <section className="form-section">
            <div className="section-heading">
              <div>
                <h2>Fotos do produto</h2>
                <p>
                  Troque, remova ou adicione fotos. A frente será priorizada
                  como imagem principal.
                </p>
              </div>

              <span className="photo-counter">
                {visiblePhotosCount}/4 fotos
              </span>
            </div>

            <div className="photo-grid">
              {photos.map((photo) => {
                const currentUrl =
                  photo.preview ||
                  (photo.existing && !photo.removeExisting
                    ? photo.existing.image_url
                    : null);

                return (
                  <div className="photo-card" key={photo.key}>
                    <div className="photo-preview">
                      {currentUrl ? (
                        <img src={currentUrl} alt={photo.title} />
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
                        {currentUrl ? "Trocar foto" : "Selecionar foto"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event) =>
                            handlePhotoChange(photo.key, event)
                          }
                        />
                      </label>

                      {currentUrl && (
                        <button
                          type="button"
                          className="remove-photo"
                          onClick={() => removePhoto(photo.key)}
                        >
                          Remover
                        </button>
                      )}

                      {!currentUrl &&
                        photo.existing &&
                        photo.removeExisting &&
                        !photo.file && (
                          <button
                            type="button"
                            className="undo-photo"
                            onClick={() => undoRemovePhoto(photo.key)}
                          >
                            Desfazer
                          </button>
                        )}
                    </div>

                    {photo.file && (
                      <div className="file-name" title={photo.file.name}>
                        Nova foto: {photo.file.name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="ai-banner ai-banner-live">
              <div className="ai-copy">
                <div>
                  <span className="ai-badge">IA</span>
                  <strong>Fotos profissionais do catálogo</strong>
                  <p>
                    As fotos originais acima ficam guardadas como referência interna.
                    Gere e aprove abaixo as imagens que vendedores e catálogos usarão.
                  </p>
                </div>
              </div>

              <div className="catalog-ai-grid">
                {EMPTY_SLOTS.map((slot) => {
                  const generated = catalogImages[slot.key];
                  const isGenerating = aiGeneratingSlot === slot.key;

                  return (
                    <div
                      className={`catalog-ai-card ${
                        isGenerating ? "catalog-ai-card-generating" : ""
                      }`}
                      key={`catalog-${slot.key}`}
                    >
                      <button
                        type="button"
                        className="catalog-ai-preview"
                        onClick={() => generated && setPreviewImage(generated)}
                        disabled={!generated}
                        title={generated ? "Clique para ampliar" : undefined}
                      >
                        {generated ? (
                          <img
                            key={generated.id}
                            className="catalog-generated-image"
                            src={generated.image_url}
                            alt={`Foto profissional - ${slot.title}`}
                          />
                        ) : (
                          <div className="catalog-ai-empty">
                            <span>IA</span>
                            <strong>{getSlotTitle(slot.key)}</strong>
                            <small>Ainda não gerada</small>
                          </div>
                        )}

                        {isGenerating && (
                          <div className="ai-generating-overlay" aria-live="polite">
                            <div className="ai-spinner" />
                            <strong>Criando foto profissional</strong>
                            <span>
                              {AI_GENERATION_STEPS[aiGenerationStep]}
                            </span>
                            <div className="ai-progress-track">
                              <div
                                className="ai-progress-bar"
                                style={{
                                  width: `${
                                    ((aiGenerationStep + 1) /
                                      AI_GENERATION_STEPS.length) *
                                    100
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {generated?.approved && !isGenerating && (
                          <span className="approved-badge">✓ Aprovada</span>
                        )}
                      </button>

                      <div className="catalog-ai-card-body">
                        <strong>{getSlotTitle(slot.key)}</strong>
                        <small>
                          {generated?.approved
                            ? "Esta imagem está liberada para vendedores e catálogo."
                            : generated
                            ? "Confira a imagem e aprove quando estiver correta."
                            : "Gere uma versão profissional usando as fotos originais."}
                        </small>

                        <div className="catalog-ai-actions">
                          <button
                            type="button"
                            className="generate-slot-button"
                            onClick={() => handleGenerateAiImage(slot.key)}
                            disabled={Boolean(aiGeneratingSlot) || saving || deleting}
                          >
                            {isGenerating
                              ? "Gerando..."
                              : generated
                              ? "Gerar novamente"
                              : "Gerar com IA"}
                          </button>

                          {generated && !generated.approved && (
                            <>
                              <button
                                type="button"
                                className="approve-slot-button"
                                onClick={() => handleApproveCatalogImage(slot.key)}
                                disabled={Boolean(aiGeneratingSlot)}
                              >
                                ✓ Aprovar
                              </button>

                              <button
                                type="button"
                                className="discard-slot-button"
                                onClick={() => handleDiscardCatalogImage(slot.key)}
                                disabled={Boolean(aiGeneratingSlot)}
                              >
                                Descartar
                              </button>
                            </>
                          )}
                        </div>

                        {aiFeedback[slot.key] && (
                          <div
                            className={`ai-inline-status ${aiFeedback[slot.key]!.type}`}
                            role="status"
                            aria-live="polite"
                          >
                            <span>
                              {aiFeedback[slot.key]!.type === "success"
                                ? "✓"
                                : aiFeedback[slot.key]!.type === "error"
                                ? "!"
                                : "i"}
                            </span>
                            <p>{aiFeedback[slot.key]!.message}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="catalog-note">
                <strong>Como funcionará para o vendedor:</strong>
                <span>
                  somente as fotos profissionais aprovadas aparecerão na ficha pública
                  do produto e na futura área de Catálogos. As fotos originais continuarão
                  disponíveis apenas para administração e novas gerações.
                </span>
              </div>
            </div>
          </section>

          <section className="form-section variants-section">
            <div className="section-heading">
              <div>
                <h2>Variações do produto</h2>
                <p>
                  Use quando o mesmo produto existir em cores, tamanhos, modelos ou outras opções.
                  Cada variação pode ter SKU, EAN, preço e fotos próprias para geração com IA.
                </p>
              </div>

              <span className={`variant-status ${hasVariants ? "enabled" : ""}`}>
                {hasVariants ? `${variants.length} variação(ões)` : "Sem variações"}
              </span>
            </div>

            <div className="variants-question">
              <div>
                <strong>Este produto possui variações?</strong>
                <small>
                  Selecione Sim para cadastrar cada opção separadamente e gerar fotos profissionais específicas.
                </small>
              </div>

              <div className="yes-no-buttons">
                <button
                  type="button"
                  className={!hasVariants ? "selected" : ""}
                  onClick={() => persistHasVariants(false)}
                >
                  Não
                </button>
                <button
                  type="button"
                  className={hasVariants ? "selected" : ""}
                  onClick={() => persistHasVariants(true)}
                >
                  Sim
                </button>
              </div>
            </div>

            {hasVariants && (
              <>
                <div className="new-variant-card">
                  <div className="variant-card-title">
                    <div>
                      <span>NOVA VARIAÇÃO</span>
                      <strong>Adicionar opção do produto</strong>
                    </div>
                  </div>

                  <div className="variant-fields-grid">
                    <Field label="Tipo">
                      <select
                        value={variantDraft.variation_type}
                        onChange={(e) =>
                          setVariantDraft((current) => ({
                            ...current,
                            variation_type: e.target.value,
                          }))
                        }
                      >
                        <option value="Cor">Cor</option>
                        <option value="Tamanho">Tamanho</option>
                        <option value="Modelo">Modelo</option>
                        <option value="Estampa">Estampa</option>
                        <option value="Capacidade">Capacidade</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </Field>

                    <Field label="Nome / valor da variação *">
                      <input
                        value={variantDraft.name}
                        onChange={(e) =>
                          setVariantDraft((current) => ({ ...current, name: e.target.value }))
                        }
                        placeholder="Ex.: Rosa"
                      />
                    </Field>

                    <Field label="SKU da variação">
                      <input
                        value={variantDraft.sku}
                        onChange={(e) =>
                          setVariantDraft((current) => ({ ...current, sku: e.target.value }))
                        }
                        placeholder="Ex.: CAD-001-ROSA"
                      />
                    </Field>

                    <Field label="EAN / código de barras">
                      <input
                        value={variantDraft.barcode}
                        onChange={(e) =>
                          setVariantDraft((current) => ({ ...current, barcode: e.target.value }))
                        }
                        placeholder="Código próprio da variação"
                      />
                    </Field>

                    <Field label="Cor (opcional)">
                      <input
                        value={variantDraft.color}
                        onChange={(e) =>
                          setVariantDraft((current) => ({ ...current, color: e.target.value }))
                        }
                        placeholder="Ex.: Rosa glitter"
                      />
                    </Field>

                    <Field label="Preço próprio (R$)">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={variantDraft.sale_price}
                        onChange={(e) =>
                          setVariantDraft((current) => ({ ...current, sale_price: e.target.value }))
                        }
                        placeholder="Vazio = preço do produto"
                      />
                    </Field>
                  </div>

                  <button
                    type="button"
                    className="add-variant-button"
                    onClick={addVariant}
                    disabled={savingVariant}
                  >
                    {savingVariant ? "Salvando..." : "+ Adicionar variação"}
                  </button>
                </div>

                {variantFeedback && (
                  <div className="variant-feedback" role="status">{variantFeedback}</div>
                )}

                <div className="variants-list">
                  {variants.length === 0 ? (
                    <div className="variants-empty">
                      <strong>Nenhuma variação cadastrada ainda.</strong>
                      <span>
                        Exemplo: Cor → Rosa, Azul, Verde. Depois envie as fotos reais de cada uma.
                      </span>
                    </div>
                  ) : (
                    variants.map((variant, variantIndex) => (
                      <article className="variant-card" key={variant.id}>
                        <div className="variant-card-header">
                          <div className="variant-number">{variantIndex + 1}</div>
                          <div className="variant-heading-copy">
                            <span>{variant.variation_type || "Variação"}</span>
                            <strong>{variant.name || "Sem nome"}</strong>
                          </div>

                          <label className="variant-active">
                            <input
                              type="checkbox"
                              checked={variant.active}
                              onChange={(e) =>
                                updateVariantLocal(variant.id, "active", e.target.checked)
                              }
                            />
                            Ativa
                          </label>
                        </div>

                        <div className="variant-fields-grid">
                          <Field label="Tipo">
                            <select
                              value={variant.variation_type}
                              onChange={(e) =>
                                updateVariantLocal(variant.id, "variation_type", e.target.value)
                              }
                            >
                              <option value="Cor">Cor</option>
                              <option value="Tamanho">Tamanho</option>
                              <option value="Modelo">Modelo</option>
                              <option value="Estampa">Estampa</option>
                              <option value="Capacidade">Capacidade</option>
                              <option value="Outro">Outro</option>
                            </select>
                          </Field>

                          <Field label="Nome / valor">
                            <input
                              value={variant.name}
                              onChange={(e) =>
                                updateVariantLocal(variant.id, "name", e.target.value)
                              }
                            />
                          </Field>

                          <Field label="SKU">
                            <input
                              value={variant.sku}
                              onChange={(e) =>
                                updateVariantLocal(variant.id, "sku", e.target.value)
                              }
                            />
                          </Field>

                          <Field label="EAN">
                            <input
                              value={variant.barcode}
                              onChange={(e) =>
                                updateVariantLocal(variant.id, "barcode", e.target.value)
                              }
                            />
                          </Field>

                          <Field label="Cor">
                            <input
                              value={variant.color}
                              onChange={(e) =>
                                updateVariantLocal(variant.id, "color", e.target.value)
                              }
                            />
                          </Field>

                          <Field label="Preço próprio (R$)">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={variant.sale_price}
                              onChange={(e) =>
                                updateVariantLocal(variant.id, "sale_price", e.target.value)
                              }
                              placeholder="Usa o preço principal"
                            />
                          </Field>
                        </div>

                        <div className="variant-actions">
                          <button
                            type="button"
                            className="save-variant-button"
                            onClick={() => saveVariant(variant)}
                            disabled={savingVariant}
                          >
                            Salvar variação
                          </button>
                          <button
                            type="button"
                            className="delete-variant-button"
                            onClick={() => deleteVariant(variant)}
                            disabled={savingVariant}
                          >
                            Excluir
                          </button>
                        </div>

                        <div className="variant-photo-block">
                          <div className="variant-photo-heading">
                            <div>
                              <strong>Fotos reais desta variação</strong>
                              <small>
                                A IA usará somente estas referências para preservar a cor e os detalhes desta opção.
                              </small>
                            </div>
                          </div>

                          <div className="variant-photo-grid">
                            {EMPTY_SLOTS.map((slot) => {
                              const original = getVariantImage(variant.id, slot.key, "upload");
                              const uploadKey = `${variant.id}-${slot.key}`;
                              return (
                                <div className="variant-photo-card" key={`${variant.id}-real-${slot.key}`}>
                                  <div className="variant-photo-preview">
                                    {original ? (
                                      <img src={original.image_url} alt={`${variant.name} - ${slot.title}`} />
                                    ) : (
                                      <div>
                                        <span>＋</span>
                                        <strong>{slot.title}</strong>
                                      </div>
                                    )}
                                  </div>
                                  <label className="variant-upload-button">
                                    {variantUploading === uploadKey
                                      ? "Enviando..."
                                      : original
                                      ? "Trocar foto"
                                      : "Enviar foto"}
                                    <input
                                      type="file"
                                      accept="image/jpeg,image/png,image/webp"
                                      disabled={Boolean(variantUploading)}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        handleVariantPhotoUpload(variant, slot.key, file);
                                        e.currentTarget.value = "";
                                      }}
                                    />
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="variant-ai-block">
                          <div className="variant-photo-heading">
                            <div>
                              <span className="ai-badge">IA</span>
                              <strong>Fotos profissionais desta variação</strong>
                              <small>
                                Gere cada enquadramento usando exclusivamente as fotos reais desta variação.
                              </small>
                            </div>
                          </div>

                          <div className="variant-photo-grid">
                            {EMPTY_SLOTS.map((slot) => {
                              const generated = getVariantImage(variant.id, slot.key, "ai");
                              const generationKey = `${variant.id}-${slot.key}`;
                              const generating = variantAiGenerating === generationKey;

                              return (
                                <div className="variant-photo-card ai" key={`${variant.id}-ai-${slot.key}`}>
                                  <button
                                    type="button"
                                    className="variant-photo-preview clickable"
                                    disabled={!generated}
                                    onClick={() => generated && setPreviewImage(generated)}
                                  >
                                    {generated ? (
                                      <img
                                        src={generated.image_url}
                                        alt={`IA ${variant.name} - ${slot.title}`}
                                      />
                                    ) : (
                                      <div>
                                        <span>IA</span>
                                        <strong>{getSlotTitle(slot.key)}</strong>
                                      </div>
                                    )}
                                    {generated?.approved && (
                                      <em className="variant-approved">✓ Aprovada</em>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    className="variant-generate-button"
                                    disabled={Boolean(variantAiGenerating)}
                                    onClick={() => generateVariantAiImage(variant, slot.key)}
                                  >
                                    {generating
                                      ? "Gerando..."
                                      : generated
                                      ? "Gerar novamente"
                                      : "Gerar com IA"}
                                  </button>

                                  {generated && !generated.approved && (
                                    <button
                                      type="button"
                                      className="variant-approve-button"
                                      onClick={() => approveVariantAiImage(variant, slot.key)}
                                    >
                                      ✓ Aprovar
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </>
            )}
          </section>

          <section className="form-section">
            <div className="section-heading">
              <div>
                <h2>Medidas e embalagem</h2>
                <p>Atualize quando receber as medidas corretas do produto.</p>
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

              <Field label="Preço de venda (R$)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="sale_price"
                  value={form.sale_price}
                  onChange={handleChange}
                  placeholder="0,00"
                />
              </Field>
            </div>
          </section>

          <section className="form-section">
            <div className="section-heading">
              <div>
                <h2>Descrição do catálogo</h2>
                <p>Edite livremente o conteúdo exibido na ficha do produto.</p>
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

          <section className="form-section commercial-section">
            <div className="section-heading">
              <div>
                <h2>Informações comerciais</h2>
                <p>
                  Escolha o que vendedores e clientes poderão visualizar na ficha
                  comercial do produto.
                </p>
              </div>

              <span className="commercial-badge">VISÃO DO CLIENTE</span>
            </div>

            <div className="commercial-intro">
              <div>
                <strong>Controle de exibição</strong>
                <p>
                  Os dados continuam salvos internamente mesmo quando uma opção
                  estiver desativada aqui.
                </p>
              </div>
            </div>

            <div className="commercial-toggle-grid">
              {[
                ["sku", "SKU", "Código SKU comercial do produto."],
                ["internal_code", "Código interno", "Código interno utilizado pela empresa."],
                ["barcode", "EAN / código de barras", "Código de barras exibido na ficha."],
                ["description", "Descrição", "Texto principal de apresentação do produto."],
                ["material", "Material", "Material ou composição cadastrada."],
                ["dimensions", "Medidas", "Largura, altura e profundidade."],
                ["weight", "Peso", "Peso cadastrado do produto."],
                ["package", "Embalagem", "Quantidade e unidade por embalagem."],
                ["specifications", "Informações adicionais", "Especificações complementares."],
                ["variants", "Cores / variações", "Cores, modelos, tamanhos ou outras opções."],
                ["price", "Preço de venda", "Valor comercial exibido para vendedor e cliente."],
              ].map(([key, title, description]) => {
                const typedKey = key as keyof CommercialVisibility;
                const enabled = commercialVisibility[typedKey];

                return (
                  <button
                    key={key}
                    type="button"
                    className={`commercial-toggle ${enabled ? "enabled" : ""}`}
                    onClick={() => toggleCommercialVisibility(typedKey)}
                  >
                    <span className="commercial-switch">
                      <span />
                    </span>

                    <span className="commercial-toggle-copy">
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>

                    <em>{enabled ? "Visível" : "Oculto"}</em>
                  </button>
                );
              })}
            </div>

            <div className="commercial-copy-grid">
              <Field label="Destaques comerciais">
                <textarea
                  name="commercial_highlights"
                  value={form.commercial_highlights}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Ex.: Conserva a temperatura por horas, tampa com vedação, alça para transporte..."
                />
              </Field>

              <Field label="Cores / variações disponíveis">
                <textarea
                  name="commercial_variants"
                  value={form.commercial_variants}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Ex.: Verde militar, preto e azul. Modelos de 500 ml e 750 ml."
                />
              </Field>
            </div>

            <div className="commercial-preview-note">
              <span>👁</span>
              <div>
                <strong>Essas regras alimentam a ficha comercial.</strong>
                <p>
                  Ao salvar, a página do catálogo passa a respeitar automaticamente
                  os campos marcados como Visível.
                </p>
              </div>
            </div>
          </section>

          <section className="danger-zone">
            <div>
              <strong>Excluir produto</strong>
              <p>
                Remove o produto do catálogo e exclui também suas fotos.
              </p>
            </div>

            <button
              type="button"
              className="delete-button"
              onClick={handleDeleteProduct}
              disabled={deleting || saving}
            >
              {deleting ? "Excluindo..." : "Excluir produto"}
            </button>
          </section>

          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => router.back()}
              disabled={saving || deleting}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={saving || deleting}
            >
              {saving ? "Salvando alterações..." : "Salvar alterações"}
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

        .header-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
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

        .status-pill {
          flex: 0 0 auto;
          border-radius: 999px;
          padding: 9px 13px;
          background: #f0ece8;
          color: #83766f;
          border: 1px solid #e3dcd7;
          font-size: 12px;
          font-weight: 900;
        }

        .status-pill.active {
          background: #eef8f0;
          color: #2e7a44;
          border-color: #d5ead9;
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

        .active-toggle {
          margin-top: 4px;
          border: 1px solid #e7dfda;
          border-radius: 12px;
          padding: 14px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          background: #fcfaf8;
          cursor: pointer;
        }

        .active-toggle input {
          width: 18px;
          height: 18px;
          margin-top: 1px;
          accent-color: #ef7a00;
        }

        .active-toggle span {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .active-toggle strong {
          font-size: 13px;
        }

        .active-toggle small {
          color: #857a74;
          line-height: 1.45;
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
            radial-gradient(
              circle at 50% 35%,
              rgba(239, 122, 0, 0.08),
              transparent 38%
            ),
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
          flex-wrap: wrap;
        }

        .upload-button,
        .remove-photo,
        .undo-photo {
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

        .undo-photo {
          width: 100%;
          border: 1px solid #dfd6cf;
          background: #fff;
          color: #6d6059;
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

        .ai-banner-live {
          display: block;
        }

        .ai-copy {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .ai-button-live {
          background: #8a2312;
          border-color: #8a2312;
          color: #fff;
          cursor: pointer;
          box-shadow: 0 7px 16px rgba(138, 35, 18, 0.14);
        }

        .ai-button-live:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          box-shadow: none;
        }

        .ai-result {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #efddcf;
          display: grid;
          grid-template-columns: 210px 1fr;
          gap: 18px;
          align-items: center;
        }

        .ai-result-image {
          height: 210px;
          overflow: hidden;
          border-radius: 13px;
          border: 1px solid #eadfd7;
          background: #fff;
        }

        .ai-result-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }

        .ai-result-info strong {
          display: block;
          font-size: 16px;
          color: #402820;
        }

        .ai-result-info p {
          margin: 6px 0 14px;
          color: #81766f;
          font-size: 12px;
        }

        .ai-result-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .use-primary-button,
        .generate-again-button {
          min-height: 40px;
          border-radius: 10px;
          padding: 0 14px;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .use-primary-button {
          border: 1px solid #ef7a00;
          background: #ef7a00;
          color: #fff;
        }

        .use-primary-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .generate-again-button {
          border: 1px solid #ddd3cc;
          background: #fff;
          color: #5f514a;
        }


        .catalog-ai-grid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .catalog-ai-card {
          min-width: 0;
          border: 1px solid #eadfd7;
          background: #fff;
          border-radius: 14px;
          overflow: hidden;
        }

        .catalog-ai-card-generating {
          border-color: #efc6aa;
          box-shadow: 0 10px 28px rgba(138, 35, 18, 0.08);
        }

        .catalog-ai-preview {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          padding: 0;
          border: 0;
          border-bottom: 1px solid #eee6df;
          background: #fffaf6;
          cursor: zoom-in;
          overflow: hidden;
        }

        .catalog-ai-preview:disabled {
          cursor: default;
        }

        .catalog-ai-preview img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
          background: #fff;
        }

        .catalog-generated-image {
          animation: catalogImageIn 0.42s ease both;
        }

        .ai-generating-overlay {
          position: absolute;
          inset: 0;
          z-index: 4;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 20px;
          box-sizing: border-box;
          text-align: center;
          background:
            linear-gradient(
              120deg,
              rgba(255, 250, 246, 0.95),
              rgba(255, 255, 255, 0.92),
              rgba(255, 245, 236, 0.95)
            );
          backdrop-filter: blur(4px);
          cursor: wait;
        }

        .ai-generating-overlay::before {
          content: "";
          position: absolute;
          inset: -30%;
          background: linear-gradient(
            110deg,
            transparent 35%,
            rgba(239, 122, 0, 0.08) 48%,
            rgba(255, 255, 255, 0.55) 52%,
            transparent 65%
          );
          animation: aiShimmer 2.2s linear infinite;
          pointer-events: none;
        }

        .ai-generating-overlay > * {
          position: relative;
          z-index: 1;
        }

        .ai-spinner {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 4px solid #f2dfd2;
          border-top-color: #ef7a00;
          border-right-color: #8a2312;
          animation: aiSpin 0.9s linear infinite;
        }

        .ai-generating-overlay strong {
          margin-top: 3px;
          color: #6f2417;
          font-size: 12px;
        }

        .ai-generating-overlay span {
          min-height: 30px;
          max-width: 190px;
          color: #7e6d65;
          font-size: 10px;
          line-height: 1.45;
        }

        .ai-progress-track {
          width: min(170px, 82%);
          height: 5px;
          margin-top: 2px;
          border-radius: 999px;
          overflow: hidden;
          background: #eadfd7;
        }

        .ai-progress-bar {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #ef7a00, #8a2312);
          transition: width 0.45s ease;
        }

        .catalog-ai-empty {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          color: #8a817b;
        }

        .catalog-ai-empty > span {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: #fff0e3;
          color: #8a2312;
          font-size: 11px;
          font-weight: 900;
        }

        .catalog-ai-empty strong {
          margin-top: 4px;
          color: #49362e;
          font-size: 13px;
        }

        .catalog-ai-empty small {
          font-size: 10px;
        }

        .approved-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          border-radius: 999px;
          padding: 6px 9px;
          background: #eaf7ed;
          color: #29713d;
          border: 1px solid #cfe8d5;
          font-size: 10px;
          font-weight: 900;
          box-shadow: 0 4px 12px rgba(40, 113, 61, 0.1);
        }

        .catalog-ai-card-body {
          padding: 12px;
        }

        .catalog-ai-card-body > strong {
          display: block;
          color: #402820;
          font-size: 13px;
        }

        .catalog-ai-card-body > small {
          display: block;
          min-height: 46px;
          margin-top: 5px;
          color: #81766f;
          font-size: 10px;
          line-height: 1.45;
        }

        .catalog-ai-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 10px;
        }

        .generate-slot-button,
        .approve-slot-button,
        .discard-slot-button {
          min-height: 34px;
          border-radius: 8px;
          padding: 0 10px;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .generate-slot-button {
          flex: 1 1 100%;
          border: 1px solid #8a2312;
          background: #8a2312;
          color: #fff;
        }

        .approve-slot-button {
          flex: 1;
          border: 1px solid #ef7a00;
          background: #ef7a00;
          color: #fff;
        }

        .discard-slot-button {
          flex: 1;
          border: 1px solid #e1d7d0;
          background: #fff;
          color: #7a665d;
        }

        .generate-slot-button:disabled,
        .approve-slot-button:disabled,
        .discard-slot-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .ai-inline-status {
          margin-top: 10px;
          min-height: 38px;
          border-radius: 9px;
          padding: 9px 10px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 10px;
          line-height: 1.4;
          animation: aiStatusIn 0.3s ease both;
        }

        .ai-inline-status > span {
          flex: 0 0 auto;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: 9px;
          font-weight: 900;
        }

        .ai-inline-status p {
          margin: 1px 0 0;
          color: inherit;
          font-size: inherit;
          line-height: inherit;
        }

        .ai-inline-status.success {
          border: 1px solid #cfe8d5;
          background: #eef8f0;
          color: #2d7040;
        }

        .ai-inline-status.success > span {
          background: #d9efdf;
          color: #28703d;
        }

        .ai-inline-status.error {
          border: 1px solid #ecc9c0;
          background: #fff5f2;
          color: #9a2f20;
        }

        .ai-inline-status.error > span {
          background: #f6ddd7;
          color: #9a2f20;
        }

        .ai-inline-status.info {
          border: 1px solid #ead8c5;
          background: #fff8f0;
          color: #7d5d45;
        }

        .ai-inline-status.info > span {
          background: #f8e7d4;
          color: #8a4e24;
        }

        @keyframes aiSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes aiShimmer {
          from {
            transform: translateX(-28%);
          }

          to {
            transform: translateX(28%);
          }
        }

        @keyframes catalogImageIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }

          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes aiStatusIn {
          from {
            opacity: 0;
            transform: translateY(5px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .catalog-note {
          margin-top: 16px;
          padding: 13px 14px;
          border-radius: 11px;
          background: #fff4e9;
          border: 1px solid #f1ddc9;
          display: flex;
          gap: 8px;
          align-items: flex-start;
          font-size: 11px;
          line-height: 1.5;
        }

        .catalog-note strong {
          flex: 0 0 auto;
          color: #8a2a18;
        }

        .catalog-note span {
          color: #74645d;
        }

        .image-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(28, 18, 14, 0.76);
          padding: 28px;
          display: grid;
          place-items: center;
        }

        .image-modal {
          width: min(980px, 96vw);
          max-height: 94vh;
          background: #fff;
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.3);
        }

        .image-modal-header {
          padding: 16px 18px;
          border-bottom: 1px solid #eee5df;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .image-modal-header div {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .image-modal-header strong {
          font-size: 14px;
          color: #382820;
        }

        .image-modal-header span {
          color: #82766f;
          font-size: 11px;
        }

        .image-modal-close {
          width: 38px;
          height: 38px;
          border: 0;
          border-radius: 10px;
          background: #f6f1ed;
          color: #6b5b53;
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
        }

        .image-modal-content {
          height: min(76vh, 760px);
          padding: 20px;
          background: #f8f6f3;
          display: grid;
          place-items: center;
        }

        .image-modal-content img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 8px 28px rgba(72, 50, 38, 0.08);
        }

        :global(input:not([type="checkbox"])),
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

        .commercial-section {
          position: relative;
          overflow: hidden;
        }

        .commercial-badge {
          flex: 0 0 auto;
          border-radius: 999px;
          padding: 7px 10px;
          background: #fff3e7;
          border: 1px solid #f0d9c7;
          color: #8a2a18;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.7px;
        }

        .commercial-intro {
          margin-bottom: 16px;
          padding: 14px 15px;
          border: 1px solid #eadfd8;
          border-radius: 12px;
          background: #fcfaf8;
        }

        .commercial-intro strong {
          color: #3d2c25;
          font-size: 12px;
        }

        .commercial-intro p {
          margin: 4px 0 0;
          color: #81756f;
          font-size: 11px;
          line-height: 1.5;
        }

        .commercial-toggle-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 20px;
        }

        .commercial-toggle {
          width: 100%;
          min-height: 76px;
          border: 1px solid #e5ddd7;
          border-radius: 12px;
          background: #fff;
          padding: 12px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 10px;
          align-items: center;
          text-align: left;
          cursor: pointer;
          transition:
            border-color 0.16s ease,
            background 0.16s ease,
            transform 0.16s ease;
        }

        .commercial-toggle:hover {
          transform: translateY(-1px);
        }

        .commercial-toggle.enabled {
          border-color: #efc7aa;
          background: #fffaf6;
        }

        .commercial-switch {
          width: 36px;
          height: 21px;
          border-radius: 999px;
          padding: 3px;
          box-sizing: border-box;
          background: #d7cec8;
          transition: background 0.16s ease;
        }

        .commercial-switch span {
          display: block;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 2px 5px rgba(62, 43, 34, 0.16);
          transition: transform 0.16s ease;
        }

        .commercial-toggle.enabled .commercial-switch {
          background: #ef7a00;
        }

        .commercial-toggle.enabled .commercial-switch span {
          transform: translateX(15px);
        }

        .commercial-toggle-copy {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }

        .commercial-toggle-copy strong {
          color: #3e2e27;
          font-size: 11px;
        }

        .commercial-toggle-copy small {
          color: #8b817b;
          font-size: 9px;
          line-height: 1.4;
        }

        .commercial-toggle em {
          color: #9c918b;
          font-size: 9px;
          font-style: normal;
          font-weight: 900;
        }

        .commercial-toggle.enabled em {
          color: #9a371e;
        }

        .commercial-copy-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .commercial-preview-note {
          margin-top: 2px;
          padding: 13px 14px;
          border-radius: 11px;
          border: 1px solid #d9e8dc;
          background: #f4faf5;
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }

        .commercial-preview-note > span {
          font-size: 17px;
        }

        .commercial-preview-note strong {
          color: #3b6746;
          font-size: 11px;
        }

        .commercial-preview-note p {
          margin: 4px 0 0;
          color: #708176;
          font-size: 10px;
          line-height: 1.5;
        }

        .danger-zone {
          border: 1px solid #eccbc2;
          background: #fff9f7;
          border-radius: 16px;
          padding: 20px 22px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
        }

        .danger-zone strong {
          color: #8a291a;
          font-size: 14px;
        }

        .danger-zone p {
          margin: 4px 0 0;
          color: #8a7973;
          font-size: 12px;
        }

        .delete-button {
          min-height: 40px;
          padding: 0 15px;
          border-radius: 10px;
          border: 1px solid #c8402a;
          background: #fff;
          color: #b52f1d;
          font-weight: 900;
          cursor: pointer;
        }

        .delete-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
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

        .variants-section {
          overflow: hidden;
        }

        .variant-status {
          flex: 0 0 auto;
          padding: 8px 11px;
          border-radius: 999px;
          border: 1px solid #e5ddd8;
          background: #f6f2ef;
          color: #82766f;
          font-size: 11px;
          font-weight: 900;
        }

        .variant-status.enabled {
          background: #fff3e5;
          border-color: #f2c999;
          color: #a94818;
        }

        .variants-question {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          padding: 18px;
          border: 1px solid #eadfd8;
          border-radius: 14px;
          background: #fcfaf8;
          margin-bottom: 18px;
        }

        .variants-question > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .variants-question strong {
          font-size: 14px;
        }

        .variants-question small {
          color: #847973;
          line-height: 1.45;
        }

        .yes-no-buttons {
          display: flex;
          gap: 7px;
        }

        .yes-no-buttons button {
          min-width: 72px;
          border: 1px solid #e2d8d2;
          background: #fff;
          color: #6e625c;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 900;
          cursor: pointer;
        }

        .yes-no-buttons button.selected {
          background: #ef7a00;
          border-color: #ef7a00;
          color: #fff;
        }

        .new-variant-card,
        .variant-card {
          border: 1px solid #e8dfda;
          border-radius: 16px;
          background: #fff;
          padding: 20px;
        }

        .new-variant-card {
          background: #fffaf5;
          border-color: #f0d5bd;
          margin-bottom: 14px;
        }

        .variant-card-title {
          margin-bottom: 16px;
        }

        .variant-card-title > div,
        .variant-heading-copy {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .variant-card-title span,
        .variant-heading-copy span {
          color: #ef7a00;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1.2px;
          text-transform: uppercase;
        }

        .variant-card-title strong {
          font-size: 16px;
        }

        .variant-fields-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0 16px;
        }

        .add-variant-button,
        .save-variant-button,
        .variant-generate-button,
        .variant-approve-button {
          border: 0;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 900;
          cursor: pointer;
        }

        .add-variant-button,
        .save-variant-button {
          background: #8f2a18;
          color: #fff;
        }

        .variant-feedback {
          margin: 12px 0;
          padding: 11px 13px;
          border-radius: 10px;
          background: #fff5e9;
          border: 1px solid #f2d5b4;
          color: #8f431c;
          font-size: 12px;
          font-weight: 700;
        }

        .variants-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 16px;
        }

        .variants-empty {
          border: 1px dashed #dccfc7;
          border-radius: 14px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          color: #7d716b;
          text-align: center;
        }

        .variants-empty span {
          font-size: 12px;
        }

        .variant-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 16px;
          margin-bottom: 18px;
          border-bottom: 1px solid #eee7e2;
        }

        .variant-number {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: #fff0e3;
          color: #a2381f;
          font-weight: 900;
        }

        .variant-heading-copy {
          flex: 1;
        }

        .variant-heading-copy strong {
          font-size: 16px;
        }

        .variant-active {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 800;
          color: #5d514b;
        }

        .variant-active input {
          accent-color: #ef7a00;
        }

        .variant-actions {
          display: flex;
          gap: 8px;
          margin-top: -2px;
          margin-bottom: 20px;
        }

        .delete-variant-button {
          border: 1px solid #ead4cd;
          background: #fff;
          color: #a13220;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 900;
          cursor: pointer;
        }

        .variant-photo-block,
        .variant-ai-block {
          border-top: 1px solid #eee7e2;
          padding-top: 18px;
          margin-top: 18px;
        }

        .variant-ai-block {
          background: #fffaf5;
          margin-left: -20px;
          margin-right: -20px;
          margin-bottom: -20px;
          padding: 18px 20px 20px;
          border-radius: 0 0 16px 16px;
        }

        .variant-photo-heading {
          margin-bottom: 13px;
        }

        .variant-photo-heading > div {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .variant-photo-heading strong {
          font-size: 13px;
        }

        .variant-photo-heading small {
          color: #877b75;
          font-size: 11px;
          line-height: 1.4;
        }

        .variant-photo-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .variant-photo-card {
          min-width: 0;
          border: 1px solid #e7dfda;
          border-radius: 12px;
          background: #fff;
          overflow: hidden;
        }

        .variant-photo-preview {
          width: 100%;
          aspect-ratio: 1 / 1;
          border: 0;
          padding: 0;
          background: #f8f5f2;
          position: relative;
          display: grid;
          place-items: center;
          overflow: hidden;
        }

        .variant-photo-preview.clickable {
          cursor: zoom-in;
        }

        .variant-photo-preview img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: #fff;
        }

        .variant-photo-preview > div {
          padding: 12px;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 5px;
          color: #9a8e87;
        }

        .variant-photo-preview > div span {
          font-weight: 900;
          color: #ef7a00;
        }

        .variant-photo-preview > div strong {
          font-size: 10px;
        }

        .variant-upload-button {
          display: block;
          margin: 8px;
          padding: 8px;
          border-radius: 8px;
          background: #f5eee9;
          color: #7d3323;
          text-align: center;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .variant-upload-button input {
          display: none;
        }

        .variant-generate-button,
        .variant-approve-button {
          width: calc(100% - 16px);
          margin: 8px 8px 0;
          padding: 8px;
          font-size: 10px;
        }

        .variant-generate-button {
          background: #ef7a00;
          color: #fff;
        }

        .variant-approve-button {
          margin-bottom: 8px;
          background: #eaf6ed;
          color: #26713d;
          border: 1px solid #cfe7d5;
        }

        .variant-approved {
          position: absolute;
          top: 7px;
          right: 7px;
          padding: 5px 7px;
          border-radius: 999px;
          background: #eaf6ed;
          color: #26713d;
          font-size: 8px;
          font-style: normal;
          font-weight: 900;
        }

        @media (max-width: 920px) {
          .form-grid-four,
          .photo-grid {
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

          .header-row,
          .section-heading,
          .ai-banner,
          .danger-zone,
          .variants-question {
            flex-direction: column;
          }

          .form-grid,
          .form-grid-four,
          .photo-grid,
          .catalog-ai-grid,
          .commercial-toggle-grid,
          .commercial-copy-grid,
          .variant-fields-grid,
          .variant-photo-grid {
            grid-template-columns: 1fr;
          }

          .ai-button,
          .delete-button {
            width: 100%;
          }

          .ai-copy,
          .ai-result {
            display: flex;
            flex-direction: column;
            align-items: stretch;
          }

          .ai-result-image {
            width: 100%;
            height: 280px;
          }

          .use-primary-button,
          .generate-again-button {
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


function getSlotTitle(slot: PhotoSlotKey) {
  const titles: Record<PhotoSlotKey, string> = {
    front: "Frente profissional",
    back: "Verso profissional",
    product: "Produto profissional",
    detail: "Detalhe profissional",
  };

  return titles[slot];
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
