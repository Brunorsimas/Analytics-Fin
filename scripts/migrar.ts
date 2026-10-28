/**
 * Cria o schema de referência no Neon e popula com dados de mercado + perfis demo.
 * Idempotente: pode rodar quantas vezes quiser.
 *
 * Uso: node .selfcheck/scripts/migrar.js
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

function carregarEnv() {
  for (const arquivo of [".env.local", ".env"]) {
    try {
      const txt = readFileSync(join(process.cwd(), arquivo), "utf8");
      for (const linha of txt.split("\n")) {
        const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const valor = m[2].replace(/^["']|["']$/g, "");
        if (!process.env[m[1]]) process.env[m[1]] = valor;
      }
    } catch {
      /* arquivo ausente, segue */
    }
  }
}
carregarEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ausente. Rode `neon link` antes.");
  process.exit(1);
}
const sql = neon(url);

const MESES = 24;

function mesIso(offset: number) {
  const base = new Date(Date.UTC(2026, 9, 1));
  base.setUTCMonth(base.getUTCMonth() - (MESES - 1 - offset));
  return base.toISOString().slice(0, 10);
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rnd: () => number) {
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

function serie(seed: number, inicio: number, driftAno: number, volAno: number) {
  const rnd = mulberry32(seed);
  const dm = driftAno / 12;
  const vm = volAno / Math.sqrt(12);
  const out: number[] = [inicio];
  for (let i = 1; i < MESES; i++) {
    out.push(Math.max(0.01, out[i - 1] * (1 + dm + vm * gauss(rnd))));
  }
  return out.map((v) => Math.round(v * 100) / 100);
}

const ATIVOS: Array<
  [string, string, string, string, number, boolean, string, string, number, string, number, number, number]
> = [
  ["TESOUROSELIC2029", "Tesouro Selic 2029", "rf_pos", "SELIC", 1, false, "Tesouro Nacional", "governo", 16.42, "tabela_regressiva", 11, 0.145, 0.004],
  ["CDB120CDI", "CDB Banco Alfa 120% CDI", "rf_pos", "CDI", 1, true, "Banco Alfa", "financeiro", 1.3421, "tabela_regressiva", 12, 0.168, 0.003],
  ["TESOUROIPCA2035", "Tesouro IPCA+ 2035", "rf_ipca", "IPCA", 1, false, "Tesouro Nacional", "governo", 3421.77, "tabela_regressiva", 13, 0.125, 0.09],
  ["LCA2027", "LCA Banco Beta 97% CDI", "rf_pos", "CDI", 720, true, "Banco Beta", "financeiro", 1.1908, "isento", 14, 0.139, 0.003],
  ["CDBPRE2028", "CDB Prefixado Banco Gama", "rf_pre", "PRE", 365, true, "Banco Gama", "financeiro", 1.221, "tabela_regressiva", 15, 0.132, 0.02],
  ["PETR4", "Petrobras PN", "acao", "nenhum", 2, false, "Petrobras", "petroleo", 38.91, "15pct", 21, 0.11, 0.33],
  ["ITUB4", "Itaú Unibanco PN", "acao", "nenhum", 2, false, "Itaú", "financeiro", 36.54, "15pct", 22, 0.14, 0.24],
  ["WEGE3", "WEG ON", "acao", "nenhum", 2, false, "WEG", "industrial", 52.18, "15pct", 23, 0.09, 0.28],
  ["MXRF11", "Maxi Renda FII", "fii", "nenhum", 2, false, "XP", "papel", 10.12, "isento", 31, 0.07, 0.14],
  ["HGLG11", "CSHG Logística FII", "fii", "nenhum", 2, false, "CSHG", "logistica", 161.4, "isento", 32, 0.08, 0.16],
  ["IVVB11", "iShares S&P 500 BDR", "exterior", "nenhum", 2, false, "BlackRock", "global", 398.6, "15pct", 41, 0.16, 0.21],
];

const PERFIS = [
  {
    slug: "ana",
    nome: "Ana",
    descricao: "Bloqueada no gate 2 — cartão a 11,89% a.m. e reserva incompleta",
    payload: {
      nome: "Ana",
      dependentes: 1,
      estabilidade_renda: "clt",
      declaracao_ir: "simplificada",
      data_nascimento: "1992-04-18",
      situacao: {
        renda_mensal: 980000,
        despesa_mensal: 870000,
        custo_essencial: 640000,
        capacidade_aporte: 110000,
        reserva_atual: 450000,
        possui_seguro_vida: 0,
        possui_plano_saude: 1,
      },
      dividas: [
        { id: 1, tipo: "cartao", saldo: 1180000, taxa_mensal: 0.1189, parcela: 180000, parcelas_restantes: 8 },
        { id: 2, tipo: "financiamento_veiculo", saldo: 2600000, taxa_mensal: 0.0192, parcela: 142000, parcelas_restantes: 22 },
      ],
      objetivos: [
        { id: 1, nome: "Reserva de emergência", tipo: "reserva_emergencia", valor_alvo: 1920000, data_alvo: "2027-12-31", valor_atual: 450000, aporte_mensal: 60000, prioridade: 1, flexivel: 0, status: "ativo" },
        { id: 2, nome: "Entrada do apartamento", tipo: "imovel", valor_alvo: 9000000, data_alvo: "2031-06-30", valor_atual: 0, aporte_mensal: 50000, prioridade: 3, flexivel: 1, status: "ativo" },
      ],
      perfil: {
        classificacao: "moderado",
        score: 54,
        tolerancia_perda_pct: 12,
        horizonte_meses: 60,
        restricoes: '["sem_cripto"]',
        data_aplicacao: "2026-03-10",
      },
      posicoes: [],
    },
  },
  {
    slug: "bruno",
    nome: "Bruno",
    descricao: "Gates aprovados — carteira ativa, rebalanceamento e PGBL",
    payload: {
      nome: "Bruno",
      dependentes: 2,
      estabilidade_renda: "clt",
      declaracao_ir: "completa",
      data_nascimento: "1986-11-02",
      situacao: {
        renda_mensal: 2240000,
        despesa_mensal: 1410000,
        custo_essencial: 980000,
        capacidade_aporte: 620000,
        reserva_atual: 6200000,
        possui_seguro_vida: 1,
        possui_plano_saude: 1,
      },
      dividas: [
        { id: 1, tipo: "financiamento_imovel", saldo: 31000000, taxa_mensal: 0.0071, parcela: 268000, parcelas_restantes: 196 },
      ],
      objetivos: [
        { id: 1, nome: "Reserva de emergência", tipo: "reserva_emergencia", valor_alvo: 2940000, data_alvo: "2026-12-31", valor_atual: 6200000, aporte_mensal: 0, prioridade: 1, flexivel: 0, status: "atingido" },
        { id: 2, nome: "Aposentadoria", tipo: "aposentadoria", valor_alvo: 280000000, data_alvo: "2046-11-02", valor_atual: 18500000, aporte_mensal: 400000, prioridade: 2, flexivel: 0, status: "ativo" },
        { id: 3, nome: "Faculdade dos filhos", tipo: "educacao", valor_alvo: 42000000, data_alvo: "2034-02-01", valor_atual: 2100000, aporte_mensal: 120000, prioridade: 2, flexivel: 0, status: "ativo" },
        { id: 4, nome: "Troca de carro", tipo: "veiculo", valor_alvo: 12000000, data_alvo: "2028-03-01", valor_atual: 1500000, aporte_mensal: 100000, prioridade: 4, flexivel: 1, status: "ativo" },
      ],
      perfil: {
        classificacao: "arrojado",
        score: 78,
        tolerancia_perda_pct: 25,
        horizonte_meses: 240,
        restricoes: '["sem_derivativos"]',
        data_aplicacao: "2025-09-22",
      },
      posicoes: [
        { ticker: "PETR4", nome: "Petróleo Brasileiro S.A. - Petrobras", valor: 1583700, quantidade: 300, precoMedio: 34.2, classe: "acao" },
        { ticker: "ITUB4", nome: "Itaú Unibanco Holding S.A.", valor: 1647600, quantidade: 400, precoMedio: 29.8, classe: "acao" },
        { ticker: "WEGE3", nome: "WEG S.A.", valor: 830880, quantidade: 180, precoMedio: 48.6, classe: "acao" },
        { ticker: "MXRF11", nome: "Maxi Renda FII", valor: 1262800, quantidade: 1400, precoMedio: 9.88, classe: "fii" },
        { ticker: "HGLG11", nome: "CSHG Logística FII", valor: 898320, quantidade: 60, precoMedio: 152.3, classe: "fii" },
        { ticker: "IVVB11", nome: "iShares S&P 500 FIC", valor: 3263120, quantidade: 70, precoMedio: 331.2, classe: "etf" },
      ],
    },
  },
];

async function main() {
  console.log("criando schema...");
  await sql`DROP TABLE IF EXISTS cotacao, indicador, ativo, perfil_demo CASCADE`;

  await sql`
    CREATE TABLE ativo (
      id            serial PRIMARY KEY,
      ticker        text NOT NULL UNIQUE,
      nome          text NOT NULL,
      classe        text NOT NULL,
      indexador     text NOT NULL,
      liquidez_dias integer NOT NULL,
      fgc           boolean NOT NULL DEFAULT false,
      emissor       text NOT NULL,
      setor         text NOT NULL,
      preco_atual   numeric(18,6) NOT NULL,
      tributacao    text NOT NULL
    )`;

  await sql`
    CREATE TABLE cotacao (
      ativo_id   integer NOT NULL REFERENCES ativo(id) ON DELETE CASCADE,
      data       date NOT NULL,
      fechamento numeric(18,6) NOT NULL,
      PRIMARY KEY (ativo_id, data)
    )`;

  await sql`
    CREATE TABLE indicador (
      codigo text NOT NULL,
      data   date NOT NULL,
      valor  numeric(18,8) NOT NULL,
      PRIMARY KEY (codigo, data)
    )`;

  await sql`
    CREATE TABLE perfil_demo (
      slug      text PRIMARY KEY,
      nome      text NOT NULL,
      descricao text NOT NULL,
      payload   jsonb NOT NULL
    )`;

  console.log("inserindo ativos e cotações...");
  for (const a of ATIVOS) {
    const [tk, nome, classe, idx, liq, fgc, emissor, setor, , trib, sd, drift, vol] = a;
    const precoBase = a[8];
    const s = serie(sd, precoBase, drift, vol);
    const atual = s[MESES - 1];
    const linhas = (await sql`
      INSERT INTO ativo (ticker, nome, classe, indexador, liquidez_dias, fgc, emissor, setor, preco_atual, tributacao)
      VALUES (${tk}, ${nome}, ${classe}, ${idx}, ${liq}, ${fgc}, ${emissor}, ${setor}, ${atual}, ${trib})
      RETURNING id
    `) as Array<{ id: number }>;
    const id = linhas[0].id;
    for (let i = 0; i < MESES; i++) {
      await sql`INSERT INTO cotacao (ativo_id, data, fechamento) VALUES (${id}, ${mesIso(i)}, ${s[i]})`;
    }
  }

  console.log("inserindo indicadores...");
  const ibov = serie(99, 128400, 0.1, 0.19);
  const rndCdi = mulberry32(7);
  const rndIpca = mulberry32(8);
  for (let i = 0; i < MESES; i++) {
    const d = mesIso(i);
    await sql`INSERT INTO indicador (codigo, data, valor) VALUES ('IBOV', ${d}, ${ibov[i]})`;
    await sql`INSERT INTO indicador (codigo, data, valor) VALUES ('CDI_MENSAL', ${d}, ${Math.round((0.0105 + rndCdi() * 0.0018) * 1e8) / 1e8})`;
    await sql`INSERT INTO indicador (codigo, data, valor) VALUES ('IPCA_MENSAL', ${d}, ${Math.round((0.0028 + rndIpca() * 0.0035) * 1e8) / 1e8})`;
  }
  const hoje = mesIso(MESES - 1);
  await sql`INSERT INTO indicador (codigo, data, valor) VALUES ('SELIC_ANUAL', ${hoje}, 0.1475)`;
  await sql`INSERT INTO indicador (codigo, data, valor) VALUES ('CDI_ANUAL', ${hoje}, 0.1465)`;
  await sql`INSERT INTO indicador (codigo, data, valor) VALUES ('IPCA_ANUAL', ${hoje}, 0.0462)`;

  console.log("inserindo perfis demo...");
  for (const p of PERFIS) {
    await sql`
      INSERT INTO perfil_demo (slug, nome, descricao, payload)
      VALUES (${p.slug}, ${p.nome}, ${p.descricao}, ${JSON.stringify(p.payload)}::jsonb)
    `;
  }

  const [{ count: nAtivos }] = (await sql`SELECT COUNT(*)::int AS count FROM ativo`) as Array<{ count: number }>;
  const [{ count: nCot }] = (await sql`SELECT COUNT(*)::int AS count FROM cotacao`) as Array<{ count: number }>;
  const [{ count: nInd }] = (await sql`SELECT COUNT(*)::int AS count FROM indicador`) as Array<{ count: number }>;
  const [{ count: nPer }] = (await sql`SELECT COUNT(*)::int AS count FROM perfil_demo`) as Array<{ count: number }>;

  console.log(`\nok: ${nAtivos} ativos, ${nCot} cotações, ${nInd} indicadores, ${nPer} perfis demo`);
}

main().catch((e) => {
  console.error("falhou:", e.message);
  process.exit(1);
});
