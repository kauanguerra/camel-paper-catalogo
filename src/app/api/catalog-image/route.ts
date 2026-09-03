import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_WIDTH = 120;
const MAX_WIDTH = 1600;
const MIN_QUALITY = 55;
const MAX_QUALITY = 88;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isAllowedSource(url: URL) {
  if (url.protocol !== "https:") return false;

  const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
    : null;

  return Boolean(
    supabaseHost &&
      url.hostname === supabaseHost &&
      url.pathname.includes("/storage/v1/object/public/")
  );
}

export async function GET(request: NextRequest) {
  try {
    const src = request.nextUrl.searchParams.get("src");
    const requestedWidth = Number(request.nextUrl.searchParams.get("w") || 900);
    const requestedQuality = Number(request.nextUrl.searchParams.get("q") || 78);

    if (!src) {
      return NextResponse.json(
        { error: "Parâmetro src não informado." },
        { status: 400 }
      );
    }

    let sourceUrl: URL;

    try {
      sourceUrl = new URL(src);
    } catch {
      return NextResponse.json(
        { error: "URL de imagem inválida." },
        { status: 400 }
      );
    }

    if (!isAllowedSource(sourceUrl)) {
      return NextResponse.json(
        { error: "Origem de imagem não permitida." },
        { status: 403 }
      );
    }

    const width = clamp(
      Number.isFinite(requestedWidth) ? Math.round(requestedWidth) : 900,
      MIN_WIDTH,
      MAX_WIDTH
    );

    const quality = clamp(
      Number.isFinite(requestedQuality) ? Math.round(requestedQuality) : 78,
      MIN_QUALITY,
      MAX_QUALITY
    );

    const imageResponse = await fetch(sourceUrl.toString(), {
      cache: "force-cache",
    });

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: "Não foi possível carregar a imagem original." },
        { status: 502 }
      );
    }

    const contentType = imageResponse.headers.get("content-type") || "";

    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "O arquivo solicitado não é uma imagem." },
        { status: 415 }
      );
    }

    const input = Buffer.from(await imageResponse.arrayBuffer());

    const output = await sharp(input)
      .rotate()
      .resize({
        width,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({
        quality,
        mozjpeg: true,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer();

    return new NextResponse(output, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control":
          "public, max-age=31536000, s-maxage=31536000, immutable",
        "Content-Length": String(output.length),
      },
    });
  } catch (error) {
    console.error("Erro ao otimizar imagem do catálogo:", error);

    return NextResponse.json(
      { error: "Não foi possível otimizar a imagem do catálogo." },
      { status: 500 }
    );
  }
}
