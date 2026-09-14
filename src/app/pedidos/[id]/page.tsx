"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileDown,
  FileText,
  Paperclip,
  PackageCheck,
  Trash2,
  UploadCloud,
  Pencil,
  Save,
  Send,
  Truck,
  X,
} from "lucide-react";
import AppSidebar from "@/components/AppSidebar";
import { supabase } from "@/lib/supabase";
import {
  type CatalogImageRecord,
  getOptimizedCatalogImageUrl,
  resolveCatalogPresentationImage,
  resolveCatalogVariantImage,
} from "@/lib/catalog-image-policy";

type Role = "admin" | "commercial" | "seller" | "viewer";
type OrderStatus =
  | "draft" | "sent" | "under_review" | "approved" | "confirmed"
  | "partially_shipped" | "shipped" | "completed" | "cancelled";

type Profile = { id: string; name: string | null; role: Role | null };

type Order = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_company: string | null;
  customer_document: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_zip_code: string | null;
  subtotal: number;
  discount_value: number;
  shipping_value: number;
  total_value: number;
  payment_method: string | null;
  payment_installments: number | null;
  payment_notes: string | null;
  customer_notes: string | null;
  internal_notes: string | null;
  status: OrderStatus;
  confirmed_at: string | null;
  confirmed_by: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  seller_name: string | null;
  created_by: string | null;
  order_source: "customer_catalog" | "seller_store" | "manual" | string | null;
  created_at: string;
  updated_at: string;
};

type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  sku: string | null;
  barcode: string | null;
  internal_code: string | null;
  image_url: string | null;
  quantity: number;
  shipped_quantity: number;
  original_unit_price: number | null;
  unit_price: number;
  discount_value: number;
  discount_percent: number;
  line_total: number;
  notes: string | null;
};

type OrderFile = {
  id: string;
  file_type: string;
  file_name: string;
  file_url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  notes: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
};

type Shipment = {
  id: string;
  shipment_number: number;
  status: string;
  invoice_number: string | null;
  tracking_code: string | null;
  carrier: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_by_name: string | null;
  created_at: string;
  item_count: number;
  total_units: number;
};

type HistoryEvent = {
  id: string;
  event_type: "status" | "audit";
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by_name: string | null;
  notes: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Rascunho",
  sent: "Recebido",
  under_review: "Em revisão",
  approved: "Aprovado",
  confirmed: "Confirmado",
  partially_shipped: "Envio parcial",
  shipped: "Enviado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function paymentLabel(method: string | null, installments: number | null) {
  const labels: Record<string, string> = {
    boleto: "Boleto",
    pix: "Pix",
    cartao_credito: "Cartão de crédito",
    cartao_debito: "Cartão de débito",
    transferencia: "Transferência",
    dinheiro: "Dinheiro",
    outro: "Outro",
  };
  if (!method) return "Não definido";
  const label = labels[method] || method;
  if (method === "cartao_credito" && installments && installments > 1) {
    return `${label} • ${installments}x`;
  }
  return label;
}

function eventLabel(action: string) {
  const labels: Record<string, string> = {
    order_created: "Pedido criado",
    order_updated: "Pedido atualizado",
    item_added: "Item adicionado",
    item_updated: "Item atualizado",
    item_removed: "Item removido",
    status_changed: "Status alterado",
    payment_changed: "Pagamento alterado",
    price_changed: "Preço alterado",
    quantity_changed: "Quantidade alterada",
    discount_changed: "Desconto alterado",
    shipment_created: "Remessa criada",
    shipment_updated: "Remessa atualizada",
    file_added: "Documento adicionado",
    file_removed: "Documento removido",
    order_confirmed: "Pedido confirmado",
    order_cancelled: "Pedido cancelado",
    sent: "Recebido",
    under_review: "Em revisão",
    confirmed: "Confirmado",
    partially_shipped: "Envio parcial",
    shipped: "Enviado",
    completed: "Concluído",
    cancelled: "Cancelado",
  };
  return labels[action] || action;
}

const FILE_TYPE_OPTIONS = [
  { value: "order_pdf", label: "Pedido comercial" },
  { value: "invoice", label: "Nota fiscal" },
  { value: "invoice_xml", label: "XML NF-e" },
  { value: "boleto", label: "Boleto" },
  { value: "receipt", label: "Comprovante" },
  { value: "shipping_document", label: "Documento de transporte" },
  { value: "other", label: "Outro" },
] as const;

function fileTypeLabel(value: string) {
  return (
    FILE_TYPE_OPTIONS.find((option) => option.value === value)?.label ||
    "Documento"
  );
}

function fileSizeLabel(value: number | null | undefined) {
  const bytes = Number(value || 0);
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}


