import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RequestItem = {
  catalog_product_id?: string;
  product_id?: string;
  variant_id?: string | null;
  quantity?: number;
};

function getTodayInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
    const token = typeof body?.token === "string" ? body.token.trim() : "";
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

    const customerName =
      typeof body?.customer_name === "string"
        ? body.customer_name.trim().slice(0, 200)
        : "";

    const customerCompany =
      typeof body?.customer_company === "string"
        ? body.customer_company.trim().slice(0, 200)
        : "";

    const customerContact =
      typeof body?.customer_contact === "string"
        ? body.customer_contact.trim().slice(0, 300)
        : "";

    const message =
      typeof body?.message === "string"
        ? body.message.trim().slice(0, 3000)
        : "";

    if (!customerName && !customerCompany) {
      return NextResponse.json(
        { error: "Informe seu nome ou o nome da empresa." },
        { status: 400 }
      );
    }

    const { data: catalog, error: catalogError } = await admin
      .from("catalogs")
      .select("id, share_enabled, valid_until")
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

    // IMPORTANTE:
    // Várias variações do mesmo produto compartilham o MESMO catalog_product_id.
    // Por isso usamos IDs únicos apenas para buscar os produtos do catálogo,
    // sem exigir que a quantidade de IDs únicos seja igual à quantidade de itens.
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
            sale_price,
            active
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

    let variants: Array<{
      id: string;
      product_id: string;
      sale_price: number | null;
      active: boolean;
    }> = [];

    if (variantIds.length > 0) {
      const { data: variantRows, error: variantsError } = await admin
        .from("product_variants")
        .select("id, product_id, sale_price, active")
        .in("id", variantIds)
        .eq("active", true);

      if (variantsError) {
        console.error("Variants lookup failed:", variantsError);
        return NextResponse.json(
          { error: "Não foi possível validar as variações selecionadas." },
          { status: 500 }
        );
      }

      variants = (variantRows || []) as typeof variants;

      if (variants.length !== variantIds.length) {
        return NextResponse.json(
          { error: "Uma ou mais variações são inválidas ou estão inativas." },
          { status: 400 }
        );
      }
    }

    const catalogProductMap = new Map(
      (catalogProducts || []).map((row: any) => [row.id, row])
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

      if (!catalogProduct) {
        throw new Error("CATALOG_PRODUCT_INVALID");
      }

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
          : Number(product.sale_price || 0);

      let unitPrice = basePrice;
      let variantId: string | null = null;

      if (
        typeof requestedItem.variant_id === "string" &&
        requestedItem.variant_id.trim()
      ) {
        const requestedVariantId = requestedItem.variant_id.trim();
        const variant = variantMap.get(requestedVariantId);

        if (
          !variant ||
          variant.product_id !== catalogProduct.product_id
        ) {
          throw new Error("VARIANT_MISMATCH");
        }

        variantId = variant.id;

        if (
          variant.sale_price !== null &&
          variant.sale_price !== undefined
        ) {
          unitPrice = Number(variant.sale_price);
        }
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error("PRICE_INVALID");
      }

      const lineTotal = Number(
        (unitPrice * quantity).toFixed(2)
      );

      return {
        catalog_product_id: catalogProduct.id,
        product_id: catalogProduct.product_id,
        variant_id: variantId,
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
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
      .select("id")
      .single();

    if (responseError || !response) {
      console.error("Response insert failed:", responseError);
      return NextResponse.json(
        { error: "Não foi possível registrar sua seleção." },
        { status: 500 }
      );
    }

    const rowsToInsert = responseItems.map((item) => ({
      ...item,
      response_id: response.id,
    }));

    const { error: itemsError } = await admin
      .from("catalog_response_items")
      .insert(rowsToInsert);

    if (itemsError) {
      console.error("Response items insert failed:", itemsError);

      await admin
        .from("catalog_responses")
        .delete()
        .eq("id", response.id);

      return NextResponse.json(
        { error: "Não foi possível registrar os itens da seleção." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      response_id: response.id,
      total_amount: totalAmount,
    });
  } catch (error) {
    console.error("Public catalog response error:", error);

    const knownErrors: Record<string, string> = {
      CATALOG_PRODUCT_INVALID:
        "Há um produto inválido na seleção.",
      PRODUCT_MISMATCH:
        "Os dados de um produto não conferem.",
      PRODUCT_INACTIVE:
        "Um dos produtos selecionados não está mais disponível.",
      QUANTITY_INVALID:
        "Há uma quantidade inválida na seleção.",
      VARIANT_MISMATCH:
        "Uma das variações selecionadas não pertence ao produto.",
      PRICE_INVALID:
        "Não foi possível validar o preço de um dos itens.",
    };

    const message =
      error instanceof Error ? error.message : "";

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
