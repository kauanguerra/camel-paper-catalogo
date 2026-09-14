export type ResolvableProductImage = {
  product_id: string;
  variant_id: string | null;
  image_url: string | null;
  image_type?: string | null;
  catalog_slot?: string | null;
  is_primary?: boolean | null;
  approved?: boolean | null;
  source?: string | null;
};

type ResolveProductImageArgs = {
  productId: string;
  variantId?: string | null;
  productMainImageUrl?: string | null;
  variantImageUrl?: string | null;
  images: ResolvableProductImage[];
};

function hasUrl(image: ResolvableProductImage) {
  return Boolean(image.image_url && image.image_url.trim());
}

function isFront(image: ResolvableProductImage) {
  return image.catalog_slot === "front" || image.image_type === "front";
}

function isApproved(image: ResolvableProductImage) {
  return image.approved === true;
}

function firstUrl(images: ResolvableProductImage[]) {
  return images.find(hasUrl)?.image_url || null;
}

export function resolveProductImage({
  productId,
  variantId = null,
  productMainImageUrl = null,
  variantImageUrl = null,
  images,
}: ResolveProductImageArgs): string | null {
  const usable = images.filter(
    (image) => image.product_id === productId && hasUrl(image)
  );

  const productImages = usable.filter((image) => image.variant_id === null);

  if (variantId) {
    const variantImages = usable.filter((image) => image.variant_id === variantId);

    return (
      firstUrl(variantImages.filter((image) => isApproved(image) && isFront(image))) ||
      firstUrl(variantImages.filter(isApproved)) ||
      firstUrl(variantImages.filter((image) => isFront(image) || image.is_primary === true)) ||
      firstUrl(variantImages) ||
      (variantImageUrl?.trim() || null) ||
      firstUrl(productImages.filter((image) => isApproved(image) && isFront(image))) ||
      firstUrl(productImages.filter((image) => isApproved(image) && image.is_primary === true)) ||
      firstUrl(productImages.filter(isApproved)) ||
      (productMainImageUrl?.trim() || null) ||
      firstUrl(productImages.filter((image) => isFront(image) || image.is_primary === true)) ||
      firstUrl(productImages)
    );
  }

  return (
    firstUrl(productImages.filter((image) => isApproved(image) && isFront(image))) ||
    firstUrl(productImages.filter((image) => isApproved(image) && image.is_primary === true)) ||
    firstUrl(productImages.filter(isApproved)) ||
    (productMainImageUrl?.trim() || null) ||
    firstUrl(productImages.filter((image) => isFront(image) || image.is_primary === true)) ||
    firstUrl(productImages)
  );
}
