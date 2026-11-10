export function readSellerView(href: string) {
  const url = new URL(href, "https://camel-paper-catalogo.vercel.app");
  const hash = new URLSearchParams(url.hash.slice(1));
  const productId = hash.get("produto");
  const brand = hash.get("marca") === "acrilex" ? "acrilex" : "camel-paper";
  if (url.hash) {
    return { brand, productId, checkout: hash.get("tela") === "checkout" };
  }
  const tail = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  return {
    brand,
    productId: tail.length === 2 && tail[0] === "catalogo" && tail[1] !== "checkout" ? tail[1] : null,
    checkout: url.pathname.replace(/\/$/, "") === "/catalogo/checkout",
  };
}

export function sellerViewUrl(productId: string | null, checkout = false, brand = "camel-paper") {
  const hash = new URLSearchParams();
  if (brand === "acrilex") hash.set("marca", "acrilex");
  if (productId) hash.set("produto", productId);
  if (checkout) hash.set("tela", "checkout");
  return "/catalogo" + (hash.size ? "#" + hash.toString() : "");
}

