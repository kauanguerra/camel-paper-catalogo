"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Link2,
  PackageCheck,
  Search,
  Truck,
} from "lucide-react";
import AppSidebar from "@/components/AppSidebar";
import { supabase } from "@/lib/supabase";

type OrderStatus =
  | "draft"
  | "sent"
  | "under_review"
  | "approved"
  | "confirmed"
  | "partially_shipped"
  | "shipped"
  | "completed"
  | "cancelled";

type OrderSummary = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_company: string | null;
  seller_name: string | null;
  order_source: "customer_catalog" | "seller_store" | "manual" | string;
  status: OrderStatus;
  payment_method: string | null;
  payment_installments: number | null;
  total_value: number;
  created_at: string;
  confirmed_at: string | null;
  item_count: number;
  total_units: number;
  shipped_units: number;
  remaining_units: number;
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Rascunho",
  sent: "Recebido",
  under_review: "Em análise",
  approved: "Aprovado",
  confirmed: "Confirmado",
  partially_shipped: "Envio parcial",
  shipped: "Enviado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const STATUS_FILTERS: Array<{ value: "all" | OrderStatus; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "draft", label: "Rascunhos" },
  { value: "sent", label: "Recebidos" },
  { value: "under_review", label: "Em análise" },
  { value: "approved", label: "Aprovados" },
  { value: "confirmed", label: "Confirmados" },
  { value: "partially_shipped", label: "Envio parcial" },
  { value: "shipped", label: "Enviados" },
  { value: "completed", label: "Concluídos" },
  { value: "cancelled", label: "Cancelados" },
];

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function paymentLabel(method: string | null, installments: number | null) {
  if (!method) return "Não definido";

  const labels: Record<string, string> = {
    boleto: "Boleto",
    pix: "Pix",
    cartao_credito: "Cartão de crédito",
    cartao_debito: "Cartão de débito",
    transferencia: "Transferência",
    dinheiro: "Dinheiro",
    outro: "Outro",
  };

  const base = labels[method] || method;

  if (method === "cartao_credito" && installments && installments > 1) {
    return `${base} • ${installments}x`;
  }

  return base;
}

