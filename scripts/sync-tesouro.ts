/**
 * Baixa o CSV do Tesouro Transparente e grava o snapshot do dia no Neon.
 *
 * O CSV tem ~15 MB: pesado demais para cada invocação serverless, leve para
 * um job diário. As rotas leem do banco.
 *
 * Uso: npm run sync:tesouro
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function carregarEnv() {
  for (const arquivo of [".env.local", ".env"]) {
    try {
      const txt = readFileSync(join(process.cwd(), arquivo), "utf8");
      for (const linha of txt.split("\n")) {
        const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* ausente */
    }
  }
}
carregarEnv();

import { baixarDoTesouro } from "../src/lib/tesouro";
import { gravarTitulos, type TituloRow } from "../src/lib/neon";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ausente. Rode `neon link` antes.");
    process.exit(1);
  }

  console.log("baixando CSV do Tesouro Transparente (~15 MB)...");
  const snap = await baixarDoTesouro();

  if (!snap) {
    console.error("falhou: fonte indisponível ou formato inesperado");
    process.exit(1);
  }

  console.log(`parseado: ${snap.titulos.length} títulos em ${snap.dataBase}`);
  console.log(
    `curva: ${snap.curva.nominal.length} vértices nominais, ${snap.curva.real.length} reais`,
  );

  const linhas: TituloRow[] = snap.titulos.map((t) => ({
    nome: t.nome,
    indexador: t.indexador,
    vencimento: t.vencimento,
    taxa_compra: t.taxaCompra,
    taxa_venda: t.taxaVenda,
    pu_compra: t.puCompra,
    pu_venda: t.puVenda,
    data_base: t.dataBase,
    juros_semestrais: t.jurosSemestrais,
  }));

  const n = await gravarTitulos(linhas);
  console.log(`\nok: ${n} títulos gravados no Neon`);
}

main().catch((e) => {
  console.error("falhou:", (e as Error).message);
  process.exit(1);
});
