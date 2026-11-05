export function readSellerView(href: string) {
  const url = new URL(href, "https://camel-paper-catalogo.vercel.app");
  const hash = new URLSearchParams(url.hash.slice(1));
  const productId = hash.get("produto");
  if (url.hash) {
    return { productId, checkout: hash.get("tela") === "checkout" };
  }
  const tail = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  return {
    productId: tail.length === 2 && tail[0] === "catalogo" && tail[1] !== "checkout" ? tail[1] : null,
    checkout: url.pathname.replace(/\/$/, "") === "/catalogo/checkout",
  };
}

export function sellerViewUrl(productId: string | null, checkout = false) {
  const hash = new URLSearchParams();
  if (productId) hash.set("produto", productId);
  if (checkout) hash.set("tela", "checkout");
  return "/catalogo" + (hash.size ? "#" + hash.toString() : "");
}
