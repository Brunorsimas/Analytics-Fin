/**
 * Títulos públicos. Roda SOMENTE no servidor.
 *
 * Origem dos dados: Tesouro Transparente (dados abertos), CSV com taxa e PU
 * diários de todos os títulos desde 2002.
 *
 * O CSV tem ~15 MB. Baixá-lo a cada invocação fria é inviável em serverless,
 * então o snapshot do dia vive no Neon: as rotas leem do banco (rápido) e o
 * job `npm run sync:tesouro` atualiza a tabela.
 *
 * `baixarDoTesouro` continua aqui porque é o job que alimenta o banco.
 */
import { indexadorDe, montarCurva, type Curva, type TituloPublico } from "./curva";
import { titulosPublicos } from "./neon";

const URL_CSV =
  "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv";

const TIMEOUT_MS = 30_000;
const TTL_MS = 6 * 60 * 60 * 1000;
const TTL_FALHA_MS = 60_000;

export type SnapshotTesouro = {
  titulos: TituloPublico[];
  curva: Curva;
  dataBase: string;
  fonte: string;
};

let cache: { em: number; valor: SnapshotTesouro | null } | null = null;
let emVoo: Promise<SnapshotTesouro | null> | null = null;

/** "27/10/2026" -> "2026-10-27". Retorna null se o formato não bater. */
function dataBr(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "14,44" -> 0.1444 (taxa) | "853,93" -> 85393 (centavos). */
function numBr(s: string): number | null {
  const n = Number(s.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parsear(csv: string): SnapshotTesouro | null {
  const linhas = csv.split("\n");
  if (linhas.length < 2) return null;

  let dataTopo: string | null = null;
  const titulos: TituloPublico[] = [];

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.trim()) continue;
    const c = linha.split(";");
    if (c.length < 8) continue;

    const base = dataBr(c[2]);
    if (!base) continue;

    // Ordenado por data decrescente: ao mudar a data, já pegamos tudo.
    if (dataTopo === null) dataTopo = base;
    else if (base !== dataTopo) break;

    const indexador = indexadorDe(c[0]);
    const vencimento = dataBr(c[1]);
    const taxaCompra = numBr(c[3]);
    const taxaVenda = numBr(c[4]);
    const puCompra = numBr(c[5]);
    const puVenda = numBr(c[6]);

    if (!indexador || !vencimento || taxaCompra === null || puCompra === null) continue;

    titulos.push({
      nome: c[0].trim(),
      indexador,
      vencimento,
      taxaCompra: taxaCompra / 100,
      taxaVenda: (taxaVenda ?? taxaCompra) / 100,
      puCompra: Math.round(puCompra * 100),
      puVenda: Math.round((puVenda ?? puCompra) * 100),
      dataBase: base,
      jurosSemestrais: /juros semestrais/i.test(c[0]),
    });
  }

  if (!dataTopo || titulos.length === 0) return null;

  return {
    titulos,
    curva: montarCurva(titulos, dataTopo),
    dataBase: dataTopo,
    fonte: "Tesouro Transparente",
  };
}

/** Baixa e parseia o CSV oficial. Usado pelo job de sincronização. */
export async function baixarDoTesouro(): Promise<SnapshotTesouro | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(URL_CSV, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { Accept: "text/csv" },
    });
    if (!resp.ok) return null;
    return parsear(await resp.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lerDoBanco(): Promise<SnapshotTesouro | null> {
  try {
    const rows = await titulosPublicos();
    if (rows.length === 0) return null;

    const titulos: TituloPublico[] = rows.map((r) => ({
      nome: r.nome,
      indexador: r.indexador,
      vencimento: r.vencimento,
      taxaCompra: r.taxa_compra,
      taxaVenda: r.taxa_venda,
      puCompra: r.pu_compra,
      puVenda: r.pu_venda,
      dataBase: r.data_base,
      jurosSemestrais: r.juros_semestrais,
    }));

    const dataBase = titulos[0].dataBase;
    return {
      titulos,
      curva: montarCurva(titulos, dataBase),
      dataBase,
      fonte: "Tesouro Transparente",
    };
  } catch {
    return null;
  }
}

/** Snapshot do dia, lido do Neon. Chamadas concorrentes compartilham a leitura. */
export async function tesouro(): Promise<SnapshotTesouro | null> {
  if (cache) {
    const ttl = cache.valor ? TTL_MS : TTL_FALHA_MS;
    if (Date.now() - cache.em < ttl) return cache.valor;
  }
  if (emVoo) return emVoo;

  emVoo = lerDoBanco()
    .then((valor) => {
      cache = { em: Date.now(), valor };
      return valor;
    })
    .finally(() => {
      emVoo = null;
    });

  return emVoo;
}

const SEM_ACENTO = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Procura um título pelo texto do usuário.
 * Aceita "tesouro selic 2029", "ipca+ 2035", "prefixado 2028".
 */
export function procurarTitulo(
  titulos: TituloPublico[],
  consulta: string,
): TituloPublico[] {
  const q = SEM_ACENTO(consulta);
  const ano = q.match(/\b(20\d{2})\b/)?.[1];

  let tipo: string | null = null;
  if (/selic|lft/.test(q)) tipo = "SELIC";
  else if (/ipca|ntn-?b/.test(q)) tipo = "IPCA";
  else if (/pre|ltn|ntn-?f/.test(q)) tipo = "PRE";
  else if (/igpm|igp-?m/.test(q)) tipo = "IGPM";

  const comJuros = /juros|semestra|cupom/.test(q);
  const rendaMais = /renda\+|renda mais|aposentadoria/.test(q);
  const educa = /educa/.test(q);

  return titulos
    .filter((t) => {
      if (tipo && t.indexador !== tipo) return false;
      if (ano && !t.vencimento.startsWith(ano)) return false;
      const nome = SEM_ACENTO(t.nome);
      if (rendaMais !== nome.includes("renda+")) return false;
      if (educa !== nome.includes("educa+")) return false;
      if (!rendaMais && !educa && comJuros !== t.jurosSemestrais) return false;
      return true;
    })
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

/** Rótulo curto e legível do título. */
export function rotuloTitulo(t: TituloPublico): string {
  return `${t.nome} ${t.vencimento.slice(0, 4)}`;
}
