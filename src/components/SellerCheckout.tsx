"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSellerCart } from "@/hooks/useSellerCart";

type SellerCheckoutProps = {
  open: boolean;
  onClose: () => void;
};

type CheckoutForm = {
  name: string;
  company: string;
  document: string;
  phone: string;
  email: string;
  zip_code: string;
  address: string;
  city: string;
  state: string;
  payment_method: string;
  payment_installments: number;
  shipping_value: string;
  customer_notes: string;
  internal_notes: string;
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function parseMoneyInput(value: string) {
  const normalized = value
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export default function SellerCheckout({
  open,
  onClose,
}: SellerCheckoutProps) {
  const router = useRouter();
  const { cart, cartUnits, cartTotal, clearCart } = useSellerCart();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [form, setForm] = useState<CheckoutForm>({
    name: "",
    company: "",
    document: "",
    phone: "",
    email: "",
    zip_code: "",
    address: "",
    city: "",
    state: "",
    payment_method: "",
    payment_installments: 1,
    shipping_value: "",
    customer_notes: "",
    internal_notes: "",
  });

  const shippingValue = useMemo(
    () => parseMoneyInput(form.shipping_value),
    [form.shipping_value]
  );

  const finalTotal = cartTotal + shippingValue;
  const nameInvalid = attempted && !form.name.trim();

  function setField<K extends keyof CheckoutForm>(
    field: K,
    value: CheckoutForm[K]
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function continueToConfirmation() {
    setAttempted(true);
    setSubmitError("");

    if (!form.name.trim()) {
      document.getElementById("seller-checkout-name")?.focus();
      return;
    }

    if (cart.length === 0) {
      setSubmitError("O pedido está vazio. Volte ao catálogo e adicione produtos.");
      return;
    }

    setConfirmationOpen(true);
  }

  async function createOrder() {
    setSubmitError("");

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSubmitError(
        "Você está sem conexão. O carrinho continua salvo neste dispositivo. Conecte-se à internet para finalizar o pedido."
      );
      return;
    }

    setSubmitting(true);

    try {
      const syncKey = crypto.randomUUID();

      const { data, error } = await supabase.rpc(
        "create_order_from_seller_store",
        {
          p_sync_key: syncKey,
          p_customer_id: null,
          p_customer: {
            name: form.name.trim(),
            company: form.company.trim() || null,
            document: form.document.trim() || null,
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            address: form.address.trim() || null,
            city: form.city.trim() || null,
            state: form.state.trim() || null,
            zip_code: form.zip_code.trim() || null,
          },
          p_items: cart.map((item) => ({
            product_id: item.product_id,
            variant_id: item.variant_id || null,
            quantity: item.quantity,
            notes: null,
          })),
          p_payment_method: form.payment_method || null,
          p_payment_installments: Math.max(
            1,
            Number(form.payment_installments || 1)
          ),
          p_payment_notes: null,
          p_shipping_value: shippingValue,
          p_customer_notes: form.customer_notes.trim() || null,
          p_internal_notes: form.internal_notes.trim() || null,
          p_source_device_id: null,
          p_submitted_at: new Date().toISOString(),
        }
      );

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.created_order_id) {
        throw new Error("O servidor não retornou o pedido criado.");
      }

      clearCart();
      setConfirmationOpen(false);
      router.replace(`/pedidos/${result.created_order_id}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível criar o pedido agora.";

      setSubmitError(
        `${message} O carrinho continua salvo e nenhum item foi perdido.`
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="checkout-backdrop">
      <section
        className="checkout-shell"
        aria-label="Revisar e finalizar pedido"
      >
        <header className="checkout-header">
          <div>
            <span>LOJA DO VENDEDOR</span>
            <h2>Revisar e finalizar pedido</h2>
            <p>
              Confira o cliente, a condição comercial e o resumo antes de criar
              o pedido.
            </p>
          </div>

          <button type="button" onClick={onClose} aria-label="Fechar revisão">
            ×
          </button>
        </header>

        <div className="checkout-content">
          <div className="checkout-form-column">
            <section className="checkout-card">
              <div className="section-heading">
                <span>01</span>
                <div>
                  <h3>Dados do cliente</h3>
                  <p>Identificação e contato para este pedido.</p>
                </div>
              </div>

              <div className="fields-grid">
                <label className="field field-wide">
                  <span>Nome do cliente *</span>
                  <input
                    id="seller-checkout-name"
                    value={form.name}
                    onChange={(event) => setField("name", event.target.value)}
                    placeholder="Nome completo"
                    className={nameInvalid ? "is-invalid" : ""}
                    autoComplete="name"
                  />
                  {nameInvalid && <small>Informe o nome do cliente.</small>}
                </label>

                <label className="field">
                  <span>Empresa</span>
                  <input
                    value={form.company}
                    onChange={(event) => setField("company", event.target.value)}
                    placeholder="Razão social ou nome fantasia"
                  />
                </label>

                <label className="field">
                  <span>CPF / CNPJ</span>
                  <input
                    value={form.document}
                    onChange={(event) => setField("document", event.target.value)}
                    placeholder="Documento"
                  />
                </label>

                <label className="field">
                  <span>Telefone</span>
                  <input
                    value={form.phone}
                    onChange={(event) => setField("phone", event.target.value)}
                    placeholder="(00) 00000-0000"
                    autoComplete="tel"
                  />
                </label>

                <label className="field">
                  <span>E-mail</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setField("email", event.target.value)}
                    placeholder="cliente@email.com"
                    autoComplete="email"
                  />
                </label>
              </div>
            </section>

            <section className="checkout-card">
              <div className="section-heading">
                <span>02</span>
                <div>
                  <h3>Entrega</h3>
                  <p>Endereço e valor de frete do pedido.</p>
                </div>
              </div>

              <div className="fields-grid address-grid">
                <label className="field">
                  <span>CEP</span>
                  <input
                    value={form.zip_code}
                    onChange={(event) => setField("zip_code", event.target.value)}
                    placeholder="00000-000"
                    autoComplete="postal-code"
                  />
                </label>

                <label className="field field-wide">
                  <span>Endereço</span>
                  <input
                    value={form.address}
                    onChange={(event) => setField("address", event.target.value)}
                    placeholder="Rua, número e complemento"
                    autoComplete="street-address"
                  />
                </label>

                <label className="field">
                  <span>Cidade</span>
                  <input
                    value={form.city}
                    onChange={(event) => setField("city", event.target.value)}
                    placeholder="Cidade"
                    autoComplete="address-level2"
                  />
                </label>

                <label className="field">
                  <span>Estado</span>
                  <input
                    value={form.state}
                    onChange={(event) =>
                      setField("state", event.target.value.toUpperCase().slice(0, 2))
                    }
                    placeholder="UF"
                    maxLength={2}
                    autoComplete="address-level1"
                  />
                </label>

                <label className="field">
                  <span>Frete</span>
                  <div className="money-input">
                    <b>R$</b>
                    <input
                      inputMode="decimal"
                      value={form.shipping_value}
                      onChange={(event) =>
                        setField("shipping_value", event.target.value)
                      }
                      placeholder="0,00"
                    />
                  </div>
                </label>
              </div>
            </section>

            <section className="checkout-card">
              <div className="section-heading">
                <span>03</span>
                <div>
                  <h3>Condição comercial</h3>
                  <p>Forma de pagamento e observações.</p>
                </div>
              </div>

              <div className="fields-grid">
                <label className="field">
                  <span>Forma de pagamento</span>
                  <select
                    value={form.payment_method}
                    onChange={(event) =>
                      setField("payment_method", event.target.value)
                    }
                  >
                    <option value="">Não informado</option>
                    <option value="pix">Pix</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_credito">Cartão de crédito</option>
                    <option value="cartao_debito">Cartão de débito</option>
                    <option value="boleto">Boleto</option>
                    <option value="transferencia">Transferência</option>
                    <option value="outro">Outro</option>
                  </select>
                </label>

                <label className="field">
                  <span>Parcelas</span>
                  <select
                    value={form.payment_installments}
                    onChange={(event) =>
                      setField(
                        "payment_installments",
                        Math.max(1, Number(event.target.value || 1))
                      )
                    }
                  >
                    {Array.from({ length: 12 }, (_, index) => index + 1).map(
                      (installment) => (
                        <option value={installment} key={installment}>
                          {installment}x
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="field field-wide">
                  <span>Observação para o cliente</span>
                  <textarea
                    value={form.customer_notes}
                    onChange={(event) =>
                      setField("customer_notes", event.target.value)
                    }
                    placeholder="Informação que pode acompanhar o pedido..."
                  />
                </label>

                <label className="field field-wide">
                  <span>Observação interna</span>
                  <textarea
                    value={form.internal_notes}
                    onChange={(event) =>
                      setField("internal_notes", event.target.value)
                    }
                    placeholder="Informação somente para a equipe..."
                  />
                </label>
              </div>
            </section>
          </div>

          <aside className="checkout-summary">
            <div className="summary-title">
              <span>RESUMO</span>
              <h3>Pedido em montagem</h3>
              <p>{cart.length} item(ns) • {cartUnits} unidade(s)</p>
            </div>

            <div className="summary-items">
              {cart.map((item) => (
                <article key={item.key}>
                  <div>
                    <strong>{item.product_name}</strong>
                    <small>
                      {item.variant_name ? `${item.variant_name} • ` : ""}
                      {item.quantity} un.
                    </small>
                  </div>
                  <b>{money(item.quantity * item.unit_price)}</b>
                </article>
              ))}
            </div>

            <div className="summary-values">
              <div>
                <span>Produtos</span>
                <b>{money(cartTotal)}</b>
              </div>
              <div>
                <span>Frete</span>
                <b>{money(shippingValue)}</b>
              </div>
              <div className="summary-total">
                <span>Total previsto</span>
                <strong>{money(finalTotal)}</strong>
              </div>
            </div>

            {submitError && (
              <div className="checkout-error" role="alert">
                <strong>Não foi possível finalizar o pedido</strong>
                <span>{submitError}</span>
              </div>
            )}

            <button
              type="button"
              className="confirm-button"
              onClick={continueToConfirmation}
              disabled={cart.length === 0}
            >
              Continuar para confirmação
              <span>→</span>
            </button>

            <button type="button" className="back-button" onClick={onClose} disabled={submitting}>
              Voltar ao carrinho
            </button>

            <small className="summary-note">
              O preço definitivo será validado pelo servidor ao criar o pedido.
            </small>
          </aside>
        </div>

        {confirmationOpen && (
          <div className="confirmation-layer">
            <div className="confirmation-card" role="dialog" aria-modal="true">
              <div className="confirmation-heading">
                <span>CONFIRMAÇÃO FINAL</span>
                <h3>Confira antes de criar o pedido</h3>
                <p>Depois da confirmação, o pedido será registrado na Central de Pedidos.</p>
              </div>

              <div className="confirmation-grid">
                <section>
                  <small>CLIENTE</small>
                  <strong>{form.company.trim() || form.name.trim()}</strong>
                  {form.company.trim() && <span>A/C {form.name.trim()}</span>}
                  {form.document.trim() && <span>{form.document.trim()}</span>}
                  {form.phone.trim() && <span>{form.phone.trim()}</span>}
                </section>

                <section>
                  <small>PAGAMENTO</small>
                  <strong>
                    {form.payment_method
                      ? `${form.payment_method.replaceAll("_", " ")} • ${form.payment_installments}x`
                      : "Não informado"}
                  </strong>
                  <span>Frete: {money(shippingValue)}</span>
                </section>
              </div>

              <div className="confirmation-items">
                <div className="confirmation-items-head">
                  <strong>{cart.length} item(ns)</strong>
                  <span>{cartUnits} unidade(s)</span>
                </div>

                {cart.map((item) => (
                  <article key={item.key}>
                    <div>
                      <strong>{item.product_name}</strong>
                      <small>
                        {item.variant_name ? `${item.variant_name} • ` : ""}
                        {item.quantity} un. × {money(item.unit_price)}
                      </small>
                    </div>
                    <b>{money(item.quantity * item.unit_price)}</b>
                  </article>
                ))}
              </div>

              <div className="confirmation-total">
                <span>Total final</span>
                <strong>{money(finalTotal)}</strong>
              </div>

              {submitError && (
                <div className="checkout-error" role="alert">
                  <strong>Não foi possível finalizar o pedido</strong>
                  <span>{submitError}</span>
                </div>
              )}

              <div className="confirmation-actions">
                <button
                  type="button"
                  className="confirmation-back"
                  onClick={() => setConfirmationOpen(false)}
                  disabled={submitting}
                >
                  Voltar e revisar
                </button>

                <button
                  type="button"
                  className="confirmation-confirm"
                  onClick={createOrder}
                  disabled={submitting}
                >
                  {submitting ? "Criando pedido..." : "Confirmar e criar pedido"}
                </button>
              </div>
            </div>
          </div>
        )}

        <style jsx>{`
          .checkout-backdrop {
            position: fixed;
            inset: 0;
            z-index: 180;
            background: rgba(39, 27, 22, .5);
            backdrop-filter: blur(5px);
            padding: 22px;
            overflow: auto;
          }

          .checkout-shell {
            width: min(1180px, 100%);
            min-height: min(760px, calc(100vh - 44px));
            margin: 0 auto;
            border: 1px solid #e3d5cd;
            border-radius: 20px;
            overflow: hidden;
            background: #f6f2ee;
            box-shadow: 0 28px 90px rgba(42, 24, 17, .28);
          }

          .checkout-header {
            min-height: 112px;
            padding: 22px 26px;
            background:
              radial-gradient(circle at 78% 20%, rgba(239,122,0,.16), transparent 28%),
              linear-gradient(120deg, #711b0e, #9b311a);
            color: #fff;
            display: flex;
            justify-content: space-between;
            gap: 20px;
            align-items: flex-start;
          }

          .checkout-header span,
          .summary-title > span {
            display: block;
            color: #ffc07a;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 1.6px;
          }

          .checkout-header h2 {
            margin: 5px 0 4px;
            font-size: 27px;
            letter-spacing: -.6px;
          }

          .checkout-header p {
            margin: 0;
            color: rgba(255,255,255,.72);
            font-size: 10px;
          }

          .checkout-header > button {
            width: 38px;
            height: 38px;
            border: 1px solid rgba(255,255,255,.28);
            border-radius: 11px;
            background: rgba(255,255,255,.08);
            color: #fff;
            font-size: 23px;
            cursor: pointer;
          }

          .checkout-content {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 360px;
            gap: 16px;
            padding: 16px;
            align-items: start;
          }

          .checkout-form-column {
            display: grid;
            gap: 12px;
          }

          .checkout-card,
          .checkout-summary {
            border: 1px solid #e5dad3;
            border-radius: 15px;
            background: #fff;
            box-shadow: 0 8px 22px rgba(69, 44, 32, .04);
          }

          .checkout-card {
            padding: 16px;
          }

          .section-heading {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 14px;
          }

          .section-heading > span {
            width: 30px;
            height: 30px;
            border-radius: 9px;
            background: #fff0e4;
            color: #a2391e;
            display: grid;
            place-items: center;
            font-size: 9px;
            font-weight: 900;
          }

          .section-heading h3 {
            margin: 0;
            color: #3e3029;
            font-size: 13px;
          }

          .section-heading p {
            margin: 3px 0 0;
            color: #9a8c84;
            font-size: 8px;
          }

          .fields-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .field {
            display: grid;
            gap: 5px;
          }

          .field-wide {
            grid-column: 1 / -1;
          }

          .field > span {
            color: #71635c;
            font-size: 8px;
            font-weight: 900;
          }

          .field input,
          .field select,
          .field textarea {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid #e3d8d1;
            border-radius: 10px;
            background: #fffdfb;
            color: #40322c;
            outline: none;
            font-family: inherit;
            font-size: 10px;
            transition: border-color .18s ease, box-shadow .18s ease;
          }

          .field input,
          .field select {
            min-height: 39px;
            padding: 0 11px;
          }

          .field textarea {
            min-height: 72px;
            resize: vertical;
            padding: 10px 11px;
          }

          .field input:focus,
          .field select:focus,
          .field textarea:focus {
            border-color: #df9c73;
            box-shadow: 0 0 0 3px rgba(239,122,0,.08);
          }

          .field input.is-invalid {
            border-color: #bd4937;
          }

          .field small {
            color: #b13d2c;
            font-size: 8px;
          }

          .address-grid {
            grid-template-columns: .7fr 1.3fr;
          }

          .money-input {
            min-height: 39px;
            border: 1px solid #e3d8d1;
            border-radius: 10px;
            background: #fffdfb;
            display: flex;
            align-items: center;
            overflow: hidden;
          }

          .money-input b {
            padding-left: 11px;
            color: #9a8a81;
            font-size: 9px;
          }

          .money-input input {
            border: 0;
            background: transparent;
            box-shadow: none !important;
          }

          .checkout-summary {
            position: sticky;
            top: 0;
            overflow: hidden;
          }

          .summary-title {
            padding: 17px;
            border-bottom: 1px solid #eee4de;
          }

          .summary-title h3 {
            margin: 5px 0 3px;
            color: #3f3029;
            font-size: 17px;
          }

          .summary-title p {
            margin: 0;
            color: #96877f;
            font-size: 9px;
          }

          .summary-items {
            max-height: 280px;
            overflow: auto;
            padding: 8px 14px;
          }

          .summary-items article {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 9px 2px;
            border-bottom: 1px solid #f0e8e3;
          }

          .summary-items article:last-child {
            border-bottom: 0;
          }

          .summary-items strong,
          .summary-items small {
            display: block;
          }

          .summary-items strong {
            color: #4a3b34;
            font-size: 9px;
            line-height: 1.35;
          }

          .summary-items small {
            margin-top: 3px;
            color: #998b83;
            font-size: 8px;
          }

          .summary-items b {
            color: #7d2819;
            font-size: 9px;
            white-space: nowrap;
          }

          .summary-values {
            border-top: 1px solid #eee4de;
            padding: 14px 16px;
          }

          .summary-values > div {
            display: flex;
            justify-content: space-between;
            gap: 14px;
            margin-bottom: 8px;
            color: #84766f;
            font-size: 9px;
          }

          .summary-values .summary-total {
            margin: 12px 0 0;
            padding-top: 12px;
            border-top: 1px solid #eee3dc;
            align-items: flex-end;
          }

          .summary-total strong {
            color: #8a2a18;
            font-size: 22px;
            letter-spacing: -.6px;
          }

          .checkout-error {
            margin: 0 16px 12px;
            padding: 11px 12px;
            border: 1px solid #e7b7aa;
            border-radius: 10px;
            background: #fff2ee;
            color: #8f2a18;
            display: grid;
            gap: 4px;
          }

          .checkout-error strong {
            font-size: 9px;
          }

          .checkout-error span {
            font-size: 8px;
            line-height: 1.45;
          }

          .confirm-button,
          .back-button {
            width: calc(100% - 32px);
            margin-left: 16px;
            margin-right: 16px;
            border-radius: 10px;
            font-family: inherit;
            font-weight: 900;
            cursor: pointer;
          }

          .confirm-button {
            min-height: 46px;
            border: 0;
            background: linear-gradient(135deg, #8f2a18, #a83a1e);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 13px;
            font-size: 10px;
          }

          .confirm-button:disabled {
            opacity: .55;
            cursor: not-allowed;
          }

          .back-button {
            min-height: 36px;
            margin-top: 7px;
            border: 1px solid #e4d9d2;
            background: #fff;
            color: #75675f;
            font-size: 8px;
          }

          .back-button:disabled {
            opacity: .55;
            cursor: not-allowed;
          }

          .summary-note {
            display: block;
            margin: 10px 16px 16px;
            color: #a0928a;
            font-size: 7px;
            line-height: 1.45;
            text-align: center;
          }

          .confirmation-layer {
            position: fixed;
            inset: 0;
            z-index: 2147483001;
            background: rgba(39, 27, 22, .62);
            backdrop-filter: blur(7px);
            display: grid;
            place-items: center;
            padding: 22px;
            overflow: auto;
          }

          .confirmation-card {
            width: min(760px, 100%);
            max-height: calc(100vh - 44px);
            overflow: auto;
            border: 1px solid #dfd1c9;
            border-radius: 18px;
            background: #fff;
            box-shadow: 0 30px 90px rgba(42, 24, 17, .34);
            padding: 22px;
          }

          .confirmation-heading > span {
            display: block;
            color: #ef7a00;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 1.5px;
          }

          .confirmation-heading h3 {
            margin: 5px 0 4px;
            color: #382a24;
            font-size: 24px;
          }

          .confirmation-heading p {
            margin: 0;
            color: #8f8179;
            font-size: 9px;
          }

          .confirmation-grid {
            margin-top: 16px;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .confirmation-grid section {
            border: 1px solid #e9dfd9;
            border-radius: 12px;
            background: #fffaf6;
            padding: 12px;
            display: grid;
            gap: 3px;
          }

          .confirmation-grid small {
            color: #a49790;
            font-size: 7px;
            font-weight: 900;
            letter-spacing: 1px;
          }

          .confirmation-grid strong {
            color: #46362f;
            font-size: 11px;
          }

          .confirmation-grid span {
            color: #8f817a;
            font-size: 8px;
          }

          .confirmation-items {
            margin-top: 12px;
            border: 1px solid #e9dfd9;
            border-radius: 12px;
            overflow: hidden;
          }

          .confirmation-items-head {
            padding: 11px 12px;
            background: #faf6f3;
            display: flex;
            justify-content: space-between;
            gap: 12px;
            color: #75675f;
            font-size: 9px;
          }

          .confirmation-items article {
            padding: 10px 12px;
            display: flex;
            justify-content: space-between;
            gap: 12px;
            border-top: 1px solid #f0e8e3;
          }

          .confirmation-items article strong,
          .confirmation-items article small {
            display: block;
          }

          .confirmation-items article strong {
            color: #473830;
            font-size: 9px;
          }

          .confirmation-items article small {
            margin-top: 3px;
            color: #9a8c84;
            font-size: 8px;
          }

          .confirmation-items article b {
            color: #8a2a18;
            font-size: 9px;
            white-space: nowrap;
          }

          .confirmation-total {
            margin-top: 12px;
            border-top: 1px solid #eadfd8;
            padding-top: 14px;
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 16px;
          }

          .confirmation-total span {
            color: #887a72;
            font-size: 10px;
          }

          .confirmation-total strong {
            color: #8a2a18;
            font-size: 28px;
          }

          .confirmation-actions {
            margin-top: 16px;
            display: grid;
            grid-template-columns: 1fr 1.3fr;
            gap: 10px;
          }

          .confirmation-actions button {
            min-height: 46px;
            border-radius: 11px;
            font-family: inherit;
            font-size: 10px;
            font-weight: 900;
            cursor: pointer;
          }

          .confirmation-back {
            border: 1px solid #e2d7d0;
            background: #fff;
            color: #74665e;
          }

          .confirmation-confirm {
            border: 0;
            background: linear-gradient(135deg, #8f2a18, #a83a1e);
            color: #fff;
          }

          .confirmation-actions button:disabled {
            opacity: .55;
            cursor: not-allowed;
          }

          @media (max-width: 900px) {
            .checkout-backdrop {
              padding: 0;
            }

            .checkout-shell {
              min-height: 100vh;
              border-radius: 0;
              border: 0;
            }

            .checkout-content {
              grid-template-columns: 1fr;
            }

            .checkout-summary {
              position: static;
            }

            .confirmation-grid,
            .confirmation-actions {
              grid-template-columns: 1fr;
            }
          }

          @media (max-width: 600px) {
            .checkout-header {
              padding: 18px;
            }

            .checkout-header h2 {
              font-size: 22px;
            }

            .fields-grid,
            .address-grid {
              grid-template-columns: 1fr;
            }

            .field-wide {
              grid-column: auto;
            }
          }
        `}</style>
      </section>
    </div>
  );
}
