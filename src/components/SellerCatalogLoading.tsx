"use client";

type SellerCatalogLoadingProps = {
  mode?: "catalog" | "product";
};

export default function SellerCatalogLoading({
  mode = "catalog",
}: SellerCatalogLoadingProps) {
  return (
    <main className="seller-loading">
      <div className="seller-loading-card">
        <div className="seller-loading-spinner" />
        <div>
          <strong>
            {mode === "product"
              ? "Carregando produto..."
              : "Carregando Loja do Vendedor..."}
          </strong>
          <span>
            {mode === "product"
              ? "Preparando fotos, variações e preço."
              : "Preparando produtos, categorias e preços."}
          </span>
        </div>
      </div>

      <style jsx>{`
        .seller-loading {
          min-height: 100vh;
          background: #f6f2ee;
          display: grid;
          place-items: center;
          color: #4b3931;
        }

        .seller-loading-card {
          display: flex;
          align-items: center;
          gap: 14px;
          border: 1px solid #eadfd8;
          border-radius: 16px;
          background: #fff;
          padding: 18px 22px;
          box-shadow: 0 16px 42px rgba(70,47,36,.08);
        }

        .seller-loading-spinner {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 3px solid #f0ded2;
          border-top-color: #ef7a00;
          animation: spin .8s linear infinite;
        }

        strong,
        span {
          display: block;
        }

        strong {
          font-size: 13px;
        }

        span {
          margin-top: 4px;
          color: #97887f;
          font-size: 9px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
