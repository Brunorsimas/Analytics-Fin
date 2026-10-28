import { NextResponse } from "next/server";
import { procurarTitulo, rotuloTitulo, tesouro } from "@/lib/tesouro";
import { inflacaoImplicita, prazoEmAnos, taxaParaPrazo } from "@/lib/curva";

export const dynamic = "force-dynamic";

/**
 * GET /api/tesouro                 — curva de juros e lista de títulos
 * GET /api/tesouro?q=ipca+2035     — busca um título específico
 *
 * Recebe apenas um termo de busca público. Nenhum dado do usuário passa aqui.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  const snap = await tesouro();

  if (!snap) {
    return NextResponse.json(
      { erro: "fonte indisponível", fonte: "Tesouro Transparente" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!q) {
    const prazos = [0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30];
    return NextResponse.json(
      {
        dataBase: snap.dataBase,
        fonte: snap.fonte,
        curva: {
          nominal: snap.curva.nominal,
          real: snap.curva.real,
          implicita: prazos
            .map((p) => ({ prazoAnos: p, taxa: inflacaoImplicita(snap.curva, p) }))
            .filter((x) => x.taxa !== null),
        },
        titulos: snap.titulos.map((t) => ({
          rotulo: rotuloTitulo(t),
          nome: t.nome,
          indexador: t.indexador,
          vencimento: t.vencimento,
          taxaCompra: t.taxaCompra,
          puCompra: t.puCompra,
          jurosSemestrais: t.jurosSemestrais,
        })),
      },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  }

  const achados = procurarTitulo(snap.titulos, q);
  if (achados.length === 0) {
    return NextResponse.json(
      { erro: "não encontrado", consulta: q },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const t = achados[0];
  const prazo = prazoEmAnos(t.vencimento, snap.dataBase);
  const vertices = t.indexador === "IPCA" ? snap.curva.real : snap.curva.nominal;

  return NextResponse.json(
    {
      rotulo: rotuloTitulo(t),
      nome: t.nome,
      indexador: t.indexador,
      vencimento: t.vencimento,
      taxaCompra: t.taxaCompra,
      taxaVenda: t.taxaVenda,
      puCompra: t.puCompra,
      puVenda: t.puVenda,
      prazoAnos: prazo,
      jurosSemestrais: t.jurosSemestrais,
      taxaCurva: taxaParaPrazo(vertices, prazo),
      inflacaoImplicita: inflacaoImplicita(snap.curva, prazo),
      dataBase: snap.dataBase,
      fonte: snap.fonte,
      alternativas: achados.slice(1, 5).map(rotuloTitulo),
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
