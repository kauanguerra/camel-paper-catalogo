"use client";

import { useSellerCart } from "@/hooks/useSellerCart";

type SellerCartProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckout: () => void;
  showFloating?: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function optimizedImage(sourceUrl: string, width = 180, quality = 70) {
  const params = new URLSearchParams({
    src: sourceUrl,
    w: String(width),
    q: String(quality),
  });

  return `/api/catalog-image?${params.toString()}`;
}

export default function SellerCart({
  open,
  onOpenChange,
  onCheckout,
  showFloating = true,
}: SellerCartProps) {
  const {
    cart,
    cartUnits,
    cartTotal,
    updateQuantity,
    removeItem,
    clearCart,
  } = useSellerCart();

  return (
    <>
      {showFloating && (
        <button
          type="button"
          className={`seller-cart-floating${cart.length > 0 ? " has-items" : ""}`}
          onClick={() => onOpenChange(true)}
          aria-label="Abrir pedido em montagem"
        >
          <span className="seller-cart-icon" aria-hidden="true">🛒</span>
          <span className="seller-cart-floating-copy">
            <small>Pedido em montagem</small>
            <strong>{cartUnits} un. • {money(cartTotal)}</strong>
          </span>
          <b>{cart.length}</b>
        </button>
      )}

      {open && (
        <div
          className="seller-cart-backdrop"
          onMouseDown={() => onOpenChange(false)}
        >
          <aside
            className="seller-cart-drawer"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Pedido em montagem"
          >
            <header className="seller-cart-header">
              <div>
                <span>LOJA DO VENDEDOR</span>
                <h2>Pedido em montagem</h2>
                <p>{cart.length} item(ns) • {cartUnits} unidade(s)</p>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Fechar carrinho"
              >
                ×
              </button>
            </header>

            {cart.length === 0 ? (
              <div className="seller-cart-empty">
                <strong>Seu pedido está vazio.</strong>
                <p>Escolha produtos e variações para começar.</p>
              </div>
            ) : (
              <>
                <div className="seller-cart-items">
                  {cart.map((item) => (
                    <article className="seller-cart-item" key={item.key}>
                      <div className="seller-cart-item-image">
                        {item.image_url ? (
                          <img
                            src={optimizedImage(item.image_url)}
                            alt={item.product_name}
                          />
                        ) : (
                          <span>CP</span>
                        )}
                      </div>

                      <div className="seller-cart-item-copy">
                        <strong>{item.product_name}</strong>
                        {item.variant_name && <small>{item.variant_name}</small>}
                        {item.sku && <small>{item.sku}</small>}
                        <b>{money(item.unit_price)}</b>

                        <div className="seller-cart-item-controls">
                          <div className="seller-cart-quantity">
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(item.key, item.quantity - 1)
                              }
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={9999}
                              value={item.quantity}
                              onChange={(event) =>
                                updateQuantity(
                                  item.key,
                                  Number(event.target.value)
                                )
                              }
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(item.key, item.quantity + 1)
                              }
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            className="seller-cart-remove"
                            onClick={() => removeItem(item.key)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>

                      <strong className="seller-cart-line-total">
                        {money(item.quantity * item.unit_price)}
                      </strong>
                    </article>
                  ))}
                </div>

                <footer className="seller-cart-footer">
                  <div className="seller-cart-total">
                    <span>Total</span>
                    <strong>{money(cartTotal)}</strong>
                  </div>

                  <p>
                    O pedido fica salvo neste dispositivo e continua disponível
                    ao navegar entre o catálogo e as fichas dos produtos.
                  </p>

                  <button
                    type="button"
                    className="seller-cart-review"
                    onClick={onCheckout}
                  >
                    Revisar e finalizar pedido
                    <span>Próxima etapa</span>
                  </button>

                  <button
                    type="button"
                    className="seller-cart-clear"
                    onClick={clearCart}
                  >
                    Limpar pedido
                  </button>
                </footer>
              </>
            )}
          </aside>
        </div>
      )}

      <style jsx>{`
        .seller-cart-floating {
          position: fixed;
          right: 24px;
          bottom: 22px;
          z-index: 80;
          min-width: 232px;
          min-height: 58px;
          border: 1px solid #e4c7b6;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 18px 48px rgba(68, 35, 24, .18);
          color: #4b3931;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          cursor: pointer;
          font-family: inherit;
        }

        .seller-cart-floating.has-items {
          border-color: #d98c5b;
        }

        .seller-cart-icon {
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          border-radius: 11px;
          background: #fff0e3;
          display: grid;
          place-items: center;
          font-size: 17px;
        }

        .seller-cart-floating-copy {
          min-width: 0;
          flex: 1;
          text-align: left;
        }

        .seller-cart-floating-copy small,
        .seller-cart-floating-copy strong {
          display: block;
        }

        .seller-cart-floating-copy small {
          color: #9b8a80;
          font-size: 8px;
          margin-bottom: 2px;
        }

        .seller-cart-floating-copy strong {
          color: #8a2a18;
          font-size: 10px;
          white-space: nowrap;
        }

        .seller-cart-floating > b {
          min-width: 25px;
          height: 25px;
          padding: 0 6px;
          border-radius: 999px;
          background: #ef7a00;
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 9px;
        }

        .seller-cart-backdrop {
          position: fixed;
          inset: 0;
          z-index: 120;
          background: rgba(40, 29, 24, .34);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: flex-end;
        }

        .seller-cart-drawer {
          width: min(520px, 100%);
          height: 100%;
          background: #f7f3ef;
          box-shadow: -20px 0 60px rgba(44, 25, 17, .18);
          display: flex;
          flex-direction: column;
        }

        .seller-cart-header {
          padding: 22px 22px 18px;
          background: linear-gradient(120deg, #7b1f10, #a3381e);
          color: #fff;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .seller-cart-header span {
          display: block;
          color: #ffc07a;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.6px;
          margin-bottom: 5px;
        }

        .seller-cart-header h2 {
          margin: 0;
          font-size: 25px;
        }

        .seller-cart-header p {
          margin: 5px 0 0;
          color: rgba(255,255,255,.72);
          font-size: 10px;
        }

        .seller-cart-header > button {
          width: 36px;
          height: 36px;
          border: 1px solid rgba(255,255,255,.3);
          border-radius: 10px;
          background: rgba(255,255,255,.08);
          color: #fff;
          font-size: 22px;
          cursor: pointer;
        }

        .seller-cart-empty {
          flex: 1;
          display: grid;
          place-items: center;
          align-content: center;
          text-align: center;
          padding: 30px;
        }

        .seller-cart-empty strong {
          color: #49382f;
          font-size: 14px;
        }

        .seller-cart-empty p {
          margin: 6px 0 0;
          color: #93857d;
          font-size: 11px;
        }

        .seller-cart-items {
          flex: 1;
          overflow: auto;
          padding: 14px;
        }

        .seller-cart-item {
          border: 1px solid #e6ddd7;
          border-radius: 14px;
          background: #fff;
          padding: 11px;
          display: grid;
          grid-template-columns: 68px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: start;
          margin-bottom: 9px;
        }

        .seller-cart-item-image {
          width: 68px;
          height: 68px;
          border-radius: 10px;
          overflow: hidden;
          background: #faf7f4;
          display: grid;
          place-items: center;
          color: #8a2a18;
          font-weight: 900;
        }

        .seller-cart-item-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 5px;
          box-sizing: border-box;
        }

        .seller-cart-item-copy {
          min-width: 0;
        }

        .seller-cart-item-copy > strong,
        .seller-cart-item-copy > small,
        .seller-cart-item-copy > b {
          display: block;
        }

        .seller-cart-item-copy > strong {
          color: #42332c;
          font-size: 10px;
          line-height: 1.3;
        }

        .seller-cart-item-copy > small {
          margin-top: 2px;
          color: #94857d;
          font-size: 8px;
        }

        .seller-cart-item-copy > b {
          margin-top: 5px;
          color: #8a2a18;
          font-size: 10px;
        }

        .seller-cart-item-controls {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-top: 8px;
        }

        .seller-cart-quantity {
          width: 102px;
          min-height: 32px;
          border: 1px solid #e2d6ce;
          border-radius: 10px;
          background: #fff;
          display: grid;
          grid-template-columns: 31px 40px 31px;
          overflow: hidden;
        }

        .seller-cart-quantity button {
          border: 0;
          background: #fff8f3;
          color: #8a2a18;
          font-size: 14px;
          cursor: pointer;
        }

        .seller-cart-quantity input {
          width: 100%;
          border: 0;
          border-left: 1px solid #eee3dc;
          border-right: 1px solid #eee3dc;
          outline: 0;
          text-align: center;
          color: #3d302a;
          font-weight: 900;
          background: #fff;
          -moz-appearance: textfield;
        }

        .seller-cart-quantity input::-webkit-outer-spin-button,
        .seller-cart-quantity input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        .seller-cart-remove {
          border: 0;
          background: transparent;
          color: #a1483b;
          padding: 0;
          font-size: 8px;
          font-weight: 900;
          cursor: pointer;
        }

        .seller-cart-line-total {
          color: #3d2f29;
          font-size: 10px;
          white-space: nowrap;
        }

        .seller-cart-footer {
          border-top: 1px solid #e3d8d1;
          background: #fff;
          padding: 16px;
        }

        .seller-cart-total {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
        }

        .seller-cart-total span {
          color: #8d8079;
          font-size: 10px;
          font-weight: 800;
        }

        .seller-cart-total strong {
          color: #8a2a18;
          font-size: 24px;
          letter-spacing: -.7px;
        }

        .seller-cart-footer > p {
          margin: 8px 0 13px;
          color: #978a83;
          font-size: 8px;
          line-height: 1.5;
        }

        .seller-cart-review {
          width: 100%;
          min-height: 46px;
          border: 0;
          border-radius: 11px;
          background: #8a2a18;
          color: #fff;
          padding: 0 13px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .seller-cart-review:disabled {
          opacity: .62;
        }

        .seller-cart-review span {
          font-size: 8px;
          opacity: .7;
        }

        .seller-cart-clear {
          width: 100%;
          margin-top: 7px;
          min-height: 36px;
          border: 1px solid #e5dad3;
          border-radius: 9px;
          background: #fff;
          color: #8b7e77;
          font-size: 8px;
          font-weight: 900;
          cursor: pointer;
        }

        @media (max-width: 700px) {
          .seller-cart-floating {
            left: 14px;
            right: 14px;
            bottom: 14px;
            width: auto;
          }

          .seller-cart-drawer {
            width: 100%;
          }

          .seller-cart-item {
            grid-template-columns: 58px minmax(0, 1fr);
          }

          .seller-cart-item-image {
            width: 58px;
            height: 58px;
          }

          .seller-cart-line-total {
            grid-column: 2;
          }
        }
      `}</style>
    </>
  );
}