export default function PedidosPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");

  useEffect(() => {
    async function loadOrders() {
      setLoading(true);
      setLoadError("");

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (authError || !authData.user) {
          console.error("Erro ao identificar usuário:", authError);
          setLoadError("Não foi possível identificar o usuário conectado.");
          setOrders([]);
          return;
        }

        const user = authData.user;

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id,role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Erro ao carregar perfil:", profileError);
          setLoadError("Não foi possível carregar o perfil do usuário.");
          setOrders([]);
          return;
        }

        const role = profileData?.role || "viewer";
        let sellerOrderIds: string[] | null = null;

        // O vendedor enxerga somente pedidos efetivamente vinculados ao seu usuário.
        // Admin/Comercial mantêm a visão geral da central de pedidos.
        if (role === "seller") {
          const { data: sellerOrders, error: sellerOrdersError } = await supabase
            .from("orders")
            .select("id")
            .eq("created_by", user.id);

          if (sellerOrdersError) {
            console.error("Erro ao localizar pedidos do vendedor:", sellerOrdersError);
            setLoadError("Não foi possível carregar os pedidos deste vendedor.");
            setOrders([]);
            return;
          }

          sellerOrderIds = (sellerOrders || []).map((row) => row.id);

          if (sellerOrderIds.length === 0) {
            setOrders([]);
            return;
          }
        }

        let query = supabase
          .from("orders_summary")
          .select(
            `
            id,
            order_number,
            customer_name,
            customer_company,
            seller_name,
            order_source,
            status,
            payment_method,
            payment_installments,
            total_value,
            created_at,
            confirmed_at,
            item_count,
            total_units,
            shipped_units,
            remaining_units
          `
          );

        if (sellerOrderIds) {
          query = query.in("id", sellerOrderIds);
        }

        const { data, error } = await query.order("created_at", { ascending: false });

        if (error) {
          console.error("Erro ao carregar pedidos:", error);
          setLoadError("Não foi possível carregar os pedidos.");
          setOrders([]);
        } else {
          setOrders((data || []) as OrderSummary[]);
        }
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;

      const matchesSearch =
        !normalizedSearch ||
        String(order.order_number).includes(normalizedSearch) ||
        order.customer_name.toLowerCase().includes(normalizedSearch) ||
        (order.customer_company || "").toLowerCase().includes(normalizedSearch) ||
        (order.seller_name || "").toLowerCase().includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [orders, search, statusFilter]);

  const metrics = useMemo(() => {
    const activeOrders = orders.filter(
      (order) => order.status !== "cancelled" && order.status !== "completed"
    );

    return {
      total: orders.length,
      review: orders.filter((order) => order.status === "under_review").length,
      confirmed: orders.filter((order) =>
        ["confirmed", "partially_shipped", "shipped", "completed"].includes(
          order.status
        )
      ).length,
      remainingUnits: activeOrders.reduce(
        (total, order) => total + Number(order.remaining_units || 0),
        0
      ),
      totalValue: orders
        .filter((order) => order.status !== "cancelled")
        .reduce((total, order) => total + Number(order.total_value || 0), 0),
    };
  }, [orders]);

  return (
    <main className="shell">
      <AppSidebar />

      <div className="page">
        <section className="hero">
          <div>
            <span className="eyebrow">COMERCIAL • PEDIDOS</span>
            <h1>Pedidos</h1>
            <p>
              Acompanhe pedidos recebidos, aprovação, confirmação, faturamento,
              envio e saldo pendente de cada cliente.
            </p>
          </div>

          <div className="hero-actions">
            <button type="button" onClick={() => router.push("/catalogo")}>
              <FileText size={15} />
              Abrir catálogo
            </button>
          </div>
        </section>

        <section className="metrics">
          <article>
            <div className="metric-icon">
              <FileText size={17} />
            </div>
            <span>PEDIDOS</span>
            <strong>{metrics.total}</strong>
            <small>Total cadastrado</small>
          </article>

          <article>
            <div className="metric-icon">
              <Clock3 size={17} />
            </div>
            <span>EM ANÁLISE</span>
            <strong>{metrics.review}</strong>
            <small>Aguardando revisão</small>
          </article>

          <article>
            <div className="metric-icon">
              <CheckCircle2 size={17} />
            </div>
            <span>CONFIRMADOS</span>
            <strong>{metrics.confirmed}</strong>
            <small>Já aprovados no fluxo</small>
          </article>

          <article>
            <div className="metric-icon">
              <PackageCheck size={17} />
            </div>
            <span>SALDO PENDENTE</span>
            <strong>{metrics.remainingUnits}</strong>
            <small>Unidades ainda não enviadas</small>
          </article>

          <article className="metric-wide">
            <div className="metric-icon">
              <Truck size={17} />
            </div>
            <span>VALOR DOS PEDIDOS</span>
            <strong>{formatMoney(metrics.totalValue)}</strong>
            <small>Desconsiderando cancelados</small>
          </article>
        </section>

        <section className="panel">
          <div className="panel-top">
            <div className="search-box">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por pedido, cliente, empresa ou vendedor..."
              />
            </div>

            <small>{filteredOrders.length} pedido(s)</small>
          </div>

          <div className="filters">
            {STATUS_FILTERS.map((filter) => (
              <button
                type="button"
                key={filter.value}
                className={statusFilter === filter.value ? "active" : ""}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="empty-state">Carregando pedidos...</div>
          ) : loadError ? (
            <div className="empty-state error">{loadError}</div>
          ) : filteredOrders.length === 0 ? (
            <div className="empty-state">
              <strong>Nenhum pedido encontrado.</strong>
              <span>
                Quando um pedido for gerado pelo catálogo, ele aparecerá aqui.
              </span>
            </div>
          ) : (
            <div className="table-wrap">
              <div className="orders-table orders-head">
                <span>Pedido</span>
                <span>Cliente</span>
                <span>Status</span>
                <span>Pagamento</span>
                <span>Itens</span>
                <span>Saldo</span>
                <span>Total</span>
                <span />
              </div>

              {filteredOrders.map((order) => (
                <article className="orders-table order-row" key={order.id}>
                  <div className="order-number">
                    <strong>#{String(order.order_number).padStart(5, "0")}</strong>
                    <small>{formatDate(order.created_at)}</small>
                    {order.order_source === "customer_catalog" && (
                      <span className="source-badge source-link">
                        <Link2 size={10} />
                        Pedido via link
                      </span>
                    )}
                  </div>

                  <div className="customer">
                    <strong>
                      {order.customer_company || order.customer_name}
                    </strong>
                    <small>
                      {order.customer_company && order.customer_name
                        ? `A/C ${order.customer_name}`
                        : order.seller_name
                          ? `Vendedor: ${order.seller_name}`
                          : "Cliente"}
                    </small>
                  </div>

                  <div>
                    <span className={`status status-${order.status}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </div>

                  <div className="payment">
                    <strong>
                      {paymentLabel(
                        order.payment_method,
                        order.payment_installments
                      )}
                    </strong>
                    <small>
                      {order.confirmed_at
                        ? `Confirmado ${formatDate(order.confirmed_at)}`
                        : "Aguardando confirmação"}
                    </small>
                  </div>

                  <div className="numeric">
                    <strong>{Number(order.item_count || 0)}</strong>
                    <small>{Number(order.total_units || 0)} un.</small>
                  </div>

                  <div className="numeric">
                    <strong
                      className={
                        Number(order.remaining_units || 0) > 0
                          ? "remaining"
                          : "done"
                      }
                    >
                      {Number(order.remaining_units || 0)}
                    </strong>
                    <small>
                      {Number(order.shipped_units || 0)} enviadas
                    </small>
                  </div>

                  <div className="total">
                    <strong>{formatMoney(order.total_value)}</strong>
                  </div>

                  <button
                    type="button"
                    className="open-order"
                    onClick={() => router.push(`/pedidos/${order.id}`)}
                  >
                    Abrir pedido →
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        .shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 250px minmax(0, 1fr);
          background: #f5f2ef;
          color: #2b211d;
        }

        .page {
          min-width: 0;
          padding: 32px;
        }

        .hero {
          min-height: 190px;
          border-radius: 24px;
          padding: 32px;
          background:
            radial-gradient(
              circle at 88% 15%,
              rgba(255, 184, 115, 0.18),
              transparent 28%
            ),
            linear-gradient(135deg, #7c1f10, #9f321d);
          color: #fff;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          box-shadow: 0 18px 45px rgba(92, 34, 19, 0.12);
        }

        .hero > div:first-child {
          max-width: 760px;
        }

        .eyebrow {
          display: inline-block;
          margin-bottom: 10px;
          color: #ffc17c;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1.8px;
        }

        h1 {
          margin: 0;
          font-size: clamp(36px, 5vw, 58px);
          line-height: 0.96;
          letter-spacing: -2px;
        }

        .hero p {
          margin: 14px 0 0;
          max-width: 680px;
          color: rgba(255, 255, 255, 0.78);
          font-size: 13px;
          line-height: 1.6;
        }

        .hero-actions button {
          min-height: 42px;
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 11px;
          padding: 0 14px;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          backdrop-filter: blur(8px);
        }

        .metrics {
          margin-top: 20px;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }

        .metrics article {
          min-width: 0;
          border: 1px solid #e6ddd7;
          border-radius: 16px;
          background: #fff;
          padding: 15px;
          box-shadow: 0 8px 24px rgba(67, 44, 34, 0.04);
        }

        .metric-icon {
          width: 34px;
          height: 34px;
          margin-bottom: 12px;
          border-radius: 10px;
          background: #fff2e7;
          color: #8a2a18;
          display: grid;
          place-items: center;
        }

        .metrics span {
          display: block;
          color: #9b8d85;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .metrics strong {
          display: block;
          margin-top: 4px;
          color: #342820;
          font-size: 23px;
          line-height: 1;
          letter-spacing: -0.7px;
        }

        .metrics small {
          display: block;
          margin-top: 6px;
          color: #998c85;
          font-size: 9px;
        }

        .panel {
          margin-top: 20px;
          border: 1px solid #e3dad4;
          border-radius: 19px;
          background: #fff;
          overflow: hidden;
          box-shadow: 0 12px 34px rgba(68, 44, 33, 0.05);
        }

        .panel-top {
          padding: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          border-bottom: 1px solid #eee7e2;
        }

        .panel-top > small {
          color: #8e817a;
          font-size: 10px;
          white-space: nowrap;
        }

        .search-box {
          width: min(560px, 100%);
          min-height: 44px;
          border: 1px solid #e1d7d1;
          border-radius: 11px;
          background: #faf8f6;
          padding: 0 13px;
          display: flex;
          align-items: center;
          gap: 9px;
          color: #9a8d85;
        }

        .search-box input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: #392d27;
          font-size: 11px;
        }

        .filters {
          padding: 12px 16px;
          border-bottom: 1px solid #eee7e2;
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }

        .filters button {
          min-height: 32px;
          border: 1px solid #e1d7d1;
          border-radius: 999px;
          padding: 0 11px;
          background: #fff;
          color: #74665f;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .filters button.active {
          border-color: #ef7a00;
          background: #ef7a00;
          color: #fff;
        }

        .table-wrap {
          overflow-x: auto;
        }

        .orders-table {
          min-width: 1040px;
          display: grid;
          grid-template-columns:
            105px minmax(200px, 1.4fr) 110px minmax(150px, 1fr)
            80px 80px 120px 120px;
          gap: 14px;
          align-items: center;
        }

        .orders-head {
          padding: 12px 16px;
          background: #faf8f6;
          color: #a0938c;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }

        .order-row {
          padding: 14px 16px;
          border-top: 1px solid #f0e9e5;
          transition: background 0.16s ease;
        }

        .order-row:hover {
          background: #fffcfa;
        }

        .order-number,
        .customer,
        .payment,
        .numeric {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .order-number strong {
          color: #8a2a18;
          font-size: 12px;
        }

        .source-badge {
          width: fit-content;
          max-width: 100%;
          margin-top: 3px;
          border-radius: 999px;
          padding: 4px 7px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 7px;
          font-weight: 900;
          line-height: 1;
          white-space: nowrap;
        }

        .source-link {
          border: 1px solid #f0c49f;
          background: #fff3e8;
          color: #a5431f;
        }

        .order-number small,
        .customer small,
        .payment small,
        .numeric small {
          color: #9b8e87;
          font-size: 8px;
        }

        .customer strong,
        .payment strong {
          overflow: hidden;
          color: #463831;
          font-size: 10px;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .numeric strong {
          color: #3c2f29;
          font-size: 14px;
        }

        .numeric strong.remaining {
          color: #c35d22;
        }

        .numeric strong.done {
          color: #278358;
        }

        .total strong {
          color: #3e302a;
          font-size: 11px;
          white-space: nowrap;
        }

        .status {
          width: fit-content;
          max-width: 100%;
          border-radius: 999px;
          padding: 6px 8px;
          font-size: 8px;
          font-weight: 900;
          white-space: nowrap;
        }

        .status-draft {
          background: #f1efed;
          color: #766a64;
        }

        .status-sent {
          background: #fff3e3;
          color: #a65a1c;
        }

        .status-under_review {
          background: #fff8df;
          color: #8b6818;
        }

        .status-approved,
        .status-confirmed {
          background: #eef7f1;
          color: #33754c;
        }

        .status-partially_shipped {
          background: #f3effd;
          color: #6951a0;
        }

        .status-shipped,
        .status-completed {
          background: #e9f6f5;
          color: #24736d;
        }

        .status-cancelled {
          background: #fbeceb;
          color: #a0443e;
        }

        .open-order {
          min-height: 36px;
          border: 1px solid #e8d6c9;
          border-radius: 9px;
          background: #fff6ee;
          color: #8a2a18;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
          transition:
            transform 0.16s ease,
            background 0.16s ease;
        }

        .open-order:hover {
          transform: translateY(-1px);
          background: #fff0e3;
        }

        .empty-state {
          min-height: 260px;
          padding: 30px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 7px;
          color: #8f827b;
          text-align: center;
          font-size: 11px;
        }

        .empty-state strong {
          color: #4a3b34;
          font-size: 14px;
        }

        .empty-state.error {
          color: #a4483e;
        }

        @media (max-width: 1120px) {
          .metrics {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 980px) {
          .shell {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .page {
            padding: 18px 14px 40px;
          }

          .hero {
            min-height: 230px;
            padding: 24px 20px;
            align-items: flex-start;
            flex-direction: column;
          }

          .metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .metric-wide {
            grid-column: 1 / -1;
          }

          .panel-top {
            align-items: stretch;
            flex-direction: column;
          }

          .search-box {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
