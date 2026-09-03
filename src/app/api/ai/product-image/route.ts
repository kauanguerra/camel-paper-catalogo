import OpenAI, { toFile } from "openai";
import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 120;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type CatalogSlot = "front" | "back" | "product" | "detail";

const SLOT_INSTRUCTIONS: Record<CatalogSlot, string> = {
  front: `
TIPO DE FOTO A GERAR: FRENTE PROFISSIONAL.

Crie a melhor apresentação frontal do produto para catálogo.
Priorize a aparência da frente real mostrada nas referências.
A imagem deve servir como a principal foto comercial do produto.

Mostre o produto inteiro, centralizado, com leitura visual clara da frente.
Não transforme uma vista lateral ou traseira em uma frente inventada.
Use apenas informações realmente visíveis nas referências.
`,
  back: `
TIPO DE FOTO A GERAR: VERSO PROFISSIONAL.

Crie uma fotografia profissional mostrando o verso real do produto ou da embalagem.
Preserve códigos, informações, desenhos, formato, fechamento, acabamento e demais
elementos realmente visíveis no verso das referências.

Não invente textos que não estejam legíveis.
Não converta a frente em um verso imaginado.
`,
  product: `
TIPO DE FOTO A GERAR: PRODUTO FORA DA EMBALAGEM.

Crie uma fotografia profissional do produto real fora da embalagem.
Priorize a referência que mostra o produto em si, preservando exatamente
formato, proporções, cor, material, textura, tampa, alças, mecanismos,
encaixes e acessórios existentes.

Não acrescente embalagem caso a referência principal mostre o produto sem ela.
`,
  detail: `
TIPO DE FOTO A GERAR: DETALHE PROFISSIONAL.

Crie uma fotografia profissional de detalhe do mesmo produto.
Priorize o detalhe real mostrado nas referências: acabamento, mecanismo,
textura, ponta, tampa, encaixe, botão, costura, impressão ou componente relevante.

Não invente um detalhe diferente.
O enquadramento pode ser mais próximo, mas deve continuar sendo claramente
o mesmo produto real.
`,
};

function isCatalogSlot(value: unknown): value is CatalogSlot {
  return (
    value === "front" ||
    value === "back" ||
    value === "product" ||
    value === "detail"
  );
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY não configurada no servidor." },
        { status: 500 }
      );
    }

    const body = await request.json();

    const productName = String(body?.productName || "Produto Camel Paper");
    const sku = String(body?.sku || "");
    const catalogSlot: CatalogSlot = isCatalogSlot(body?.catalogSlot)
      ? body.catalogSlot
      : "front";

    const imageUrls = Array.isArray(body?.imageUrls)
      ? body.imageUrls.filter(
          (url: unknown): url is string =>
            typeof url === "string" && url.trim().length > 0
        )
      : [];

    if (imageUrls.length === 0) {
      return NextResponse.json(
        { error: "Envie pelo menos uma imagem de referência." },
        { status: 400 }
      );
    }

    const referenceImages = await Promise.all(
      imageUrls.slice(0, 4).map(async (url: string, index: number) => {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Não foi possível baixar a imagem ${index + 1}. HTTP ${response.status}.`
          );
        }

        const originalBytes = Buffer.from(await response.arrayBuffer());

        if (originalBytes.length === 0) {
          throw new Error(`A imagem ${index + 1} está vazia.`);
        }

        let normalizedBytes: Buffer;

        try {
          normalizedBytes = await sharp(originalBytes)
            .rotate()
            .resize({
              width: 2048,
              height: 2048,
              fit: "inside",
              withoutEnlargement: true,
            })
            .flatten({ background: "#ffffff" })
            .toColourspace("srgb")
            .png()
            .toBuffer();
        } catch (imageError) {
          console.error(
            `Erro ao normalizar a imagem ${index + 1}:`,
            imageError
          );

          throw new Error(
            `A foto ${index + 1} não pôde ser processada. Troque essa foto por JPG, PNG ou WEBP e tente novamente.`
          );
        }

        return toFile(normalizedBytes, `reference-${index + 1}.png`, {
          type: "image/png",
        });
      })
    );

    const prompt = `
Você receberá até quatro imagens de referência do MESMO produto real.

Quando existirem quatro referências, considere esta ordem:
1. frente da embalagem/produto;
2. verso da embalagem/produto;
3. produto fora da embalagem;
4. detalhe.

Produto: ${productName}
${sku ? `SKU informado: ${sku}` : ""}

${SLOT_INSTRUCTIONS[catalogSlot]}

MISSÃO:
Crie UMA ÚNICA fotografia profissional de catálogo em estúdio,
mantendo o produto visualmente fiel ao original.

PRIORIDADE ABSOLUTA:
A fidelidade ao produto original é mais importante do que a estética da imagem.

O produto final deve representar ESPECIFICAMENTE o mesmo produto das referências.
Não crie uma versão semelhante.
Não redesenhe.
Não estilize.
Não modernize.
Não interprete livremente.

NÃO ALTERE NENHUM DETALHE DO PRODUTO.

Preserve rigorosamente:
- formato;
- proporções;
- dimensões visuais;
- cores;
- materiais;
- texturas;
- acabamento;
- embalagem;
- logotipos;
- marca;
- rótulos;
- estampas;
- textos realmente visíveis;
- códigos realmente visíveis;
- tampas;
- alças;
- botões;
- encaixes;
- acessórios;
- quantidade de itens;
- posição e aparência dos componentes existentes.

NÃO:
- adicione elementos inexistentes;
- remova elementos existentes;
- invente peças;
- invente acessórios;
- invente textos;
- invente símbolos;
- invente logotipos;
- invente códigos;
- reescreva textos ilegíveis;
- altere a marca;
- mude a cor;
- mude o design;
- mude o formato;
- altere a quantidade de itens;
- acrescente mãos ou pessoas;
- acrescente cenário;
- acrescente objetos decorativos;
- acrescente elementos gráficos.

Use TODAS as imagens em conjunto para compreender corretamente
a geometria, materiais e detalhes do mesmo produto.

Se algum detalhe não estiver claramente visível, NÃO INVENTE.
Mantenha somente o que puder ser sustentado pelas referências.

APRESENTAÇÃO FOTOGRÁFICA:
- fundo branco puro (#FFFFFF);
- fundo uniforme e sem textura;
- iluminação profissional de estúdio;
- luz suave e uniforme;
- alta nitidez;
- ótima definição;
- aparência fotográfica realista;
- sombra de contato discreta e natural;
- reflexos coerentes com o material real;
- enquadramento limpo;
- sem pessoas;
- sem elementos decorativos;
- sem texto adicional;
- estética de catálogo e e-commerce profissional.

Melhore SOMENTE:
- fundo;
- iluminação;
- recorte;
- enquadramento;
- nitidez;
- apresentação de estúdio.

Não modifique o produto para deixá-lo "mais bonito".

REGRA FINAL:
FIDELIDADE AO PRODUTO ORIGINAL > QUALQUER OUTRA CONSIDERAÇÃO ESTÉTICA.
`;

    const response = await client.images.edit({
      model: "gpt-image-2",
      image: referenceImages,
      prompt,
    });

    const imageBase64 = response.data?.[0]?.b64_json;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "A OpenAI não retornou uma imagem." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      imageBase64,
      mimeType: "image/png",
      catalogSlot,
    });
  } catch (error) {
    console.error("Erro na geração de imagem:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao gerar imagem.",
      },
      { status: 500 }
    );
  }
}
