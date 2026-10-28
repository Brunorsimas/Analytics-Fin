/**
 * Cotações em tempo real. Roda SOMENTE no servidor (rota /api/cotacao).
 *
 * Fontes:
 *  - Yahoo Finance: ações, FIIs, ETFs e BDRs da B3 (sufixo .SA)
 *  - Banco Central (SGS): Selic, CDI e IPCA — fonte oficial
 *
 * Nenhum dado do usuário trafega para cá: a rota recebe apenas um ticker.
 */

import { classificarTicker, normalizarTicker, type Classe } from "./ticker";

export { classificarTicker, normalizarTicker };
export type { Classe };

export type Cotacao = {
  ticker: string;
  nome: string;
  preco: number;
  moeda: string;
  variacaoPct: number | null;
  fechamentoAnterior: number | null;
  minimo52s: number | null;
  maximo52s: number | null;
  atualizadoEm: string;
  fonte: string;
  classe: Classe;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const TIMEOUT_MS = 8000;
const TTL_MS = 60_000;
/** Ausência tem TTL curto: falha transitória não pode virar 404 por um minuto. */
const TTL_AUSENTE_MS = 5_000;
const TENTATIVAS = 2;

const cache = new Map<string, { em: number; valor: Cotacao | null }>();

function refinarClasse(ticker: string, nome: string): Classe {
  const base = classificarTicker(ticker);
  if (base !== "fii") return base;
  const n = nome.toLowerCase();
  if (/\b(index|índice|indice|ishares|etf|s&p|ibovespa|msci)\b/.test(n)) return "etf";
  if (/\b(imobili|fii|fundo de investimento imobili)\b/.test(n)) return "fii";
  return "fii";
}

async function buscarComTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

type YahooMeta = {
  symbol?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  currency?: string;
  chartPreviousClose?: number;
  previousClose?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  regularMarketTime?: number;
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Busca a cotação de um ticker da B3. Devolve null se não existir. */
export async function cotar(brutoTicker: string): Promise<Cotacao | null> {
  const ticker = normalizarTicker(brutoTicker);
  if (!ticker) return null;

  const emCache = cache.get(ticker);
  if (emCache) {
    const ttl = emCache.valor ? TTL_MS : TTL_AUSENTE_MS;
    if (Date.now() - emCache.em < ttl) return emCache.valor;
  }

  let resultado: Cotacao | null = null;
  // Nova tentativa em falha de rede ou 5xx: o Yahoo oscila sob rajada.
  for (let tentativa = 0; tentativa < TENTATIVAS && resultado === null; tentativa++) {
    if (tentativa > 0) await new Promise((r) => setTimeout(r, 400));
    try {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}.SA?interval=1d&range=5d`;
      const resp = await buscarComTimeout(url);
      // 404 é resposta definitiva: o ticker não existe, não adianta repetir.
      if (resp.status === 404) break;
      if (!resp.ok) continue;

      const json = (await resp.json()) as {
        chart?: { result?: Array<{ meta?: YahooMeta }> };
      };
      const meta = json.chart?.result?.[0]?.meta;
      const preco = num(meta?.regularMarketPrice);
      if (!meta || preco === null || preco <= 0) continue;

      const anterior = num(meta.chartPreviousClose) ?? num(meta.previousClose);
      const nome = meta.longName || meta.shortName || ticker;
      resultado = {
        ticker,
        nome,
        preco,
        moeda: meta.currency ?? "BRL",
        variacaoPct:
          anterior !== null && anterior > 0 ? ((preco - anterior) / anterior) * 100 : null,
        fechamentoAnterior: anterior,
        minimo52s: num(meta.fiftyTwoWeekLow),
        maximo52s: num(meta.fiftyTwoWeekHigh),
        atualizadoEm: meta.regularMarketTime
          ? new Date(meta.regularMarketTime * 1000).toISOString()
          : new Date().toISOString(),
        fonte: "Yahoo Finance",
        classe: refinarClasse(ticker, nome),
      };
    } catch {
      // timeout ou rede: tenta de novo
    }
  }

  cache.set(ticker, { em: Date.now(), valor: resultado });
  return resultado;
}

export type IndicadoresVivos = {
  selicAnual: number;
  cdiAnual: number;
  ipcaAnual: number;
  atualizadoEm: string;
  fonte: string;
  aoVivo: boolean;
};

/** Fallback usado quando o Banco Central não responde. */
const INDICADORES_FALLBACK: IndicadoresVivos = {
  selicAnual: 0.1475,
  cdiAnual: 0.1465,
  ipcaAnual: 0.0462,
  atualizadoEm: "",
  fonte: "valor de referência (BCB indisponível)",
  aoVivo: false,
};

let cacheIndicadores: { em: number; valor: IndicadoresVivos } | null = null;
const TTL_INDICADORES = 6 * 60 * 60 * 1000;

async function serieBcb(codigo: number): Promise<number | null> {
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/1?formato=json`;
    const resp = await buscarComTimeout(url);
    if (!resp.ok) return null;
    const json = (await resp.json()) as Array<{ valor?: string }>;
    const bruto = json?.[0]?.valor;
    if (typeof bruto !== "string") return null;
    const n = Number(bruto.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Selic, CDI e IPCA direto do Banco Central. */
export async function indicadoresAoVivo(): Promise<IndicadoresVivos> {
  if (cacheIndicadores && Date.now() - cacheIndicadores.em < TTL_INDICADORES) {
    return cacheIndicadores.valor;
  }

  // 432 = Selic meta % a.a. | 4389 = CDI anualizado % a.a. | 13522 = IPCA 12m
  // A 4389 já vem anualizada pelo próprio BCB; elevar a diária a 252
  // introduzia erro de arredondamento desnecessário.
  const [selic, cdiAno, ipca] = await Promise.all([
    serieBcb(432),
    serieBcb(4389),
    serieBcb(13522),
  ]);

  if (selic === null) {
    cacheIndicadores = { em: Date.now(), valor: INDICADORES_FALLBACK };
    return INDICADORES_FALLBACK;
  }

  const selicAnual = selic / 100;
  const cdiAnual = cdiAno !== null && cdiAno > 0 ? cdiAno / 100 : Math.max(0, selicAnual - 0.001);

  const valor: IndicadoresVivos = {
    selicAnual,
    cdiAnual,
    ipcaAnual: ipca !== null ? ipca / 100 : INDICADORES_FALLBACK.ipcaAnual,
    atualizadoEm: new Date().toISOString(),
    fonte: "Banco Central (SGS)",
    aoVivo: true,
  };
  cacheIndicadores = { em: Date.now(), valor };
  return valor;
}
