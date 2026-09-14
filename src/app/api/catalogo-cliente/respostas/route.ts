import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveProductImage, type ResolvableProductImage } from "@/lib/resolve-product-image";

type RequestItem = {
  catalog_product_id?: string;
  product_id?: string;
  variant_id?: string | null;
  quantity?: number;
};

type CatalogProductRow = {
  id: string;
  catalog_id: string;
  product_id: string;
  custom_price: number | null;
  products:
    | {
        id: string;
        name: string;
        sku: string | null;
        barcode: string | null;
        internal_code: string | null;
        main_image_url: string | null;
        sale_price: number | null;
        unit_price: number | null;
        active: boolean;
        has_variants: boolean;
      }
    | Array<{
        id: string;
        name: string;
        sku: string | null;
        barcode: string | null;
        internal_code: string | null;
        main_image_url: string | null;
        sale_price: number | null;
        unit_price: number | null;
        active: boolean;
        has_variants: boolean;
      }>
    | null;
};

type VariantRow = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  sale_price: number | null;
  active: boolean;
};

type ProductImageRow = ResolvableProductImage & {
  id: string;
};

function getTodayInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Supabase server credentials are not configured.");
      return NextResponse.json(
        { error: "Serviço temporariamente indisponível." },
        { status: 500 }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await request.json();

    const token = cleanText(body?.token, 100);
    const requestedItems: RequestItem[] = Array.isArray(body?.items)
      ? body.items
      : [];

    if (!token) {
      return NextResponse.json(
        { error: "Link do catálogo inválido." },
        { status: 400 }
      );
    }

    if (requestedItems.length === 0) {
      return NextResponse.json(
        { error: "Selecione pelo menos um produto ou variação." },
        { status: 400 }
      );
    }

    if (requestedItems.length > 200) {
      return NextResponse.json(
        { error: "A seleção possui itens demais." },
        { status: 400 }
      );
    }

    const hasInvalidCatalogProductId = requestedItems.some(
      (item) =>
        typeof item.catalog_product_id !== "string" ||
        item.catalog_product_id.trim().length === 0
    );

    const hasInvalidProductId = requestedItems.some(
      (item) =>
        typeof item.product_id !== "string" ||
        item.product_id.trim().length === 0
    );

    if (hasInvalidCatalogProductId || hasInvalidProductId) {
      return NextResponse.json(
        { error: "Há itens inválidos na seleção." },
        { status: 400 }
      );
    }

    const customerName = cleanText(body?.customer_name, 200);
    const customerCompany = cleanText(body?.customer_company, 200);
    const customerContact = cleanText(body?.customer_contact, 300);
    const message = cleanText(body?.message, 3000);

    if (!customerName && !customerCompany) {
      return NextResponse.json(
        { error: "Informe seu nome ou o nome da empresa." },
        { status: 400 }
      );
    }

    const { data: catalog, error: catalogError } = await admin
      .from("catalogs")
      .select("id, share_enabled, valid_until, created_by")
      .eq("share_token", token)
      .eq("share_enabled", true)
      .maybeSingle();

    if (catalogError) {
      console.error("Catalog lookup failed:", catalogError);
      return NextResponse.json(
        { error: "Não foi possível validar este catálogo." },
        { status: 500 }
      );
    }

    if (!catalog) {
      return NextResponse.json(
        { error: "Este catálogo não existe ou foi desativado." },
        { status: 404 }
      );
    }

    if (catalog.valid_until && getTodayInSaoPaulo() > catalog.valid_until) {
      return NextResponse.json(
        { error: "Este catálogo expirou e não aceita novas seleções." },
        { status: 410 }
      );
    }

    let catalogSellerName: string | null = null;

    if (catalog.created_by) {
      const { data: catalogSeller, error: catalogSellerError } = await admin
        .from("profiles")
        .select("name")
        .eq("id", catalog.created_by)
        .maybeSingle();

      if (catalogSellerError) {
        console.error("Catalog seller lookup failed:", catalogSellerError);
      } else {
        catalogSellerName = catalogSeller?.name || null;
      }
    }

    const catalogProductIds = [
      ...new Set(
        requestedItems.map(
          (item) => (item.catalog_product_id as string).trim()
        )
      ),
    ];

    const { data: catalogProducts, error: catalogProductsError } = await admin
      .from("catalog_products")
      .select(
        `
          id,
          catalog_id,
          product_id,
          custom_price,
          products (
            id,
            name,
            sku,
            barcode,
            internal_code,
            main_image_url,
            sale_price,
            unit_price,
            active,
            has_variants
          )
        `
      )
      .eq("catalog_id", catalog.id)
      .in("id", catalogProductIds);

    if (catalogProductsError) {
      console.error("Catalog products lookup failed:", catalogProductsError);
      return NextResponse.json(
        { error: "Não foi possível validar os produtos selecionados." },
        { status: 500 }
      );
    }

    if ((catalogProducts || []).length !== catalogProductIds.length) {
      return NextResponse.json(
        { error: "Um ou mais produtos não pertencem a este catálogo." },
        { status: 400 }
      );
    }

    const variantIds = [
      ...new Set(
        requestedItems
          .map((item) => item.variant_id)
          .filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0
          )
          .map((value) => value.trim())
      ),
    ];

    let variants: VariantRow[] = [];

    if (variantIds.length > 0) {
      const { data: variantRows, error: variantsError } = await admin
        .from("product_variants")
        .select(
          "id, product_id, name, sku, barcode, image_url, sale_price, active"
        )
        .in("id", variantIds)
        .eq("active", true);

      if (variantsError) {
        console.error("Variants lookup failed:", variantsError);
        return NextResponse.json(
          { error: "Não foi possível validar as variações selecionadas." },
          { status: 500 }
        );
      }

      variants = (variantRows || []) as VariantRow[];

      if (variants.length !== variantIds.length) {
        return NextResponse.json(
          { error: "Uma ou mais variações são inválidas ou estão inativas." },
          { status: 400 }
        );
      }
    }

    // Fonte única para snapshots de imagem:
    // carrega todas as imagens dos produtos selecionados e resolve produto/variação
    // pela mesma regra de prioridade usada em todo o sistema.
    const selectedProductIds = [
      ...new Set(
        ((catalogProducts || []) as CatalogProductRow[]).map((row) => row.product_id)
      ),
    ];

    let productImages: ProductImageRow[] = [];

    if (selectedProductIds.length > 0) {
      const { data: productImageRows, error: productImagesError } = await admin
        .from("product_images")
        .select(
          "id, product_id, variant_id, image_url, image_type, catalog_slot, is_primary, approved, source"
        )
        .in("product_id", selectedProductIds);

      if (productImagesError) {
        console.error("Product images lookup failed:", productImagesError);
        return NextResponse.json(
          { error: "Não foi possível carregar as imagens dos produtos selecionados." },
          { status: 500 }
        );
      }

      productImages = (productImageRows || []) as ProductImageRow[];
    }

    const catalogProductMap = new Map(
      ((catalogProducts || []) as CatalogProductRow[]).map((row) => [
        row.id,
        row,
      ])
    );

    const variantMap = new Map(
      variants.map((variant) => [variant.id, variant])
    );

    const responseItems = requestedItems.map((requestedItem) => {
      const catalogProductId = (
        requestedItem.catalog_product_id as string
      ).trim();

      const productId = (requestedItem.product_id as string).trim();
      const catalogProduct = catalogProductMap.get(catalogProductId);

      if (!catalogProduct) throw new Error("CATALOG_PRODUCT_INVALID");
      if (productId !== catalogProduct.product_id) {
        throw new Error("PRODUCT_MISMATCH");
      }

      const product = Array.isArray(catalogProduct.products)
        ? catalogProduct.products[0]
        : catalogProduct.products;

      if (!product || product.active === false) {
        throw new Error("PRODUCT_INACTIVE");
      }

      const quantity = Math.floor(Number(requestedItem.quantity));

      if (
        !Number.isFinite(quantity) ||
        quantity < 1 ||
        quantity > 100000
      ) {
        throw new Error("QUANTITY_INVALID");
      }

      const basePrice =
        catalogProduct.custom_price !== null &&
        catalogProduct.custom_price !== undefined
          ? Number(catalogProduct.custom_price)
          : Number(product.sale_price ?? product.unit_price ?? 0);

      let unitPrice = basePrice;
      let variantId: string | null = null;
      let variant: VariantRow | null = null;

      if (
        typeof requestedItem.variant_id === "string" &&
        requestedItem.variant_id.trim()
      ) {
        const requestedVariantId = requestedItem.variant_id.trim();
        const foundVariant = variantMap.get(requestedVariantId);

        if (
          !foundVariant ||
          foundVariant.product_id !== catalogProduct.product_id
        ) {
          throw new Error("VARIANT_MISMATCH");
        }

        variant = foundVariant;
        variantId = foundVariant.id;

        if (
          foundVariant.sale_price !== null &&
          foundVariant.sale_price !== undefined
        ) {
          unitPrice = Number(foundVariant.sale_price);
        }
      } else if (product.has_variants) {
        throw new Error("VARIANT_REQUIRED");
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error("PRICE_INVALID");
      }

      const lineTotal = Number((unitPrice * quantity).toFixed(2));

      return {
        catalog_product_id: catalogProduct.id,
        product_id: catalogProduct.product_id,
        variant_id: variantId,
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        snapshot: {
          product_name: product.name,
          variant_name: variant?.name || null,
          sku: variant?.sku || product.sku || null,
          barcode: variant?.barcode || product.barcode || null,
          internal_code: product.internal_code || null,
          image_url: resolveProductImage({
            productId: product.id,
            variantId: variant?.id || null,
            productMainImageUrl: product.main_image_url,
            variantImageUrl: variant?.image_url || null,
            images: productImages,
          }),
        },
      };
    });

    const totalAmount = Number(
      responseItems
        .reduce((sum, item) => sum + item.line_total, 0)
        .toFixed(2)
    );

    const { data: response, error: responseError } = await admin
      .from("catalog_responses")
      .insert({
        catalog_id: catalog.id,
        customer_name: customerName || null,
        customer_company: customerCompany || null,
        customer_contact: customerContact || null,
        message: message || null,
        total_amount: totalAmount,
        status: "submitted",
      })
      .select("id, submitted_at")
      .single();

    if (responseError || !response) {
      console.error("Response insert failed:", responseError);
      return NextResponse.json(
        { error: "Não foi possível registrar sua seleção." },
        { status: 500 }
      );
    }

    const responseRows = responseItems.map((item) => ({
      response_id: response.id,
      catalog_product_id: item.catalog_product_id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
    }));

    const { error: responseItemsError } = await admin
      .from("catalog_response_items")
      .insert(responseRows);

    if (responseItemsError) {
      console.error("Response items insert failed:", responseItemsError);

      await admin
        .from("catalog_responses")
        .delete()
        .eq("id", response.id);

      return NextResponse.json(
        { error: "Não foi possível registrar os itens da seleção." },
        { status: 500 }
      );
    }

    const customerEmail = customerContact.includes("@")
      ? customerContact
      : null;

    const customerPhone =
      customerContact && !customerContact.includes("@")
        ? customerContact
        : null;

    const orderCustomerName = customerName || customerCompany;

    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        source_catalog_id: catalog.id,
        source_response_id: response.id,

        customer_name: orderCustomerName,
        customer_company: customerCompany || null,
        customer_document: null,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_address: null,
        customer_city: null,
        customer_state: null,
        customer_zip_code: null,

        subtotal: totalAmount,
        discount_value: 0,
        shipping_value: 0,
        total_value: totalAmount,

        payment_method: null,
        payment_installments: 1,
        payment_notes: null,

        customer_notes: message || null,
        internal_notes: null,

        status: "sent",

        created_by: catalog.created_by || null,
        seller_name: catalogSellerName,

        order_source: "customer_catalog",
        sync_key: response.id,
        source_device_id: null,
        submitted_at: response.submitted_at || new Date().toISOString(),
      })
      .select("id, order_number, total_value")
      .single();

    if (orderError || !order) {
      console.error("Order insert failed:", orderError);

      await admin
        .from("catalog_response_items")
        .delete()
        .eq("response_id", response.id);

      await admin
        .from("catalog_responses")
        .delete()
        .eq("id", response.id);

      return NextResponse.json(
        { error: "Não foi possível criar o pedido a partir da seleção." },
        { status: 500 }
      );
    }

    const orderRows = responseItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id,

      product_name: item.snapshot.product_name,
      variant_name: item.snapshot.variant_name,
      sku: item.snapshot.sku,
      barcode: item.snapshot.barcode,
      internal_code: item.snapshot.internal_code,
      image_url: item.snapshot.image_url,

      quantity: item.quantity,
      shipped_quantity: 0,

      original_unit_price: item.unit_price,
      unit_price: item.unit_price,

      discount_percent: 0,
      discount_value: 0,
      line_total: item.line_total,

      notes: null,
    }));

    const { error: orderItemsError } = await admin
      .from("order_items")
      .insert(orderRows);

    if (orderItemsError) {
      console.error("Order items insert failed:", orderItemsError);

      await admin.from("orders").delete().eq("id", order.id);

      await admin
        .from("catalog_response_items")
        .delete()
        .eq("response_id", response.id);

      await admin
        .from("catalog_responses")
        .delete()
        .eq("id", response.id);

      return NextResponse.json(
        { error: "Não foi possível criar os itens do pedido." },
        { status: 500 }
      );
    }

    const { error: historyError } = await admin
      .from("order_status_history")
      .insert({
        order_id: order.id,
        previous_status: null,
        new_status: "sent",
        changed_by: null,
        changed_by_name: "Cliente via catálogo",
        notes: "Pedido recebido pelo catálogo compartilhado.",
      });

    if (historyError) {
      console.error(
        "Order history insert failed, but order was created:",
        historyError
      );
    }

    return NextResponse.json({
      ok: true,
      response_id: response.id,
      order_id: order.id,
      order_number: order.order_number,
      total_amount: Number(order.total_value || totalAmount),
    });
  } catch (error) {
    console.error("Public catalog response error:", error);

    const knownErrors: Record<string, string> = {
      CATALOG_PRODUCT_INVALID: "Há um produto inválido na seleção.",
      PRODUCT_MISMATCH: "Os dados de um produto não conferem.",
      PRODUCT_INACTIVE:
        "Um dos produtos selecionados não está mais disponível.",
      QUANTITY_INVALID: "Há uma quantidade inválida na seleção.",
      VARIANT_MISMATCH:
        "Uma das variações selecionadas não pertence ao produto.",
      VARIANT_REQUIRED:
        "Escolha uma variação para todos os produtos que possuem opções.",
      PRICE_INVALID:
        "Não foi possível validar o preço de um dos itens.",
    };

    const message = error instanceof Error ? error.message : "";

    return NextResponse.json(
      {
        error:
          knownErrors[message] ||
          "Ocorreu um erro ao enviar sua seleção.",
      },
      { status: knownErrors[message] ? 400 : 500 }
    );
  }
}
