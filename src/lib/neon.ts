import { neon } from "@neondatabase/serverless";

/**
 * Neon guarda apenas DADOS DE REFERÊNCIA: indicadores de mercado, ativos,
 * cotações e os perfis de demonstração. Nenhum dado informado pelo usuário
 * final trafega para cá — esses ficam no localStorage do navegador dele.
 */
function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente");
  return neon(url);
}

/**
 * Normaliza data para ISO (YYYY-MM-DD).
 * O driver do Neon devolve `date` como objeto Date, e `String(date)` produz
 * "Tue Oct 27 2026 ..." — formato que quebra qualquer comparação por prefixo.
 */
function dataIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export type Indicadores = {
  cdiAnual: number;
  selicAnual: number;
  ipcaAnual: number;
  atualizadoEm: string;
};

export type AtivoRef = {
  ticker: string;
  nome: string;
  classe: string;
  indexador: string;
  liquidez_dias: number;
  fgc: boolean;
  emissor: string;
  setor: string;
  preco_atual: number;
  tributacao: string;
};

export type PerfilDemo = {
  slug: string;
  nome: string;
  descricao: string;
  payload: unknown;
};

export async function indicadores(): Promise<Indicadores> {
  const rows = (await sql()`
    SELECT DISTINCT ON (codigo) codigo, valor, data
    FROM indicador
    WHERE codigo IN ('CDI_ANUAL', 'SELIC_ANUAL', 'IPCA_ANUAL')
    ORDER BY codigo, data DESC
  `) as Array<{ codigo: string; valor: number; data: string }>;

  const pick = (c: string) => Number(rows.find((r) => r.codigo === c)?.valor ?? 0);
  const datas = rows.map((r) => dataIso(r.data)).filter(Boolean).sort();
  return {
    cdiAnual: pick("CDI_ANUAL"),
    selicAnual: pick("SELIC_ANUAL"),
    ipcaAnual: pick("IPCA_ANUAL"),
    atualizadoEm: datas[datas.length - 1] ?? "",
  };
}

export async function ativos(): Promise<AtivoRef[]> {
  const rows = (await sql()`
    SELECT ticker, nome, classe, indexador, liquidez_dias, fgc,
           emissor, setor, preco_atual, tributacao
    FROM ativo ORDER BY classe, ticker
  `) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    ticker: String(r.ticker),
    nome: String(r.nome),
    classe: String(r.classe),
    indexador: String(r.indexador),
    liquidez_dias: Number(r.liquidez_dias),
    fgc: Boolean(r.fgc),
    emissor: String(r.emissor),
    setor: String(r.setor),
    preco_atual: Number(r.preco_atual),
    tributacao: String(r.tributacao),
  }));
}

export async function perfisDemo(): Promise<PerfilDemo[]> {
  const rows = (await sql()`
    SELECT slug, nome, descricao, payload FROM perfil_demo ORDER BY slug
  `) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    slug: String(r.slug),
    nome: String(r.nome),
    descricao: String(r.descricao),
    payload: r.payload,
  }));
}

export async function perfilDemo(slug: string): Promise<PerfilDemo | null> {
  const rows = (await sql()`
    SELECT slug, nome, descricao, payload FROM perfil_demo WHERE slug = ${slug}
  `) as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    slug: String(r.slug),
    nome: String(r.nome),
    descricao: String(r.descricao),
    payload: r.payload,
  };
}

/** Série mensal de um indicador, para gráficos e benchmark. */
export async function serieIndicador(codigo: string) {
  const rows = (await sql()`
    SELECT data, valor FROM indicador WHERE codigo = ${codigo} ORDER BY data
  `) as Array<{ data: string; valor: number }>;
  return rows.map((r) => ({ data: dataIso(r.data), valor: Number(r.valor) }));
}

// ---------------------------------------------------------------------------
// Títulos públicos
//
// O CSV do Tesouro Transparente tem ~15 MB. Baixar a cada invocação fria é
// inviável em serverless, então o snapshot do dia fica no Neon e as rotas
// leem daqui. A atualização roda num job separado (`npm run sync:tesouro`).
// ---------------------------------------------------------------------------

export type TituloRow = {
  nome: string;
  indexador: "SELIC" | "PRE" | "IPCA" | "IGPM";
  vencimento: string;
  taxa_compra: number;
  taxa_venda: number;
  pu_compra: number;
  pu_venda: number;
  data_base: string;
  juros_semestrais: boolean;
};

export async function titulosPublicos(): Promise<TituloRow[]> {
  // to_char no SQL evita depender do formato que o driver escolhe para `date`.
  const rows = (await sql()`
    SELECT nome, indexador,
           to_char(vencimento, 'YYYY-MM-DD') AS vencimento,
           taxa_compra, taxa_venda, pu_compra, pu_venda,
           to_char(data_base, 'YYYY-MM-DD') AS data_base,
           juros_semestrais
    FROM titulo_publico
    ORDER BY indexador, vencimento
  `) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    nome: String(r.nome),
    indexador: String(r.indexador) as TituloRow["indexador"],
    vencimento: dataIso(r.vencimento),
    taxa_compra: Number(r.taxa_compra),
    taxa_venda: Number(r.taxa_venda),
    pu_compra: Number(r.pu_compra),
    pu_venda: Number(r.pu_venda),
    data_base: dataIso(r.data_base),
    juros_semestrais: Boolean(r.juros_semestrais),
  }));
}

/** Substitui o snapshot inteiro numa transação lógica. */
export async function gravarTitulos(titulos: TituloRow[]): Promise<number> {
  if (titulos.length === 0) return 0;
  const s = sql();

  await s`
    CREATE TABLE IF NOT EXISTS titulo_publico (
      nome             text NOT NULL,
      indexador        text NOT NULL,
      vencimento       date NOT NULL,
      taxa_compra      numeric(12,8) NOT NULL,
      taxa_venda       numeric(12,8) NOT NULL,
      pu_compra        bigint NOT NULL,
      pu_venda         bigint NOT NULL,
      data_base        date NOT NULL,
      juros_semestrais boolean NOT NULL,
      PRIMARY KEY (nome, vencimento)
    )`;

  await s`DELETE FROM titulo_publico`;
  for (const t of titulos) {
    await s`
      INSERT INTO titulo_publico
        (nome, indexador, vencimento, taxa_compra, taxa_venda,
         pu_compra, pu_venda, data_base, juros_semestrais)
      VALUES
        (${t.nome}, ${t.indexador}, ${t.vencimento}, ${t.taxa_compra}, ${t.taxa_venda},
         ${t.pu_compra}, ${t.pu_venda}, ${t.data_base}, ${t.juros_semestrais})
      ON CONFLICT (nome, vencimento) DO UPDATE SET
        taxa_compra = EXCLUDED.taxa_compra,
        taxa_venda  = EXCLUDED.taxa_venda,
        pu_compra   = EXCLUDED.pu_compra,
        pu_venda    = EXCLUDED.pu_venda,
        data_base   = EXCLUDED.data_base
    `;
  }
  return titulos.length;
}
