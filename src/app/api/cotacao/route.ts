import { NextResponse } from "next/server";
import { cotar, normalizarTicker } from "@/lib/cotacao";

export const dynamic = "force-dynamic";

/**
 * GET /api/cotacao?ticker=PETR4
 *
 * Recebe apenas um ticker público. Nenhum dado financeiro do usuário
 * passa por aqui — o perfil nunca sai do navegador.
 */
export async function GET(req: Request) {
  const bruto = new URL(req.url).searchParams.get("ticker") ?? "";

  if (bruto.length > 12) {
    return NextResponse.json({ erro: "ticker inválido" }, { status: 400 });
  }

  const ticker = normalizarTicker(bruto);
  if (!ticker) {
    return NextResponse.json(
      { erro: "formato inválido", dica: "Use o código da B3, como PETR4, MXRF11 ou IVVB11." },
      { status: 400 },
    );
  }

  const cotacao = await cotar(ticker);
  if (!cotacao) {
    return NextResponse.json(
      { erro: "não encontrado", ticker },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(cotacao, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
