export type CatalogImageRecord = {
  id: string;
  product_id: string;
  image_url: string;
  catalog_slot: string | null;
  image_type: string | null;
  is_primary: boolean | null;
  approved: boolean;
  source: string | null;
  variant_id: string | null;
};

export type CatalogGalleryImage<T extends CatalogImageRecord = CatalogImageRecord> = {
  slot: string;
  label: string;
  image: T;
};

const VALID_SLOTS = [
  "front",
  "back",
  "product",
  "detail",
  "packaging",
  "package",
  "lifestyle",
] as const;

const SLOT_LABELS: Record<string, string> = {
  front: "Frente",
  back: "Verso",
  product: "Produto",
  detail: "Detalhe",
  packaging: "Embalagem",
  package: "Embalagem",
  lifestyle: "Ambientada",
};

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function slotOf(image: CatalogImageRecord) {
  return normalize(image.catalog_slot || image.image_type || "product");
}

function basename(url: string) {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split("/").pop() || "");
  } catch {
    return decodeURIComponent(url.split("/").pop() || "");
  }
}

function familyKey(image: CatalogImageRecord) {
  const file = basename(image.image_url || "");

  const aiMatch = file.match(
    /^ai-(?:front|back|product|detail|packaging|package|lifestyle)[-_](.+)$/i
  );
  if (aiMatch?.[1]) return `ai:${aiMatch[1]}`;

  const generic = file
    .replace(/\.(png|jpe?g|webp|avif)$/i, "")
    .replace(
      /(?:^|[-_])(front|back|product|detail|packaging|package|lifestyle)(?:[-_]|$)/gi,
      "-"
    )
    .replace(/[-_]+/g, "-")
    .replace(/^-|-$/g, "");

  return generic ? `generic:${generic}` : null;
}

export function isCatalogReadyImage(image: CatalogImageRecord) {
  if (!image.approved || !image.image_url) return false;

  const source = normalize(image.source);
  const imageType = normalize(image.image_type);
  const slot = normalize(image.catalog_slot);

  const preparedSource =
    source === "ai" ||
    source === "catalog" ||
    source === "studio" ||
    source === "professional";

  const preparedType =
    imageType === "ai_catalog" ||
    imageType === "catalog" ||
    imageType === "professional";

  const validSlot = VALID_SLOTS.includes(slot as (typeof VALID_SLOTS)[number]);

  return (preparedSource || preparedType) && validSlot;
}

export function resolveCatalogPresentationImage<T extends CatalogImageRecord>(
  images: T[],
  productId: string
): T | null {
  const productImages = images.filter(
    (image) => image.product_id === productId && Boolean(image.image_url)
  );

  const productLevel = productImages.filter(
    (image) => image.variant_id === null && isCatalogReadyImage(image)
  );

  const primary =
    productLevel.find(
      (image) =>
        image.is_primary &&
        (slotOf(image) === "front" || normalize(image.image_type) === "front")
    ) ||
    productLevel.find((image) => slotOf(image) === "front") ||
    productLevel.find((image) => image.is_primary) ||
    productLevel[0];

  if (primary) return primary;

  // Fallback público permitido: apenas imagem preparada da variação.
  return (
    productImages.find(
      (image) =>
        image.variant_id !== null &&
        isCatalogReadyImage(image) &&
        slotOf(image) === "front"
    ) ||
    productImages.find(
      (image) => image.variant_id !== null && isCatalogReadyImage(image)
    ) ||
    null
  );
}

export function resolveCatalogVariantImage<T extends CatalogImageRecord>(
  images: T[],
  productId: string,
  variantId: string
): T | null {
  const ownImages = images
    .filter(
      (image) =>
        image.product_id === productId &&
        image.variant_id === variantId &&
        isCatalogReadyImage(image)
    )
    .sort((a, b) => {
      const rank = (image: T) => {
        const slot = slotOf(image);
        if (slot === "front") return 0;
        if (image.is_primary) return 1;
        if (slot === "product") return 2;
        if (slot === "detail") return 3;
        if (slot === "back") return 4;
        return 5;
      };

      return rank(a) - rank(b);
    });

  return ownImages[0] || null;
}

export function resolveCatalogGallery<T extends CatalogImageRecord>(
  images: T[],
  productId: string
): CatalogGalleryImage<T>[] {
  const approvedProductImages = images.filter(
    (image) =>
      image.product_id === productId &&
      image.variant_id === null &&
      isCatalogReadyImage(image)
  );

  const presentation = resolveCatalogPresentationImage(images, productId);
  if (!presentation) return [];

  const selectedFamily =
    presentation.variant_id === null ? familyKey(presentation) : null;

  const sameFamily = selectedFamily
    ? approvedProductImages.filter(
        (image) => familyKey(image) === selectedFamily
      )
    : [];

  const chooseForSlot = (slot: string) => {
    const exactSameFamily = sameFamily.find(
      (image) => slotOf(image) === slot
    );
    if (exactSameFamily) return exactSameFamily;

    return (
      approvedProductImages.find((image) => slotOf(image) === slot) || null
    );
  };

  const orderedSlots = [
    "front",
    "back",
    "product",
    "detail",
    "packaging",
    "lifestyle",
  ];

  const result: CatalogGalleryImage<T>[] = [];
  const seenUrls = new Set<string>();

  for (const slot of orderedSlots) {
    const image = slot === "front" ? presentation : chooseForSlot(slot);

    if (!image?.image_url || seenUrls.has(image.image_url)) continue;
    seenUrls.add(image.image_url);

    result.push({
      slot,
      label: slot === "front" ? "Principal" : SLOT_LABELS[slot] || slot,
      image,
    });
  }

  for (const image of approvedProductImages) {
    if (!image.image_url || seenUrls.has(image.image_url)) continue;
    seenUrls.add(image.image_url);

    const slot = slotOf(image);
    result.push({
      slot,
      label: SLOT_LABELS[slot] || `Foto ${result.length + 1}`,
      image,
    });
  }

  return result;
}

export function getOptimizedCatalogImageUrl(
  sourceUrl: string,
  width: number,
  quality = 78
) {
  try {
    const url = new URL(sourceUrl);

    if (url.pathname.includes("/storage/v1/object/public/")) {
      url.pathname = url.pathname.replace(
        "/storage/v1/object/public/",
        "/storage/v1/render/image/public/"
      );
      url.searchParams.set("width", String(width));
      url.searchParams.set("quality", String(quality));
      url.searchParams.set("resize", "contain");
      return url.toString();
    }
  } catch {
    // URL externa/legada: preserva a original.
  }

  return sourceUrl;
}
