export type ClassificationProduct = {
  id: string; name: string; sku: string | null; category_id: string | null;
  catalog_group_id: string | null; taxonomy_locked: boolean; taxonomy_version: number;
};
export type ClassificationCategory = { id: string; name: string; slug?: string | null };
export type ClassificationGroup = { id: string; name: string };
export type ClassificationSuggestion = {
  product: ClassificationProduct; category: string; group_id: string;
  confidence: "alta" | "media" | "baixa"; reason: string; selected: boolean;
};
export function categorySlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
const compare = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
export function organizeCatalog<T extends { id: string; name: string; category_id: string | null; catalog_group_id?: string | null }>(
  products: T[], categories: ClassificationCategory[], groups: ClassificationGroup[]
): T[] {
  const names = new Map(categories.map(c => [c.id, c.name]));
  const families = new Map(groups.map(g => [g.id, g.name]));
  return [...products].sort((a,b) => {
    const ac = names.get(a.category_id || ""), bc = names.get(b.category_id || "");
    if (!!ac !== !!bc) return ac ? -1 : 1;
    const category = compare.compare(ac || "", bc || "");
    if (category) return category;
    const ag = families.get(a.catalog_group_id || ""), bg = families.get(b.catalog_group_id || "");
    if (!!ag !== !!bg) return ag ? -1 : 1;
    return compare.compare(ag || "", bg || "") || compare.compare(a.name, b.name) || compare.compare(a.id,b.id);
  });
}
