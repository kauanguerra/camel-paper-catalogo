import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_WIDTH = 120;
const MAX_WIDTH = 1800;

const MIN_QUALITY = 50;
const MAX_QUALITY = 90;

const DEFAULT_WIDTH = 800;
const DEFAULT_QUALITY = 76;

const MAX_SOURCE_SIZE = 20 * 1024 * 1024; // 20 MB
const FETCH_TIMEOUT_MS = 12_000;

type ImageFormat = "webp" | "jpeg";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isAllowedSource(url: URL) {
  if (url.protocol !== "https:") return false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    return false;
  }

  let supabaseHost: string;

  try {
    supabaseHost = new URL(supabaseUrl).hostname;
  } catch {
    return false;
  }

  return (
    url.hostname === supabaseHost &&
    url.pathname.includes("/storage/v1/object/public/")
  );
}

function getRequestedFormat(request: NextRequest): ImageFormat {
  const requestedFormat = request.nextUrl.searchParams.get("format");

  if (requestedFormat === "jpeg" || requestedFormat === "jpg") {
    return "jpeg";
  }

  return "webp";
}

export async function GET(request: NextRequest) {
  try {
    const src = request.nextUrl.searchParams.get("src");

    const requestedWidth = Number(
      request.nextUrl.searchParams.get("w") || DEFAULT_WIDTH
    );

    const requestedQuality = Number(
      request.nextUrl.searchParams.get("q") || DEFAULT_QUALITY
    );

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
      Number.isFinite(requestedWidth)
        ? Math.round(requestedWidth)
        : DEFAULT_WIDTH,
      MIN_WIDTH,
      MAX_WIDTH
    );

    const quality = clamp(
      Number.isFinite(requestedQuality)
        ? Math.round(requestedQuality)
        : DEFAULT_QUALITY,
      MIN_QUALITY,
      MAX_QUALITY
    );

    const format = getRequestedFormat(request);

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, FETCH_TIMEOUT_MS);

    let imageResponse: Response;

    try {
      imageResponse = await fetch(sourceUrl.toString(), {
        cache: "force-cache",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

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

    const contentLength = Number(
      imageResponse.headers.get("content-length") || 0
    );

    if (contentLength > MAX_SOURCE_SIZE) {
      return NextResponse.json(
        { error: "Imagem original muito grande para processamento." },
        { status: 413 }
      );
    }

    const arrayBuffer = await imageResponse.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_SOURCE_SIZE) {
      return NextResponse.json(
        { error: "Imagem original muito grande para processamento." },
        { status: 413 }
      );
    }

    const input = Buffer.from(arrayBuffer);

    const transformer = sharp(input, {
      failOn: "none",
      limitInputPixels: 80_000_000,
    })
      .rotate()
      .resize({
        width,
        fit: "inside",
        withoutEnlargement: true,
        fastShrinkOnLoad: true,
      });

    let output: Buffer;
    let outputContentType: string;

    if (format === "jpeg") {
      output = await transformer
        .flatten({ background: "#ffffff" })
        .jpeg({
          quality,
          mozjpeg: true,
          chromaSubsampling: "4:2:0",
        })
        .toBuffer();

      outputContentType = "image/jpeg";
    } else {
      output = await transformer
        .webp({
          quality,
          effort: 4,
          smartSubsample: true,
        })
        .toBuffer();

      outputContentType = "image/webp";
    }

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": outputContentType,

        "Cache-Control":
          "public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400, immutable",

        "CDN-Cache-Control":
          "public, max-age=31536000, stale-while-revalidate=86400",

        "Content-Length": String(output.length),

        "X-Image-Width": String(width),
        "X-Image-Quality": String(quality),
        "X-Image-Format": format,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Tempo limite ao carregar a imagem original." },
        { status: 504 }
      );
    }

    console.error("Erro ao otimizar imagem do catálogo:", error);

    return NextResponse.json(
      { error: "Não foi possível otimizar a imagem do catálogo." },
      { status: 500 }
    );
  }
}