export default function PedidoDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [catalogImages, setCatalogImages] = useState<CatalogImageRecord[]>([]);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const [editCustomer, setEditCustomer] = useState(false);
  const [editCommercial, setEditCommercial] = useState(false);
  const [editItems, setEditItems] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [shipmentOpen, setShipmentOpen] = useState(false);

  const [customerDraft, setCustomerDraft] = useState<Record<string, string>>({});
  const [commercialDraft, setCommercialDraft] = useState({
    payment_method: "",
    payment_installments: 1,
    payment_notes: "",
    discount_value: 0,
    shipping_value: 0,
    customer_notes: "",
    internal_notes: "",
  });
  const [itemDrafts, setItemDrafts] = useState<Record<string, {
    quantity: number;
    unit_price: number;
    discount_percent: number;
    notes: string;
  }>>({});
  const [shipmentDrafts, setShipmentDrafts] = useState<Record<string, number>>({});
  const [shipmentMeta, setShipmentMeta] = useState({
    carrier: "",
    tracking_code: "",
    invoice_number: "",
    notes: "",
  });

  const [documentOpen, setDocumentOpen] = useState(false);
  const [documentType, setDocumentType] = useState("invoice");
  const [documentNotes, setDocumentNotes] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentDragging, setDocumentDragging] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentDeleting, setDocumentDeleting] = useState<OrderFile | null>(null);
  const [documentActionId, setDocumentActionId] = useState<string | null>(null);

  const role = profile?.role || "viewer";
  const isAdminOrCommercial = ["admin", "commercial"].includes(role);
  const isSeller = role === "seller";

  // Regra geral do fluxo comercial:
  // - vendedor cuida da parte operacional do pedido;
  // - Admin/Comercial controlam preço, desconto e aprovação/confirmacao comercial.
  const isCompleted = order?.status === "completed";
  const canEditOrder = (isAdminOrCommercial || isSeller) && !isCompleted;
  const canEditPrice = isAdminOrCommercial && !isCompleted;
  const canConfirm = isAdminOrCommercial && !isCompleted;
  const canShip = (isAdminOrCommercial || isSeller) && !isCompleted;
  const canManageDocuments = isAdminOrCommercial;
  const canViewDocuments = ["admin", "commercial", "seller"].includes(role);

  async function loadAll() {
    if (!orderId) return;
    setLoading(true);

    const [
      authResult,
      orderResult,
      itemsResult,
      filesResult,
      shipmentsResult,
      historyResult,
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("orders").select("*").eq("id", orderId).single(),
      supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
      supabase.from("order_files").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
      supabase.from("order_shipments_summary").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
      supabase.from("order_history").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    ]);

    let loadedProfile: Profile | null = null;

    if (authResult.data.user) {
      const { data } = await supabase
        .from("profiles")
        .select("id,name,role")
        .eq("id", authResult.data.user.id)
        .maybeSingle();

      loadedProfile = (data || {
        id: authResult.data.user.id,
        name: authResult.data.user.email || "Usuário",
        role: "viewer",
      }) as Profile;

      setProfile(loadedProfile);
    }

    if (orderResult.error || !orderResult.data) {
      console.error(orderResult.error);
      setOrder(null);
      setLoading(false);
      return;
    }

    const loadedOrder = orderResult.data as Order;

    // Segurança visual da rota:
    // seller só pode abrir pedidos vinculados ao próprio usuário.
    // Admin/Comercial continuam com acesso global.
    if (
      loadedProfile?.role === "seller" &&
      (!loadedOrder.created_by || loadedOrder.created_by !== loadedProfile.id)
    ) {
      setOrder(null);
      setItems([]);
      setCatalogImages([]);
      setFiles([]);
      setShipments([]);
      setHistory([]);
      setLoading(false);
      return;
    }

    const loadedItems = (itemsResult.data || []) as OrderItem[];

    const productIds = Array.from(
      new Set(
        loadedItems
          .map((item) => item.product_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    let loadedCatalogImages: CatalogImageRecord[] = [];

    if (productIds.length > 0) {
      const { data: imageData, error: imageError } = await supabase
        .from("product_images")
        .select(
          "id,product_id,image_url,catalog_slot,image_type,is_primary,approved,source,variant_id"
        )
        .in("product_id", productIds);

      if (imageError) {
        console.error("Erro ao carregar imagens profissionais do pedido:", imageError);
      } else {
        loadedCatalogImages = (imageData || []) as CatalogImageRecord[];
      }
    }

    setOrder(loadedOrder);
    setItems(loadedItems);
    setCatalogImages(loadedCatalogImages);
    setFiles((filesResult.data || []) as OrderFile[]);
    setShipments((shipmentsResult.data || []) as Shipment[]);
    setHistory((historyResult.data || []) as HistoryEvent[]);

    setCustomerDraft({
      customer_name: loadedOrder.customer_name || "",
      customer_company: loadedOrder.customer_company || "",
      customer_document: loadedOrder.customer_document || "",
      customer_email: loadedOrder.customer_email || "",
      customer_phone: loadedOrder.customer_phone || "",
      customer_address: loadedOrder.customer_address || "",
      customer_city: loadedOrder.customer_city || "",
      customer_state: loadedOrder.customer_state || "",
      customer_zip_code: loadedOrder.customer_zip_code || "",
    });

    setCommercialDraft({
      payment_method: loadedOrder.payment_method || "",
      payment_installments: loadedOrder.payment_installments || 1,
      payment_notes: loadedOrder.payment_notes || "",
      discount_value: Number(loadedOrder.discount_value || 0),
      shipping_value: Number(loadedOrder.shipping_value || 0),
      customer_notes: loadedOrder.customer_notes || "",
      internal_notes: loadedOrder.internal_notes || "",
    });

    const drafts: Record<string, {
      quantity: number;
      unit_price: number;
      discount_percent: number;
      notes: string;
    }> = {};

    loadedItems.forEach((item) => {
      drafts[item.id] = {
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0),
        discount_percent: Number(item.discount_percent || 0),
        notes: item.notes || "",
      };
    });
    setItemDrafts(drafts);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const totals = useMemo(() => {
    const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const shippedUnits = items.reduce((sum, item) => sum + Number(item.shipped_quantity || 0), 0);
    return {
      totalUnits,
      shippedUnits,
      remainingUnits: Math.max(totalUnits - shippedUnits, 0),
    };
  }, [items]);

  function flash(message: string) {
    setFeedback(message);
    window.setTimeout(() => setFeedback(""), 3200);
  }

  function resolveOrderItemImage(item: OrderItem) {
    if (!item.product_id) return item.image_url;

    const professionalVariant = item.variant_id
      ? resolveCatalogVariantImage(
          catalogImages,
          item.product_id,
          item.variant_id
        )
      : null;

    const professionalProduct = resolveCatalogPresentationImage(
      catalogImages,
      item.product_id
    );

    const selected =
      professionalVariant?.image_url ||
      professionalProduct?.image_url ||
      item.image_url;

    return selected
      ? getOptimizedCatalogImageUrl(selected, 180, 82)
      : null;
  }

  async function audit(
    action: string,
    fieldName?: string | null,
    oldValue?: string | null,
    newValue?: string | null,
    notes?: string | null,
    orderItemId?: string | null
  ) {
    if (!order) return;
    await supabase.rpc("add_order_audit", {
      p_order_id: order.id,
      p_action: action,
      p_field_name: fieldName || null,
      p_old_value: oldValue || null,
      p_new_value: newValue || null,
      p_changed_by: profile?.id || null,
      p_changed_by_name: profile?.name || null,
      p_notes: notes || null,
      p_order_item_id: orderItemId || null,
    });
  }

  async function saveCustomer() {
    if (!order || !canEditOrder) return;
    setSaving(true);

    const payload = {
      customer_name: customerDraft.customer_name?.trim() || order.customer_name,
      customer_company: customerDraft.customer_company?.trim() || null,
      customer_document: customerDraft.customer_document?.trim() || null,
      customer_email: customerDraft.customer_email?.trim() || null,
      customer_phone: customerDraft.customer_phone?.trim() || null,
      customer_address: customerDraft.customer_address?.trim() || null,
      customer_city: customerDraft.customer_city?.trim() || null,
      customer_state: customerDraft.customer_state?.trim() || null,
      customer_zip_code: customerDraft.customer_zip_code?.trim() || null,
    };

    const { error } = await supabase.from("orders").update(payload).eq("id", order.id);
    if (error) {
      flash(error.message);
    } else {
      await audit("order_updated", "customer", null, null, "Dados do cliente atualizados.");
      setEditCustomer(false);
      await loadAll();
      flash("Dados do cliente atualizados.");
    }
    setSaving(false);
  }

  async function saveCommercial() {
    if (!order || !canEditPrice) return;
    setSaving(true);

    const subtotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const totalValue =
      subtotal - Number(commercialDraft.discount_value || 0) + Number(commercialDraft.shipping_value || 0);

    const payload = {
      payment_method: commercialDraft.payment_method || null,
      payment_installments: Number(commercialDraft.payment_installments || 1),
      payment_notes: commercialDraft.payment_notes.trim() || null,
      discount_value: Number(commercialDraft.discount_value || 0),
      shipping_value: Number(commercialDraft.shipping_value || 0),
      subtotal,
      total_value: totalValue,
      customer_notes: commercialDraft.customer_notes.trim() || null,
      internal_notes: commercialDraft.internal_notes.trim() || null,
    };

    const { error } = await supabase.from("orders").update(payload).eq("id", order.id);
    if (error) {
      flash(error.message);
    } else {
      if (
        order.payment_method !== payload.payment_method ||
        Number(order.payment_installments || 1) !== payload.payment_installments
      ) {
        await audit(
          "payment_changed",
          "payment",
          paymentLabel(order.payment_method, order.payment_installments),
          paymentLabel(payload.payment_method, payload.payment_installments)
        );
      }

      if (Number(order.discount_value || 0) !== payload.discount_value) {
        await audit(
          "discount_changed",
          "discount_value",
          String(order.discount_value || 0),
          String(payload.discount_value)
        );
      }

      setEditCommercial(false);
      await loadAll();
      flash("Condição comercial atualizada.");
    }
    setSaving(false);
  }

  async function saveItems() {
    if (!order || !canEditOrder) return;
    setSaving(true);

    for (const item of items) {
      const draft = itemDrafts[item.id];
      if (!draft) continue;

      const quantity = Math.max(1, Number(draft.quantity || 1));
      const unitPrice = canEditPrice
        ? Math.max(0, Number(draft.unit_price || 0))
        : Number(item.unit_price || 0);
      const discountPercent = canEditPrice
        ? Math.min(Math.max(Number(draft.discount_percent || 0), 0), 100)
        : Number(item.discount_percent || 0);

      const quantityChanged = quantity !== Number(item.quantity);
      const priceChanged = unitPrice !== Number(item.unit_price);
      const discountChanged =
        discountPercent !== Number(item.discount_percent || 0);
      const notesChanged = (draft.notes || "") !== (item.notes || "");

      if (!quantityChanged && !priceChanged && !discountChanged && !notesChanged) continue;

      const { error } = await supabase
        .from("order_items")
        .update({
          quantity,
          unit_price: unitPrice,
          discount_percent: discountPercent,
          notes: draft.notes.trim() || null,
        })
        .eq("id", item.id);

      if (error) {
        flash(error.message);
        setSaving(false);
        return;
      }

      if (quantityChanged) await audit("quantity_changed", "quantity", String(item.quantity), String(quantity), null, item.id);
      if (priceChanged) await audit("price_changed", "unit_price", String(item.unit_price), String(unitPrice), null, item.id);
      if (discountChanged) await audit("discount_changed", "discount_percent", `${Number(item.discount_percent || 0)}%`, `${discountPercent}%`, null, item.id);
      if (notesChanged) await audit("item_updated", "notes", item.notes || "", draft.notes || "", null, item.id);
    }

    const { data } = await supabase.from("order_items").select("*").eq("order_id", order.id);
    const refreshed = (data || []) as OrderItem[];
    const subtotal = refreshed.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const totalValue = subtotal - Number(order.discount_value || 0) + Number(order.shipping_value || 0);

    await supabase.from("orders").update({ subtotal, total_value: totalValue }).eq("id", order.id);

    setEditItems(false);
    await loadAll();
    flash("Itens atualizados.");
    setSaving(false);
  }

  async function setStatus(newStatus: OrderStatus, notes?: string) {
    if (!order) return;

    const previous = order.status;
    const payload: Record<string, unknown> = { status: newStatus };

    if (newStatus === "confirmed") {
      payload.confirmed_at = new Date().toISOString();
      payload.confirmed_by = profile?.id || null;
    }
    if (newStatus === "shipped") payload.shipped_at = new Date().toISOString();
    if (newStatus === "completed") payload.completed_at = new Date().toISOString();

    const { error } = await supabase.from("orders").update(payload).eq("id", order.id);
    if (error) {
      flash(error.message);
      return;
    }

    await supabase.from("order_status_history").insert({
      order_id: order.id,
      previous_status: previous,
      new_status: newStatus,
      changed_by: profile?.id || null,
      changed_by_name: profile?.name || null,
      notes: notes || null,
    });

    await audit(
      newStatus === "confirmed" ? "order_confirmed" : "status_changed",
      "status",
      previous,
      newStatus,
      notes || null
    );

    await loadAll();
  }

  async function confirmOrder() {
    if (!order || !canConfirm) return;
    setSaving(true);
    await setStatus("confirmed", "Pedido revisado e confirmado.");
    setConfirmOpen(false);
    setSaving(false);
    flash("Pedido confirmado.");
  }

  async function startReview() {
    if (!order || !canConfirm || order.status !== "sent") return;
    setSaving(true);
    await setStatus(
      "under_review",
      order.order_source === "customer_catalog"
        ? "Revisão comercial iniciada para pedido recebido via link."
        : "Revisão comercial iniciada."
    );
    setSaving(false);
    flash("Pedido movido para revisão comercial.");
  }

  async function approveOrder() {
    if (
      !order ||
      !canConfirm ||
      order.order_source !== "customer_catalog" ||
      order.status !== "under_review"
    ) {
      return;
    }

    setSaving(true);
    await setStatus(
      "approved",
      "Pedido via link aprovado após revisão comercial."
    );
    setSaving(false);
    flash("Pedido aprovado. Agora ele pode ser confirmado.");
  }

  async function completeOrder() {
    if (
      !order ||
      !canConfirm ||
      order.status !== "shipped" ||
      totals.remainingUnits !== 0
    ) return;

    setSaving(true);
    await setStatus(
      "completed",
      "Pedido concluído após o envio integral de todas as unidades."
    );
    setCompleteOpen(false);
    setSaving(false);
    flash("Pedido concluído com sucesso.");
  }

  function openShipment() {
    const draft: Record<string, number> = {};
    items.forEach((item) => {
      if (Number(item.quantity) - Number(item.shipped_quantity) > 0) {
        draft[item.id] = 0;
      }
    });
    setShipmentDrafts(draft);
    setShipmentMeta({ carrier: "", tracking_code: "", invoice_number: "", notes: "" });
    setShipmentOpen(true);
  }

  async function registerShipment() {
    if (!order || !canShip || saving) return;

    const selected = items
      .map((item) => ({
        order_item_id: item.id,
        quantity: Number(shipmentDrafts[item.id] || 0),
        remaining: Math.max(
          Number(item.quantity) - Number(item.shipped_quantity),
          0
        ),
      }))
      .filter((entry) => entry.quantity > 0);

    if (selected.length === 0) {
      flash("Informe pelo menos uma quantidade para envio.");
      return;
    }

    if (
      selected.some(
        (entry) =>
          !Number.isInteger(entry.quantity) ||
          entry.quantity < 1 ||
          entry.quantity > entry.remaining
      )
    ) {
      flash("Revise as quantidades. Nenhum item pode ultrapassar o saldo.");
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase.rpc("register_order_shipment", {
        p_order_id: order.id,
        p_items: selected.map(({ order_item_id, quantity }) => ({
          order_item_id,
          quantity,
        })),
        p_carrier: shipmentMeta.carrier.trim() || null,
        p_tracking_code: shipmentMeta.tracking_code.trim() || null,
        p_invoice_number: shipmentMeta.invoice_number.trim() || null,
        p_notes: shipmentMeta.notes.trim() || null,
      });

      if (error) {
        console.error("Erro ao registrar remessa:", error);
        flash(error.message || "Não foi possível registrar a remessa.");
        return;
      }

      const result = Array.isArray(data) ? data[0] : data;

      setShipmentOpen(false);
      setShipmentDrafts({});
      setShipmentMeta({
        carrier: "",
        tracking_code: "",
        invoice_number: "",
        notes: "",
      });

      await loadAll();

      if (result?.new_status === "shipped") {
        flash("Remessa registrada. Pedido totalmente enviado.");
      } else {
        flash("Remessa registrada com sucesso.");
      }
    } finally {
      setSaving(false);
    }
  }

  function openDocumentModal() {
    setDocumentType("invoice");
    setDocumentNotes("");
    setDocumentFile(null);
    setDocumentDragging(false);
    setDocumentOpen(true);
  }

  function validateDocumentFile(file: File) {
    const allowedTypes = new Set([
      "application/pdf",
      "application/xml",
      "text/xml",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);

    const xmlByName = file.name.toLowerCase().endsWith(".xml");

    if (!allowedTypes.has(file.type) && !xmlByName) {
      flash("Formato não permitido. Envie PDF, XML, JPG, PNG ou WEBP.");
      return false;
    }

    if (file.size > 25 * 1024 * 1024) {
      flash("O arquivo ultrapassa o limite de 25 MB.");
      return false;
    }

    return true;
  }

  function selectDocumentFile(file: File | null) {
    if (!file) return;
    if (!validateDocumentFile(file)) return;
    setDocumentFile(file);
  }

  async function uploadDocument() {
    if (
      !order ||
      !profile ||
      !canManageDocuments ||
      !documentFile ||
      documentUploading
    ) {
      return;
    }

    if (!validateDocumentFile(documentFile)) return;

    setDocumentUploading(true);

    const normalizedName =
      safeFileName(documentFile.name) ||
      `documento-${Date.now()}`;

    const storagePath =
      `${order.id}/${documentType}/${Date.now()}-${normalizedName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("order-files")
        .upload(storagePath, documentFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: documentFile.type || undefined,
        });

      if (uploadError) {
        console.error("Erro no upload:", uploadError);
        flash(uploadError.message || "Não foi possível enviar o arquivo.");
        return;
      }

      const { error: insertError } = await supabase
        .from("order_files")
        .insert({
          order_id: order.id,
          file_type: documentType,
          file_name: documentFile.name,
          file_url: null,
          storage_path: storagePath,
          mime_type: documentFile.type || null,
          file_size: documentFile.size,
          notes: documentNotes.trim() || null,
          uploaded_by: profile.id,
          uploaded_by_name: profile.name || null,
        });

      if (insertError) {
        await supabase.storage.from("order-files").remove([storagePath]);
        console.error("Erro ao registrar documento:", insertError);
        flash(insertError.message || "Não foi possível registrar o documento.");
        return;
      }

      await audit(
        "file_added",
        "document",
        null,
        documentFile.name,
        `${fileTypeLabel(documentType)} anexado ao pedido.`
      );

      setDocumentOpen(false);
      setDocumentFile(null);
      setDocumentNotes("");
      await loadAll();
      flash("Documento anexado com sucesso.");
    } finally {
      setDocumentUploading(false);
    }
  }

  async function openDocument(file: OrderFile, download = false) {
    if (!canViewDocuments || documentActionId) return;

    setDocumentActionId(file.id);

    try {
      if (file.storage_path) {
        const { data, error } = await supabase.storage
          .from("order-files")
          .createSignedUrl(
            file.storage_path,
            60,
            download ? { download: file.file_name } : undefined
          );

        if (error || !data?.signedUrl) {
          console.error("Erro ao gerar link assinado:", error);
          flash("Não foi possível abrir este documento.");
          return;
        }

        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
        return;
      }

      if (file.file_url) {
        window.open(file.file_url, "_blank", "noopener,noreferrer");
        return;
      }

      flash("Este documento não possui um arquivo associado.");
    } finally {
      setDocumentActionId(null);
    }
  }

  async function deleteDocument() {
    if (
      !documentDeleting ||
      !order ||
      !canManageDocuments ||
      documentActionId
    ) {
      return;
    }

    const file = documentDeleting;
    setDocumentActionId(file.id);

    try {
      const { error: deleteRowError } = await supabase
        .from("order_files")
        .delete()
        .eq("id", file.id)
        .eq("order_id", order.id);

      if (deleteRowError) {
        console.error("Erro ao excluir documento:", deleteRowError);
        flash(deleteRowError.message || "Não foi possível excluir o documento.");
        return;
      }

      if (file.storage_path) {
        const { error: storageError } = await supabase.storage
          .from("order-files")
          .remove([file.storage_path]);

        if (storageError) {
          console.error("Arquivo removido da tabela, mas falhou no Storage:", storageError);
        }
      }

      await audit(
        "file_removed",
        "document",
        file.file_name,
        null,
        `${fileTypeLabel(file.file_type)} removido do pedido.`
      );

      setDocumentDeleting(null);
      await loadAll();
      flash("Documento removido.");
    } finally {
      setDocumentActionId(null);
    }
  }

  if (loading) {
    return (
      <main className="shell">
        <AppSidebar />

        <div className="page loading-page">
          <div className="loading-topbar">
            <div className="skeleton skeleton-back" />
            <div className="loading-actions">
              <div className="skeleton skeleton-action" />
              <div className="skeleton skeleton-action primary-shape" />
            </div>
          </div>

          <section className="loading-hero">
            <div>
              <div className="skeleton skeleton-eyebrow" />
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-subtitle" />
            </div>
            <div className="skeleton skeleton-status" />
          </section>

          <section className="loading-progress">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index}>
                <div className="skeleton skeleton-circle" />
                <div className="skeleton skeleton-step" />
              </div>
            ))}
          </section>

          <section className="loading-metrics">
            {Array.from({ length: 4 }).map((_, index) => (
              <article key={index}>
                <div className="skeleton skeleton-metric-label" />
                <div className="skeleton skeleton-metric-value" />
                <div className="skeleton skeleton-metric-caption" />
              </article>
            ))}
          </section>

          <section className="loading-layout">
            <div className="loading-main-column">
              <section className="loading-card loading-card-large">
                <div className="loading-card-header">
                  <div>
                    <div className="skeleton skeleton-card-label" />
                    <div className="skeleton skeleton-card-title" />
                  </div>
                  <div className="skeleton skeleton-small-button" />
                </div>

                <div className="loading-product-row">
                  <div className="skeleton skeleton-product-image" />
                  <div className="loading-product-copy">
                    <div className="skeleton skeleton-product-title" />
                    <div className="skeleton skeleton-product-meta" />
                    <div className="skeleton skeleton-product-note" />
                  </div>
                  <div className="loading-values">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={index}>
                        <div className="skeleton skeleton-value-label" />
                        <div className="skeleton skeleton-value-number" />
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="loading-card loading-card-medium">
                <div className="loading-card-header">
                  <div>
                    <div className="skeleton skeleton-card-label" />
                    <div className="skeleton skeleton-card-title short" />
                  </div>
                </div>
              </section>

              <section className="loading-card loading-card-medium">
                <div className="loading-card-header">
                  <div>
                    <div className="skeleton skeleton-card-label" />
                    <div className="skeleton skeleton-card-title short" />
                  </div>
                </div>
              </section>
            </div>

            <aside className="loading-side-column">
              {Array.from({ length: 3 }).map((_, cardIndex) => (
                <section className="loading-card side" key={cardIndex}>
                  <div className="loading-card-header">
                    <div>
                      <div className="skeleton skeleton-card-label" />
                      <div className="skeleton skeleton-card-title side-title" />
                    </div>
                  </div>

                  <div className="loading-side-lines">
                    {Array.from({ length: 4 }).map((_, lineIndex) => (
                      <div key={lineIndex}>
                        <div className="skeleton skeleton-line-label" />
                        <div className="skeleton skeleton-line-value" />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </aside>
          </section>
        </div>

        <style jsx>{`
          .shell{min-height:100vh;display:grid;grid-template-columns:250px minmax(0,1fr);background:#f5f2ef;color:#2b211d}
          .page{min-width:0;padding:28px}
          .loading-page{overflow:hidden}
          .loading-topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}
          .loading-actions{display:flex;gap:8px}
          .loading-hero{min-height:160px;border-radius:22px;padding:28px;background:linear-gradient(135deg,#7b1f10,#9a301b);display:flex;align-items:flex-end;justify-content:space-between;gap:20px;box-shadow:0 18px 42px rgba(93,37,20,.11)}
          .loading-progress{margin-top:14px;border:1px solid #e4dbd5;border-radius:15px;background:#fff;padding:14px;display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
          .loading-progress>div{display:flex;align-items:center;gap:8px}
          .loading-metrics{margin-top:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
          .loading-metrics article{border:1px solid #e4dbd5;border-radius:14px;background:#fff;padding:14px}
          .loading-layout{margin-top:14px;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(310px,.72fr);gap:14px;align-items:start}
          .loading-main-column,.loading-side-column{display:flex;flex-direction:column;gap:14px}
          .loading-card{border:1px solid #e3dad4;border-radius:17px;background:#fff;overflow:hidden;box-shadow:0 8px 24px rgba(69,45,34,.035)}
          .loading-card-large{min-height:174px}
          .loading-card-medium{min-height:118px}
          .loading-card.side{min-height:235px}
          .loading-card-header{min-height:65px;padding:14px 16px;border-bottom:1px solid #eee7e2;display:flex;align-items:center;justify-content:space-between;gap:14px}
          .loading-product-row{padding:15px 16px;display:grid;grid-template-columns:64px minmax(0,1fr) minmax(440px,1.08fr);gap:13px;align-items:center}
          .loading-product-copy{display:flex;flex-direction:column;gap:7px}
          .loading-values{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}
          .loading-values>div{display:flex;flex-direction:column;gap:5px}
          .loading-side-lines{display:flex;flex-direction:column}
          .loading-side-lines>div{padding:10px 14px;border-top:1px solid #f1ebe7;display:flex;flex-direction:column;gap:5px}
          .loading-side-lines>div:first-child{border-top:0}
          .skeleton{position:relative;overflow:hidden;background:#eee8e4;border-radius:7px}
          .skeleton::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.72),transparent);animation:shimmer 1.35s infinite}
          .loading-hero .skeleton{background:rgba(255,255,255,.16)}
          .loading-hero .skeleton::after{background:linear-gradient(90deg,transparent,rgba(255,255,255,.20),transparent)}
          .skeleton-back{width:72px;height:28px}
          .skeleton-action{width:116px;height:40px;border-radius:10px}
          .skeleton-action.primary-shape{width:128px;background:#e7d9d1}
          .skeleton-eyebrow{width:110px;height:10px;margin-bottom:12px}
          .skeleton-title{width:min(520px,60vw);height:48px;border-radius:10px}
          .skeleton-subtitle{width:min(430px,52vw);height:11px;margin-top:12px}
          .skeleton-status{width:88px;height:30px;border-radius:999px}
          .skeleton-circle{width:23px;height:23px;border-radius:50%}
          .skeleton-step{width:68px;height:10px}
          .skeleton-metric-label{width:74px;height:8px}
          .skeleton-metric-value{width:92px;height:25px;margin-top:8px}
          .skeleton-metric-caption{width:112px;height:8px;margin-top:7px}
          .skeleton-card-label{width:66px;height:7px}
          .skeleton-card-title{width:120px;height:18px;margin-top:7px}
          .skeleton-card-title.short{width:100px}
          .skeleton-card-title.side-title{width:130px}
          .skeleton-small-button{width:104px;height:34px;border-radius:9px}
          .skeleton-product-image{width:64px;height:64px;border-radius:11px}
          .skeleton-product-title{width:68%;height:12px}
          .skeleton-product-meta{width:54%;height:8px}
          .skeleton-product-note{width:45%;height:8px}
          .skeleton-value-label{width:42px;height:7px}
          .skeleton-value-number{width:50px;height:11px}
          .skeleton-line-label{width:58px;height:7px}
          .skeleton-line-value{width:72%;height:10px}
          @keyframes shimmer{100%{transform:translateX(100%)}}
          @media(max-width:1180px){.loading-layout{grid-template-columns:1fr}.loading-side-column{display:grid;grid-template-columns:repeat(2,1fr)}}
          @media(max-width:980px){.shell{grid-template-columns:1fr}}
          @media(max-width:760px){
            .page{padding:18px 14px 40px}
            .loading-topbar,.loading-actions,.loading-hero{align-items:stretch;flex-direction:column}
            .loading-metrics{grid-template-columns:repeat(2,1fr)}
            .loading-progress{overflow:hidden;grid-template-columns:repeat(5,130px)}
            .loading-product-row{grid-template-columns:55px 1fr}
            .loading-values{grid-column:1/-1}
            .loading-side-column{display:flex}
            .skeleton-title{width:92%}
            .skeleton-subtitle{width:78%}
          }
          @media(prefers-reduced-motion:reduce){.skeleton::after{animation:none}}
        `}</style>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="shell">
        <AppSidebar />

        <div className="error-state">
          <div className="error-icon">
            <FileText size={24} />
          </div>
          <span>PEDIDO</span>
          <h1>Pedido não encontrado</h1>
          <p>Não foi possível localizar este pedido ou você não possui acesso a ele.</p>
          <button type="button" onClick={() => router.push("/pedidos")}>
            <ArrowLeft size={14} /> Voltar aos pedidos
          </button>
        </div>

        <style jsx>{`
          .shell{min-height:100vh;display:grid;grid-template-columns:250px minmax(0,1fr);background:#f5f2ef;color:#2b211d}
          .error-state{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center}
          .error-icon{width:52px;height:52px;border-radius:15px;background:#fff0e3;color:#8a2a18;display:grid;place-items:center;margin-bottom:15px}
          .error-state>span{color:#ef7a00;font-size:8px;font-weight:900;letter-spacing:1.4px}
          .error-state h1{margin:7px 0 0;color:#382a24;font-size:28px;letter-spacing:-.8px}
          .error-state p{max-width:420px;margin:10px 0 0;color:#81736c;font-size:10px;line-height:1.55}
          .error-state button{margin-top:17px;min-height:40px;border:1px solid #8a2a18;border-radius:10px;background:#8a2a18;color:#fff;padding:0 13px;display:inline-flex;align-items:center;gap:7px;font-size:9px;font-weight:900;cursor:pointer}
          @media(max-width:980px){.shell{grid-template-columns:1fr}}
        `}</style>
      </main>
    );
  }

  const progressIndex =
    order.status === "completed" ? 4 :
    ["partially_shipped", "shipped"].includes(order.status) ? 3 :
    order.status === "confirmed" ? 2 :
    ["under_review", "approved"].includes(order.status) ? 1 : 0;

  const customerFields = [
    ["customer_name", "Contato"],
    ["customer_company", "Empresa"],
    ["customer_document", "CPF/CNPJ"],
    ["customer_email", "E-mail"],
    ["customer_phone", "Telefone"],
    ["customer_address", "Endereço"],
    ["customer_city", "Cidade"],
    ["customer_state", "UF"],
    ["customer_zip_code", "CEP"],
  ];

  return (
    <main className="shell">
      <AppSidebar />

      <div className="page">
        <div className="top-actions">
          <button className="back" onClick={() => router.push("/pedidos")}>
            <ArrowLeft size={15} /> Pedidos
          </button>

          <div>
            <button className="secondary" onClick={() => window.print()}>
              <FileDown size={15} /> Gerar PDF / Imprimir
            </button>

            {canConfirm &&
              order.order_source === "customer_catalog" &&
              order.status === "under_review" && (
                <button
                  className="primary"
                  onClick={approveOrder}
                  disabled={saving}
                >
                  <CheckCircle2 size={15} />
                  {saving ? "Aprovando..." : "Aprovar pedido"}
                </button>
              )}

            {canConfirm &&
              !["confirmed","partially_shipped","shipped","completed","cancelled"].includes(order.status) &&
              (order.order_source !== "customer_catalog" || order.status === "approved") && (
                <button className="primary" onClick={() => setConfirmOpen(true)}>
                  <CheckCircle2 size={15} /> Confirmar pedido
                </button>
              )}

            {canShip && ["confirmed","partially_shipped"].includes(order.status) && (
              <button className="primary" onClick={openShipment}>
                <Truck size={15} /> Registrar envio
              </button>
            )}

            {canConfirm && order.status === "shipped" && totals.remainingUnits === 0 && (
              <button className="primary" onClick={() => setCompleteOpen(true)}>
                <CheckCircle2 size={15} /> Concluir pedido
              </button>
            )}
          </div>
        </div>

        {feedback && <div className="feedback">{feedback}</div>}

        {order.order_source === "customer_catalog" && (
          <section className={`source-banner ${order.status === "sent" ? "needs-review" : ""}`}>
            <div className="source-banner-icon">
              <Send size={17} />
            </div>
            <div className="source-banner-copy">
              <span>PEDIDO VIA LINK</span>
              <strong>
                {order.status === "sent"
                  ? "Aguardando revisão comercial"
                  : order.status === "under_review"
                    ? "Revisão comercial em andamento"
                    : order.status === "approved"
                      ? "Aprovado e pronto para confirmação"
                      : "Recebido pelo catálogo enviado ao cliente"}
              </strong>
              <p>
                {order.status === "sent"
                  ? "O cliente montou e enviou esta seleção pelo link do catálogo. Revise os dados, itens, quantidades e valores antes de confirmar o pedido."
                  : order.status === "under_review"
                    ? "Confira cliente, itens, quantidades, preços e condição comercial. Quando estiver tudo certo, aprove o pedido."
                    : order.status === "approved"
                      ? "A revisão comercial foi concluída. O pedido já pode ser confirmado para seguir no fluxo."
                      : "Este pedido foi originado diretamente pela seleção enviada pelo cliente no catálogo digital."}
              </p>
            </div>

            {canConfirm && order.status === "sent" && (
              <button
                type="button"
                className="review-button"
                onClick={startReview}
                disabled={saving}
              >
                <CheckCircle2 size={15} />
                {saving ? "Iniciando..." : "Iniciar análise"}
              </button>
            )}

            {canConfirm && order.status === "under_review" && (
              <button
                type="button"
                className="review-button"
                onClick={approveOrder}
                disabled={saving}
              >
                <CheckCircle2 size={15} />
                {saving ? "Aprovando..." : "Aprovar pedido"}
              </button>
            )}
          </section>
        )}

        <section className="hero-card">
          <div>
            <span className="eyebrow">PEDIDO #{String(order.order_number).padStart(5, "0")}</span>
            <h1>{order.customer_company || order.customer_name}</h1>
            <p>
              {order.customer_company && order.customer_name ? `A/C ${order.customer_name} • ` : ""}
              Criado em {dateTime(order.created_at)}
              {order.seller_name ? ` • Vendedor: ${order.seller_name}` : ""}
            </p>
          </div>
          <span className={`status status-${order.status}`}>{STATUS_LABELS[order.status]}</span>
        </section>

        <section className="progress">
          {["Recebido", "Revisão", "Confirmado", "Envio", "Concluído"].map((label, index) => (
            <div className={`${index < progressIndex ? "done" : ""} ${index === progressIndex ? "active" : ""}`} key={label}>
              <span>{index < progressIndex || order.status === "completed" ? "✓" : index + 1}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </section>

        <section className="metrics">
          <article><span>TOTAL</span><strong>{money(order.total_value)}</strong><small>Valor final</small></article>
          <article><span>UNIDADES</span><strong>{totals.totalUnits}</strong><small>Quantidade pedida</small></article>
          <article><span>ENVIADAS</span><strong>{totals.shippedUnits}</strong><small>Em todas as remessas</small></article>
          <article><span>SALDO</span><strong className={totals.remainingUnits > 0 ? "warn" : "ok"}>{totals.remainingUnits}</strong><small>Ainda não enviado</small></article>
        </section>

        <section className="layout">
          <div className="main-column">
            <section className="card">
              <header className="card-header">
                <div><span>PRODUTOS</span><h2>Itens do pedido</h2></div>
                {canEditOrder && (
                  <button className="edit" onClick={() => setEditItems((v) => !v)}>
                    {editItems ? <X size={14}/> : <Pencil size={14}/>}
                    {editItems ? "Cancelar" : "Editar itens"}
                  </button>
                )}
              </header>

              {items.map((item) => {
                const remaining = Math.max(Number(item.quantity) - Number(item.shipped_quantity), 0);
                const draft = itemDrafts[item.id];

                return (
                  <article className="item" key={item.id}>
                    <div className="photo">
                      {resolveOrderItemImage(item) ? (
                        <img
                          src={resolveOrderItemImage(item) || ""}
                          alt={`${item.product_name}${item.variant_name ? ` — ${item.variant_name}` : ""}`}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <PackageCheck size={22}/>
                      )}
                    </div>

                    <div className="item-copy">
                      <strong>{item.product_name}{item.variant_name ? ` — ${item.variant_name}` : ""}</strong>
                      <small>
                        {item.sku || "SKU não informado"}
                        {item.internal_code ? ` • Cód. ${item.internal_code}` : ""}
                        {item.barcode ? ` • EAN ${item.barcode}` : ""}
                      </small>

                      {editItems && draft ? (
                        <div className="item-edit">
                          <label><span>Qtd.</span><input type="number" min={1} value={draft.quantity}
                            onChange={(e) => setItemDrafts(c => ({...c,[item.id]:{...c[item.id],quantity:Number(e.target.value)}}))}/></label>
                          <label><span>Preço</span><input type="number" min={0} step="0.01" disabled={!canEditPrice} value={draft.unit_price}
                            onChange={(e) => setItemDrafts(c => ({...c,[item.id]:{...c[item.id],unit_price:Number(e.target.value)}}))}/></label>
                          <label>
                            <span>Desconto (%)</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              disabled={!canEditPrice}
                              value={draft.discount_percent}
                              onChange={(e) =>
                                setItemDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...current[item.id],
                                    discount_percent: Math.min(
                                      Math.max(Number(e.target.value || 0), 0),
                                      100
                                    ),
                                  },
                                }))
                              }
                            />
                            {canEditPrice && Number(draft.discount_percent || 0) > 0 && (
                              <small className="discount-preview">
                                - {money(
                                  Math.round(
                                    Number(draft.quantity || 0) *
                                      Number(draft.unit_price || 0) *
                                      (Number(draft.discount_percent || 0) / 100) *
                                      100
                                  ) / 100
                                )}
                              </small>
                            )}
                          </label>
                          <label className="wide"><span>Observação</span><input value={draft.notes}
                            onChange={(e) => setItemDrafts(c => ({...c,[item.id]:{...c[item.id],notes:e.target.value}}))}/></label>
                        </div>
                      ) : item.notes ? <p>{item.notes}</p> : null}
                    </div>

                    <div className="item-values">
                      <div><span>PEDIDA</span><strong>{item.quantity}</strong></div>
                      <div><span>ENVIADA</span><strong>{item.shipped_quantity}</strong></div>
                      <div><span>SALDO</span><strong className={remaining > 0 ? "warn" : "ok"}>{remaining}</strong></div>
                      <div>
                        <span>UNITÁRIO</span>
                        <strong>{money(item.unit_price)}</strong>
                      </div>
                      <div>
                        <span>DESCONTO</span>
                        <strong>
                          {Number(item.discount_percent || 0) > 0
                            ? `${Number(item.discount_percent || 0)}%`
                            : "—"}
                        </strong>
                        {Number(item.discount_value || 0) > 0 && (
                          <small className="discount-value">
                            - {money(item.discount_value)}
                          </small>
                        )}
                      </div>
                      <div><span>TOTAL</span><strong>{money(item.line_total)}</strong></div>
                    </div>
                  </article>
                );
              })}

              {editItems && (
                <div className="save-row">
                  <button className="primary" onClick={saveItems} disabled={saving}>
                    <Save size={14}/> {saving ? "Salvando..." : "Salvar itens"}
                  </button>
                </div>
              )}
            </section>

            <section className="card">
              <header className="card-header">
                <div><span>REMESSAS</span><h2>Envios do pedido</h2></div>
                {canShip && ["confirmed","partially_shipped"].includes(order.status) && (
                  <button className="edit" onClick={openShipment}><Truck size={14}/> Registrar envio</button>
                )}
              </header>

              {shipments.length === 0 ? (
                <div className="empty">Nenhuma remessa registrada ainda.</div>
              ) : shipments.map((shipment) => (
                <article className="shipment" key={shipment.id}>
                  <div><strong>Remessa #{shipment.shipment_number}</strong><small>{dateTime(shipment.shipped_at || shipment.created_at)}</small></div>
                  <div><strong>{shipment.total_units} un.</strong><small>{shipment.carrier || "Sem transportadora"}</small></div>
                  <div><strong>{shipment.tracking_code || "Sem rastreio"}</strong><small>{shipment.invoice_number ? `NF ${shipment.invoice_number}` : "Sem NF"}</small></div>
                  <span>{shipment.status}</span>
                </article>
              ))}
            </section>

            <section className="card">
              <header className="card-header">
                <div>
                  <span>DOCUMENTOS</span>
                  <h2>Arquivos do pedido</h2>
                </div>

                {canManageDocuments && (
                  <button className="edit" onClick={openDocumentModal}>
                    <UploadCloud size={14}/> Adicionar arquivo
                  </button>
                )}
              </header>

              {files.length === 0 ? (
                <div className="documents-empty">
                  <div className="documents-empty-icon">
                    <Paperclip size={19}/>
                  </div>
                  <strong>Nenhum documento anexado</strong>
                  <p>
                    Nota fiscal, boleto, XML, pedido comercial e comprovantes
                    ficarão centralizados aqui.
                  </p>
                  {canManageDocuments && (
                    <button type="button" onClick={openDocumentModal}>
                      <UploadCloud size={14}/> Adicionar primeiro arquivo
                    </button>
                  )}
                </div>
              ) : (
                <div className="document-list">
                  {files.map((file) => (
                    <article className="document-row" key={file.id}>
                      <div className="document-icon">
                        <FileText size={17}/>
                      </div>

                      <div className="document-copy">
                        <strong>{file.file_name}</strong>
                        <small>
                          {fileTypeLabel(file.file_type)}
                          {file.file_size ? ` • ${fileSizeLabel(file.file_size)}` : ""}
                          {` • ${dateTime(file.created_at)}`}
                        </small>
                        {file.uploaded_by_name && (
                          <small>Adicionado por {file.uploaded_by_name}</small>
                        )}
                        {file.notes && <p>{file.notes}</p>}
                      </div>

                      <div className="document-actions">
                        <button
                          type="button"
                          title="Visualizar"
                          disabled={documentActionId === file.id}
                          onClick={() => openDocument(file, false)}
                        >
                          <Eye size={14}/>
                          Visualizar
                        </button>

                        <button
                          type="button"
                          title="Baixar"
                          disabled={documentActionId === file.id}
                          onClick={() => openDocument(file, true)}
                        >
                          <Download size={14}/>
                          Baixar
                        </button>

                        {canManageDocuments && (
                          <button
                            type="button"
                            className="danger"
                            title="Excluir"
                            disabled={documentActionId === file.id}
                            onClick={() => setDocumentDeleting(file)}
                          >
                            <Trash2 size={14}/>
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="card">
              <header className="card-header"><div><span>HISTÓRICO</span><h2>Linha do tempo</h2></div></header>
              {history.length === 0 ? (
                <div className="empty">Ainda não há eventos registrados.</div>
              ) : (
                <div className="timeline">
                  {history.map((event) => (
                    <article key={`${event.event_type}-${event.id}`}>
                      <i />
                      <div>
                        <strong>{eventLabel(event.action)}</strong>
                        {(event.old_value || event.new_value) && <p>{event.old_value || "—"} → {event.new_value || "—"}</p>}
                        {event.notes && <p>{event.notes}</p>}
                        <small>{dateTime(event.created_at)}{event.changed_by_name ? ` • ${event.changed_by_name}` : ""}</small>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="side-column">
            <section className="card">
              <header className="card-header compact">
                <div><span>CLIENTE</span><h2>Dados comerciais</h2></div>
                {canEditOrder && <button className="icon" onClick={() => setEditCustomer((v) => !v)}>{editCustomer ? <X size={14}/> : <Pencil size={14}/>}</button>}
              </header>

              {editCustomer ? (
                <div className="form">
                  {customerFields.map(([key,label]) => (
                    <label key={key}><span>{label}</span><input value={customerDraft[key] || ""}
                      onChange={(e) => setCustomerDraft(c => ({...c,[key]:e.target.value}))}/></label>
                  ))}
                  <button className="primary" onClick={saveCustomer} disabled={saving}><Save size={14}/> Salvar cliente</button>
                </div>
              ) : (
                <div className="read">
                  <div><span>Empresa</span><strong>{order.customer_company || "Não informada"}</strong></div>
                  <div><span>Contato</span><strong>{order.customer_name}</strong></div>
                  <div><span>CPF/CNPJ</span><strong>{order.customer_document || "Não informado"}</strong></div>
                  <div><span>E-mail</span><strong>{order.customer_email || "Não informado"}</strong></div>
                  <div><span>Telefone</span><strong>{order.customer_phone || "Não informado"}</strong></div>
                  <div><span>Endereço</span><strong>{[order.customer_address,order.customer_city,order.customer_state,order.customer_zip_code].filter(Boolean).join(" • ") || "Não informado"}</strong></div>
                </div>
              )}
            </section>

            <section className="card">
              <header className="card-header compact">
                <div><span>CONDIÇÃO COMERCIAL</span><h2>Pagamento</h2></div>
                {canEditPrice && <button className="icon" onClick={() => setEditCommercial((v) => !v)}>{editCommercial ? <X size={14}/> : <Pencil size={14}/>}</button>}
              </header>

              {editCommercial ? (
                <div className="form">
                  <label><span>Pagamento</span><select value={commercialDraft.payment_method}
                    onChange={(e) => setCommercialDraft(c => ({...c,payment_method:e.target.value}))}>
                    <option value="">Selecione</option>
                    <option value="boleto">Boleto</option><option value="pix">Pix</option>
                    <option value="cartao_credito">Cartão de crédito</option>
                    <option value="cartao_debito">Cartão de débito</option>
                    <option value="transferencia">Transferência</option>
                    <option value="dinheiro">Dinheiro</option><option value="outro">Outro</option>
                  </select></label>
                  <label><span>Parcelas</span><input type="number" min={1} value={commercialDraft.payment_installments}
                    onChange={(e) => setCommercialDraft(c => ({...c,payment_installments:Number(e.target.value)}))}/></label>
                  <label><span>Desconto geral</span><input type="number" min={0} step="0.01" value={commercialDraft.discount_value}
                    onChange={(e) => setCommercialDraft(c => ({...c,discount_value:Number(e.target.value)}))}/></label>
                  <label><span>Frete</span><input type="number" min={0} step="0.01" value={commercialDraft.shipping_value}
                    onChange={(e) => setCommercialDraft(c => ({...c,shipping_value:Number(e.target.value)}))}/></label>
                  <label><span>Condição / prazo</span><textarea value={commercialDraft.payment_notes}
                    onChange={(e) => setCommercialDraft(c => ({...c,payment_notes:e.target.value}))}/></label>
                  <label><span>Observação cliente</span><textarea value={commercialDraft.customer_notes}
                    onChange={(e) => setCommercialDraft(c => ({...c,customer_notes:e.target.value}))}/></label>
                  <label><span>Observação interna</span><textarea value={commercialDraft.internal_notes}
                    onChange={(e) => setCommercialDraft(c => ({...c,internal_notes:e.target.value}))}/></label>
                  <button className="primary" onClick={saveCommercial} disabled={saving}><Save size={14}/> Salvar condição</button>
                </div>
              ) : (
                <div className="read">
                  <div><span>Pagamento</span><strong>{paymentLabel(order.payment_method,order.payment_installments)}</strong></div>
                  <div><span>Condição</span><strong>{order.payment_notes || "Não informada"}</strong></div>
                  <div><span>Desconto</span><strong>{money(order.discount_value)}</strong></div>
                  <div><span>Frete</span><strong>{money(order.shipping_value)}</strong></div>
                </div>
              )}
            </section>

            <section className="card summary">
              <span>RESUMO DO PEDIDO</span>
              <div><small>Produtos</small><strong>{money(order.subtotal)}</strong></div>
              <div><small>Desconto</small><strong>- {money(order.discount_value)}</strong></div>
              <div><small>Frete</small><strong>+ {money(order.shipping_value)}</strong></div>
              <div className="grand"><small>TOTAL</small><strong>{money(order.total_value)}</strong></div>
            </section>

            {(order.customer_notes || order.internal_notes) && (
              <section className="card notes">
                <span>OBSERVAÇÕES</span>
                {order.customer_notes && <div><strong>Cliente</strong><p>{order.customer_notes}</p></div>}
                {order.internal_notes && <div><strong>Interna</strong><p>{order.internal_notes}</p></div>}
              </section>
            )}
          </aside>
        </section>
      </div>

      {documentOpen && (
        <div className="backdrop">
          <div className="modal document-modal">
            <div className="modal-icon"><UploadCloud size={23}/></div>
            <span>NOVO DOCUMENTO</span>
            <h2>Adicionar arquivo</h2>
            <p>
              O arquivo ficará disponível neste pedido para a equipe autorizada.
            </p>

            <div className="document-form">
              <label>
                <span>Tipo do documento</span>
                <select
                  value={documentType}
                  disabled={documentUploading}
                  onChange={(event) => setDocumentType(event.target.value)}
                >
                  {FILE_TYPE_OPTIONS.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div
                className={`drop-zone${documentDragging ? " dragging" : ""}${documentFile ? " has-file" : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (!documentUploading) setDocumentDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDocumentDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDocumentDragging(false);
                  if (!documentUploading) {
                    selectDocumentFile(event.dataTransfer.files?.[0] || null);
                  }
                }}
              >
                <input
                  id="order-document-file"
                  type="file"
                  disabled={documentUploading}
                  accept=".pdf,.xml,.jpg,.jpeg,.png,.webp,application/pdf,application/xml,text/xml,image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    selectDocumentFile(event.target.files?.[0] || null)
                  }
                />

                {documentFile ? (
                  <>
                    <div className="drop-icon selected">
                      <FileText size={21}/>
                    </div>
                    <strong>{documentFile.name}</strong>
                    <small>
                      {fileSizeLabel(documentFile.size)} • arquivo selecionado
                    </small>
                    <label className="choose-file" htmlFor="order-document-file">
                      Trocar arquivo
                    </label>
                  </>
                ) : (
                  <>
                    <div className="drop-icon"><UploadCloud size={21}/></div>
                    <strong>Arraste o arquivo para cá</strong>
                    <small>PDF, XML, JPG, PNG ou WEBP • máximo 25 MB</small>
                    <label className="choose-file" htmlFor="order-document-file">
                      Escolher arquivo
                    </label>
                  </>
                )}
              </div>

              <label>
                <span>Observação <em>opcional</em></span>
                <textarea
                  value={documentNotes}
                  disabled={documentUploading}
                  placeholder="Ex.: boleto referente à primeira parcela..."
                  onChange={(event) => setDocumentNotes(event.target.value)}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button
                className="secondary"
                disabled={documentUploading}
                onClick={() => setDocumentOpen(false)}
              >
                Voltar
              </button>

              <button
                className="primary"
                disabled={!documentFile || documentUploading}
                onClick={uploadDocument}
              >
                <UploadCloud size={14}/>
                {documentUploading ? "Enviando arquivo..." : "Anexar documento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {documentDeleting && (
        <div className="backdrop">
          <div className="modal delete-document-modal">
            <div className="modal-icon danger-icon"><Trash2 size={23}/></div>
            <span>EXCLUIR DOCUMENTO</span>
            <h2>Remover este arquivo?</h2>
            <p>
              <strong>{documentDeleting.file_name}</strong> será removido do
              pedido e não ficará mais disponível para download.
            </p>

            <div className="delete-document-summary">
              <span>{fileTypeLabel(documentDeleting.file_type)}</span>
              <strong>{documentDeleting.file_name}</strong>
            </div>

            <div className="modal-actions">
              <button
                className="secondary"
                disabled={documentActionId === documentDeleting.id}
                onClick={() => setDocumentDeleting(null)}
              >
                Cancelar
              </button>

              <button
                className="danger-button"
                disabled={documentActionId === documentDeleting.id}
                onClick={deleteDocument}
              >
                <Trash2 size={14}/>
                {documentActionId === documentDeleting.id
                  ? "Excluindo..."
                  : "Excluir documento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {completeOpen && (
        <div className="backdrop">
          <div className="modal">
            <div className="modal-icon"><CheckCircle2 size={21} /></div>
            <span>CONCLUSÃO DO PEDIDO</span>
            <h2>Concluir pedido #{String(order.order_number).padStart(5, "0")}?</h2>
            <p>
              Todas as {totals.totalUnits} unidades foram enviadas. Ao concluir,
              o pedido será encerrado comercialmente e permanecerá disponível
              para consulta, documentos e histórico.
            </p>

            <div className="modal-summary">
              <div><span>UNIDADES</span><strong>{totals.totalUnits}</strong></div>
              <div><span>ENVIADAS</span><strong>{totals.shippedUnits}</strong></div>
              <div><span>SALDO</span><strong>{totals.remainingUnits}</strong></div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setCompleteOpen(false)}
                disabled={saving}
              >
                Voltar
              </button>
              <button
                type="button"
                className="primary"
                onClick={completeOrder}
                disabled={saving}
              >
                <CheckCircle2 size={15} />
                {saving ? "Concluindo..." : "Concluir pedido"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="backdrop">
          <div className="modal">
            <div className="modal-icon"><CheckCircle2 size={23}/></div>
            <span>CONFIRMAÇÃO</span>
            <h2>Confirmar pedido #{String(order.order_number).padStart(5,"0")}?</h2>
            <p>Após a confirmação, o pedido será liberado para faturamento e preparação.</p>
            <div className="modal-summary">
              <div><span>Unidades</span><strong>{totals.totalUnits}</strong></div>
              <div><span>Total</span><strong>{money(order.total_value)}</strong></div>
              <div><span>Pagamento</span><strong>{paymentLabel(order.payment_method,order.payment_installments)}</strong></div>
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setConfirmOpen(false)}>Voltar</button>
              <button className="primary" onClick={confirmOrder} disabled={saving}>{saving ? "Confirmando..." : "Confirmar pedido"}</button>
            </div>
          </div>
        </div>
      )}

      {shipmentOpen && (
        <div className="backdrop">
          <div className="modal shipment-modal">
            <div className="modal-icon"><Truck size={23}/></div>
            <span>NOVA REMESSA</span>
            <h2>Registrar envio</h2>
            <p>
              Informe somente as unidades que estão saindo agora. O saldo será
              atualizado automaticamente.
            </p>

            <div className="shipment-items refined">
              {items
                .filter(
                  (item) =>
                    Number(item.quantity) - Number(item.shipped_quantity) > 0
                )
                .map((item) => {
                  const ordered = Number(item.quantity || 0);
                  const shipped = Number(item.shipped_quantity || 0);
                  const remaining = Math.max(ordered - shipped, 0);
                  const selectedQuantity = Number(shipmentDrafts[item.id] || 0);

                  return (
                    <article className="shipment-item-card" key={item.id}>
                      <div className="shipment-item-top">
                        <div>
                          <strong>
                            {item.product_name}
                            {item.variant_name ? ` — ${item.variant_name}` : ""}
                          </strong>
                          <small>
                            {item.sku || "SKU não informado"}
                            {item.internal_code ? ` • Cód. ${item.internal_code}` : ""}
                          </small>
                        </div>

                        <button
                          type="button"
                          className="use-balance"
                          disabled={saving}
                          onClick={() =>
                            setShipmentDrafts((current) => ({
                              ...current,
                              [item.id]: remaining,
                            }))
                          }
                        >
                          Usar saldo completo
                        </button>
                      </div>

                      <div className="shipment-balance">
                        <div>
                          <span>PEDIDO</span>
                          <strong>{ordered}</strong>
                        </div>
                        <div>
                          <span>JÁ ENVIADO</span>
                          <strong>{shipped}</strong>
                        </div>
                        <div>
                          <span>SALDO</span>
                          <strong className="warn">{remaining}</strong>
                        </div>
                        <label>
                          <span>QUANTIDADE NESTA REMESSA</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={remaining}
                            step={1}
                            disabled={saving}
                            value={selectedQuantity || ""}
                            placeholder="0"
                            onChange={(event) => {
                              const raw = event.target.value;

                              if (raw === "") {
                                setShipmentDrafts((current) => ({
                                  ...current,
                                  [item.id]: 0,
                                }));
                                return;
                              }

                              const parsed = Math.floor(Number(raw));

                              setShipmentDrafts((current) => ({
                                ...current,
                                [item.id]: Number.isFinite(parsed)
                                  ? Math.min(Math.max(parsed, 0), remaining)
                                  : 0,
                              }));
                            }}
                          />
                        </label>
                      </div>
                    </article>
                  );
                })}
            </div>

            <div className="shipment-meta">
              <label>
                <span>Transportadora <em>opcional</em></span>
                <input
                  disabled={saving}
                  value={shipmentMeta.carrier}
                  onChange={(e) =>
                    setShipmentMeta((current) => ({
                      ...current,
                      carrier: e.target.value,
                    }))
                  }
                />
              </label>

              <label>
                <span>Rastreio <em>opcional</em></span>
                <input
                  disabled={saving}
                  value={shipmentMeta.tracking_code}
                  onChange={(e) =>
                    setShipmentMeta((current) => ({
                      ...current,
                      tracking_code: e.target.value,
                    }))
                  }
                />
              </label>

              <label>
                <span>Nº NF <em>opcional</em></span>
                <input
                  disabled={saving}
                  value={shipmentMeta.invoice_number}
                  onChange={(e) =>
                    setShipmentMeta((current) => ({
                      ...current,
                      invoice_number: e.target.value,
                    }))
                  }
                />
              </label>

              <label>
                <span>Observação <em>opcional</em></span>
                <input
                  disabled={saving}
                  value={shipmentMeta.notes}
                  onChange={(e) =>
                    setShipmentMeta((current) => ({
                      ...current,
                      notes: e.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="shipment-total">
              <div>
                <span>TOTAL DESTA REMESSA</span>
                <strong>
                  {Object.values(shipmentDrafts).reduce(
                    (sum, value) => sum + Number(value || 0),
                    0
                  )}{" "}
                  unidade(s)
                </strong>
              </div>

              <small>
                O sistema impede envio acima do saldo disponível.
              </small>
            </div>

            <div className="modal-actions">
              <button
                className="secondary"
                disabled={saving}
                onClick={() => setShipmentOpen(false)}
              >
                Voltar
              </button>

              <button
                className="primary"
                onClick={registerShipment}
                disabled={
                  saving ||
                  Object.values(shipmentDrafts).reduce(
                    (sum, value) => sum + Number(value || 0),
                    0
                  ) <= 0
                }
              >
                <Send size={14}/>
                {saving ? "Registrando remessa..." : "Confirmar remessa"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .shell{min-height:100vh;display:grid;grid-template-columns:250px minmax(0,1fr);background:#f5f2ef;color:#2b211d}
        .page{min-width:0;padding:28px}.state-page{min-height:100vh;display:grid;place-items:center;background:#f5f2ef;color:#6e615a}
        .state-page>div{display:grid;gap:14px;text-align:center}.state-page button{border:0;border-radius:10px;background:#8a2a18;color:#fff;padding:11px 14px;font-weight:800}
        .top-actions{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px}.top-actions>div{display:flex;gap:8px}
        .back,.secondary,.primary,.edit,.icon{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:900;cursor:pointer}
        .back{border:0;background:transparent;color:#8a2a18;padding:8px 0;font-size:10px}.secondary,.primary{min-height:40px;border-radius:10px;padding:0 12px;font-size:9px}
        .secondary{border:1px solid #ded3cc;background:#fff;color:#685b54}.primary{border:1px solid #8a2a18;background:#8a2a18;color:#fff}.primary:disabled{opacity:.55}
        .feedback{margin-bottom:12px;border:1px solid #e6d2c5;border-radius:10px;background:#fff7ef;color:#8a2a18;padding:10px 12px;font-size:10px;font-weight:800}
        .source-banner{margin-bottom:14px;border:1px solid #ead7ca;border-radius:16px;background:#fffaf6;padding:15px 16px;display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:13px;align-items:center;box-shadow:0 8px 24px rgba(93,37,20,.035)}
        .source-banner.needs-review{border-color:#efbd91;background:linear-gradient(135deg,#fff9f2,#fff4e7)}
        .source-banner-icon{width:40px;height:40px;border-radius:12px;background:#fff0e2;color:#b54722;display:grid;place-items:center;border:1px solid #f3d8c1}
        .source-banner-copy{min-width:0}.source-banner-copy>span{display:block;color:#ef7a00;font-size:8px;font-weight:950;letter-spacing:1.35px;margin-bottom:4px}
        .source-banner-copy strong{display:block;color:#4b2b20;font-size:13px;letter-spacing:-.2px}.source-banner-copy p{margin:4px 0 0;color:#8a7469;font-size:9px;line-height:1.5;max-width:760px}
        .review-button{min-height:38px;border:1px solid #d96418;border-radius:10px;background:#ef7a00;color:#fff;padding:0 13px;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-size:9px;font-weight:900;cursor:pointer;box-shadow:0 7px 18px rgba(239,122,0,.15);transition:transform .18s ease,box-shadow .18s ease,opacity .18s ease}
        .review-button:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 10px 22px rgba(239,122,0,.2)}.review-button:disabled{opacity:.58;cursor:not-allowed}
        .hero-card{min-height:160px;border-radius:22px;padding:28px;background:linear-gradient(135deg,#7b1f10,#9a301b);color:#fff;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;box-shadow:0 18px 42px rgba(93,37,20,.11)}
        .eyebrow{display:block;margin-bottom:8px;color:#ffc07b;font-size:9px;font-weight:900;letter-spacing:1.5px}h1{margin:0;font-size:clamp(31px,4vw,48px);line-height:1;letter-spacing:-1.5px}
        .hero-card p{margin:10px 0 0;color:rgba(255,255,255,.75);font-size:10px}.status{border-radius:999px;padding:8px 11px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);font-size:9px;font-weight:900}
        .progress{margin-top:14px;border:1px solid #e4dbd5;border-radius:15px;background:#fff;padding:14px;display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
        .progress>div{position:relative;display:flex;align-items:center;gap:8px;color:#a1948d;font-size:9px}.progress>div:not(:last-child)::after{content:"";position:absolute;left:31px;right:-8px;top:11px;height:2px;background:#eee5df}
        .progress span{position:relative;z-index:1;width:23px;height:23px;border-radius:50%;background:#eee9e5;display:grid;place-items:center;font-size:8px;font-weight:900}.progress strong{position:relative;z-index:1;background:#fff;padding-right:5px}
        .progress .done span,.progress .active span{background:#ef7a00;color:#fff}.progress .done,.progress .active{color:#6f2a18}.progress .done::after{background:#f3b887}
        .metrics{margin-top:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.metrics article{border:1px solid #e4dbd5;border-radius:14px;background:#fff;padding:14px}
        .metrics span,.card-header span,.summary>span,.notes>span{display:block;color:#a0928b;font-size:8px;font-weight:900;letter-spacing:1.1px}.metrics strong{display:block;margin-top:4px;color:#3c2f29;font-size:22px}.metrics small{display:block;margin-top:4px;color:#9b8d86;font-size:8px}
        .warn{color:#c76524!important}.ok{color:#258157!important}.layout{margin-top:14px;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(310px,.72fr);gap:14px;align-items:start}
        .main-column,.side-column{display:flex;flex-direction:column;gap:14px}.card{border:1px solid #e3dad4;border-radius:17px;background:#fff;overflow:hidden;box-shadow:0 8px 24px rgba(69,45,34,.035)}
        .card-header{min-height:65px;padding:14px 16px;border-bottom:1px solid #eee7e2;display:flex;align-items:center;justify-content:space-between;gap:14px}.card-header.compact{min-height:58px}.card-header h2{margin:3px 0 0;color:#3f312b;font-size:16px}
        .edit{min-height:34px;border:1px solid #e3d6ce;border-radius:9px;background:#fff9f4;color:#8a2a18;padding:0 10px;font-size:8px}.icon{width:32px;height:32px;border:1px solid #e3d6ce;border-radius:9px;background:#fff9f4;color:#8a2a18}
        .item{padding:15px 16px;border-top:1px solid #f0e9e5;display:grid;grid-template-columns:64px minmax(0,1fr) minmax(370px,.95fr);gap:13px;align-items:center}.item:first-of-type{border-top:0}
        .photo{width:64px;height:64px;border:1px solid #ece3de;border-radius:11px;background:#faf8f6;display:grid;place-items:center;color:#b19f96;overflow:hidden}.photo img{width:100%;height:100%;object-fit:contain}
        .item-copy>strong{display:block;color:#40322c;font-size:11px}.item-copy>small{display:block;margin-top:4px;color:#9a8c84;font-size:8px}.item-copy>p{margin:6px 0 0;color:#8b7d75;font-size:8px}
        .item-values{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}.item-values span{display:block;color:#aa9c94;font-size:7px;font-weight:900}.item-values strong{display:block;margin-top:3px;color:#40322c;font-size:10px;white-space:nowrap}.item-values small.discount-value{display:block;margin-top:2px;color:#b45c2b;font-size:7px}.discount-preview{display:block;margin-top:4px;color:#b45c2b;font-size:7px;font-weight:800}
        .item-edit{margin-top:9px;display:grid;grid-template-columns:80px 100px 100px 1fr;gap:7px}.item-edit label,.form label,.shipment-meta label{display:flex;flex-direction:column;gap:4px}
        label>span{color:#9d8f87;font-size:7px;font-weight:900;text-transform:uppercase}input,select,textarea{width:100%;box-sizing:border-box;border:1px solid #dfd4ce;border-radius:8px;background:#fff;color:#3d302a;padding:8px;font-size:9px;outline:none}textarea{min-height:72px;resize:vertical}input:disabled{background:#f3f0ed}
        .save-row{padding:12px 16px;border-top:1px solid #eee7e2;display:flex;justify-content:flex-end}.empty{padding:26px 16px;color:#94867f;font-size:9px;text-align:center}
        .shipment{padding:13px 16px;border-top:1px solid #f0e9e5;display:grid;grid-template-columns:1.1fr .8fr 1fr 85px;gap:12px;align-items:center}.shipment>div{display:flex;flex-direction:column;gap:3px}.shipment strong{font-size:9px;color:#493a33}.shipment small{font-size:7px;color:#9b8e87}.shipment>span{justify-self:end;border-radius:999px;background:#eef7f1;color:#33754c;padding:5px 7px;font-size:7px;font-weight:900}
        .file{padding:12px 16px;border-top:1px solid #f0e9e5;display:grid;grid-template-columns:28px 1fr auto;gap:8px;align-items:center;color:#8a2a18;text-decoration:none}.file div{display:flex;flex-direction:column;gap:2px}.file strong{font-size:9px;color:#44362f}.file small,.file>span{font-size:7px;color:#9a8c84}
        .timeline{padding:4px 16px 14px}.timeline article{position:relative;padding:12px 0 4px 21px;border-left:1px solid #eadfd9}.timeline i{position:absolute;left:-4px;top:16px;width:7px;height:7px;border-radius:50%;background:#ef7a00}.timeline strong{font-size:9px;color:#463730}.timeline p{margin:3px 0 0;font-size:8px;color:#81736c}.timeline small{display:block;margin-top:4px;font-size:7px;color:#a0938c}
        .form{padding:14px;display:flex;flex-direction:column;gap:9px}.read{display:flex;flex-direction:column}.read>div{padding:10px 14px;border-top:1px solid #f1ebe7;display:flex;flex-direction:column;gap:3px}.read>div:first-child{border-top:0}.read span{font-size:7px;color:#a0938c;font-weight:900;text-transform:uppercase}.read strong{font-size:9px;color:#44362f;line-height:1.4;overflow-wrap:anywhere}
        .summary{padding:15px}.summary>span{margin-bottom:8px}.summary>div{padding:8px 0;border-top:1px solid #f0e9e5;display:flex;justify-content:space-between;gap:12px}.summary small{font-size:8px;color:#8e817a}.summary strong{font-size:9px;color:#44362f}.summary .grand{margin-top:4px;padding-top:12px;border-top:1px solid #dbcfc8}.summary .grand strong{font-size:18px;color:#8a2a18}
        .notes{padding:15px}.notes>div{margin-top:10px;border-top:1px solid #eee6e1;padding-top:9px}.notes strong{font-size:8px;color:#5a463d}.notes p{margin:4px 0 0;font-size:8px;color:#81736c;line-height:1.5;white-space:pre-line}
        .documents-empty{min-height:170px;padding:28px 18px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
        .documents-empty-icon{width:42px;height:42px;border-radius:12px;background:#fff2e7;color:#8a2a18;display:grid;place-items:center;margin-bottom:10px}
        .documents-empty strong{color:#44362f;font-size:10px}
        .documents-empty p{max-width:390px;margin:5px 0 0;color:#94867f;font-size:8px;line-height:1.5}
        .documents-empty button{margin-top:12px;min-height:34px;border:1px solid #ead7ca;border-radius:9px;background:#fff8f2;color:#8a2a18;padding:0 10px;display:inline-flex;align-items:center;gap:6px;font-size:8px;font-weight:900;cursor:pointer}
        .document-list{display:flex;flex-direction:column}
        .document-row{padding:12px 16px;border-top:1px solid #f0e9e5;display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:10px;align-items:center}
        .document-row:first-child{border-top:0}
        .document-icon{width:36px;height:36px;border-radius:10px;background:#fff2e7;color:#8a2a18;display:grid;place-items:center}
        .document-copy{min-width:0}
        .document-copy>strong{display:block;color:#44362f;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .document-copy>small{display:block;margin-top:3px;color:#9a8c84;font-size:7px}
        .document-copy>p{margin:5px 0 0;color:#81736c;font-size:7.5px;line-height:1.45}
        .document-actions{display:flex;align-items:center;gap:6px}
        .document-actions button{min-height:31px;border:1px solid #e5d9d2;border-radius:8px;background:#fff;color:#7b6d65;padding:0 8px;display:inline-flex;align-items:center;gap:5px;font-size:7px;font-weight:900;cursor:pointer}
        .document-actions button:hover:not(:disabled){background:#fff8f2;color:#8a2a18;border-color:#ead0c0}
        .document-actions button.danger{width:31px;padding:0;justify-content:center;color:#a64a3f}
        .document-actions button:disabled{opacity:.5;cursor:not-allowed}
        .document-modal{width:min(590px,100%)}
        .document-form{margin-top:15px;display:flex;flex-direction:column;gap:11px}
        .document-form label{display:flex;flex-direction:column;gap:5px}
        .document-form label>span em{font-style:normal;font-weight:700;text-transform:none;color:#b2a59e}
        .drop-zone{position:relative;min-height:180px;border:1.5px dashed #d9c9c0;border-radius:14px;background:#faf8f6;padding:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;transition:border-color .18s ease,background .18s ease,transform .18s ease}
        .drop-zone.dragging{border-color:#ef7a00;background:#fff5eb;transform:scale(1.006)}
        .drop-zone.has-file{border-style:solid;background:#fffcfa}
        .drop-zone>input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
        .drop-icon{width:46px;height:46px;border-radius:14px;background:#fff0e3;color:#8a2a18;display:grid;place-items:center;margin-bottom:10px}
        .drop-icon.selected{background:#eef7f1;color:#2f7a52}
        .drop-zone>strong{max-width:100%;color:#44362f;font-size:10px;overflow-wrap:anywhere}
        .drop-zone>small{margin-top:4px;color:#9a8d85;font-size:7.5px}
        .choose-file{margin-top:12px!important;min-height:32px;border:1px solid #e5d6ce;border-radius:8px;background:#fff;color:#8a2a18;padding:0 10px!important;display:inline-flex!important;align-items:center;justify-content:center;cursor:pointer;font-size:8px!important;font-weight:900!important;text-transform:none!important}
        .danger-icon{background:#fbecea!important;color:#a4473d!important}
        .delete-document-summary{margin-top:14px;border:1px solid #eadfd9;border-radius:11px;background:#faf8f6;padding:11px 12px;display:flex;flex-direction:column;gap:3px}
        .delete-document-summary span{color:#a0938c;font-size:7px;font-weight:900}
        .delete-document-summary strong{color:#493a33;font-size:9px;overflow-wrap:anywhere}
        .danger-button{min-height:40px;border:1px solid #a4473d;border-radius:10px;background:#a4473d;color:#fff;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-size:9px;font-weight:900;cursor:pointer}
        .danger-button:disabled{opacity:.55;cursor:not-allowed}
        .backdrop{position:fixed;inset:0;z-index:100;background:rgba(39,26,20,.45);backdrop-filter:blur(3px);display:grid;place-items:center;padding:20px}.modal{width:min(470px,100%);max-height:calc(100vh - 40px);overflow:auto;border-radius:20px;background:#fff;padding:24px;box-shadow:0 24px 70px rgba(39,26,20,.25)}
        .modal-icon{width:46px;height:46px;border-radius:14px;background:#fff0e3;color:#8a2a18;display:grid;place-items:center;margin-bottom:14px}.modal>span{color:#ef7a00;font-size:8px;font-weight:900;letter-spacing:1.3px}.modal h2{margin:5px 0 0;font-size:22px;color:#382a24}.modal>p{margin:9px 0 0;font-size:10px;color:#82756e;line-height:1.55}
        .modal-summary{margin-top:15px;border:1px solid #e7ddd7;border-radius:12px;background:#faf8f6;display:grid;grid-template-columns:repeat(3,1fr)}.modal-summary>div{padding:11px;border-left:1px solid #e7ddd7}.modal-summary>div:first-child{border-left:0}.modal-summary span{font-size:7px;color:#a0938c;font-weight:900}.modal-summary strong{display:block;margin-top:3px;font-size:9px;color:#4b3931}
        .modal-actions{margin-top:17px;display:flex;justify-content:flex-end;gap:8px}.shipment-modal{width:min(650px,100%)}.shipment-items{margin-top:14px;border:1px solid #e6ddd7;border-radius:12px;overflow:hidden}.shipment-items>div{padding:10px 12px;border-top:1px solid #eee7e2;display:grid;grid-template-columns:1fr 90px;gap:10px;align-items:center}.shipment-items>div:first-child{border-top:0}.shipment-items>div>div{display:flex;flex-direction:column;gap:3px}.shipment-items strong{font-size:9px;color:#493a33}.shipment-items small{font-size:7px;color:#9b8d86}
        .shipment-meta{margin-top:12px;display:grid;grid-template-columns:repeat(2,1fr);gap:9px}
        .shipment-items.refined{border:0;overflow:visible;display:flex;flex-direction:column;gap:10px}
        .shipment-item-card{border:1px solid #e6ddd7;border-radius:13px;background:#fff;padding:12px}
        .shipment-item-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
        .shipment-item-top>div{display:flex;flex-direction:column;gap:3px}
        .shipment-item-top strong{font-size:10px;color:#493a33}
        .shipment-item-top small{font-size:7px;color:#9b8d86}
        .use-balance{min-height:30px;border:1px solid #ead7ca;border-radius:8px;background:#fff8f2;color:#8a2a18;padding:0 9px;font-size:7px;font-weight:900;cursor:pointer;white-space:nowrap}
        .use-balance:hover:not(:disabled){background:#fff0e6}
        .use-balance:disabled{opacity:.55;cursor:not-allowed}
        .shipment-balance{margin-top:10px;border-top:1px solid #f0e8e3;padding-top:10px;display:grid;grid-template-columns:80px 90px 70px minmax(155px,1fr);gap:10px;align-items:end}
        .shipment-balance>div{min-width:0}
        .shipment-balance span{display:block;color:#a0938c;font-size:7px;font-weight:900}
        .shipment-balance strong{display:block;margin-top:3px;color:#44362f;font-size:13px}
        .shipment-balance label{display:flex;flex-direction:column;gap:5px}
        .shipment-balance input{min-height:37px;font-size:11px;font-weight:900}
        .shipment-meta label>span em{font-style:normal;font-weight:700;text-transform:none;color:#b2a59e}
        .shipment-total{margin-top:12px;border:1px solid #eadfd8;border-radius:11px;background:#faf8f6;padding:11px 12px;display:flex;align-items:center;justify-content:space-between;gap:14px}
        .shipment-total>div{display:flex;flex-direction:column;gap:3px}
        .shipment-total span{color:#a0938c;font-size:7px;font-weight:900}
        .shipment-total strong{color:#8a2a18;font-size:13px}
        .shipment-total small{color:#9a8d85;font-size:7px;text-align:right}
        @media(max-width:1180px){.layout{grid-template-columns:1fr}.side-column{display:grid;grid-template-columns:repeat(2,1fr)}}@media(max-width:980px){.shell{grid-template-columns:1fr}}
        @media(max-width:760px){.page{padding:18px 14px 40px}.source-banner{grid-template-columns:40px 1fr}.source-banner .review-button{grid-column:1/-1;width:100%}.top-actions,.top-actions>div,.hero-card{align-items:stretch;flex-direction:column}.metrics{grid-template-columns:repeat(2,1fr)}.progress{overflow-x:auto;grid-template-columns:repeat(5,130px)}.item{grid-template-columns:55px 1fr}.item-values{grid-column:1/-1}.item-edit{grid-template-columns:repeat(2,1fr)}.item-edit .wide{grid-column:1/-1}.side-column{display:flex}.shipment{grid-template-columns:1fr 1fr}.shipment>span{justify-self:start}.shipment-meta{grid-template-columns:1fr}.document-row{grid-template-columns:36px 1fr}.document-actions{grid-column:1/-1;justify-content:flex-end}.shipment-item-top{flex-direction:column}.shipment-balance{grid-template-columns:repeat(3,1fr)}.shipment-balance label{grid-column:1/-1}.shipment-total{align-items:flex-start;flex-direction:column}.shipment-total small{text-align:left}}
        @media print{ :global(.app-sidebar),.top-actions,.feedback,.edit,.icon,.save-row,.review-button{display:none!important}.shell{display:block;background:#fff}.page{padding:0}.layout{grid-template-columns:1fr}.side-column{display:grid;grid-template-columns:1fr 1fr}.card,.hero-card,.progress,.metrics article{box-shadow:none;break-inside:avoid}}
      `}</style>
    </main>
  );
}
