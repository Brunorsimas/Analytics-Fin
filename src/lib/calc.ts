export const brl = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const pct = (v: number, casas = 2) =>
  `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

export type Fluxo = { data: string; valor: number };

const DIA = 86400000;
const anos = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365 * DIA);

function vpl(fluxos: Fluxo[], taxa: number) {
  const t0 = fluxos[0].data;
  return fluxos.reduce((s, f) => s + f.valor / Math.pow(1 + taxa, anos(t0, f.data)), 0);
}

/** XIRR por bissecção. Retorna taxa anual ou null se não houver troca de sinal. */
export function xirr(fluxos: Fluxo[]): number | null {
  if (fluxos.length < 2) return null;
  const f = [...fluxos].sort((a, b) => a.data.localeCompare(b.data));
  if (!f.some((x) => x.valor > 0) || !f.some((x) => x.valor < 0)) return null;

  let lo = -0.9999;
  let hi = 10;
  let vLo = vpl(f, lo);
  let vHi = vpl(f, hi);
  if (vLo * vHi > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = vpl(f, mid);
    if (Math.abs(v) < 1e-7) return mid;
    if (v * vLo < 0) {
      hi = mid;
      vHi = v;
    } else {
      lo = mid;
      vLo = v;
    }
  }
  void vHi;
  return (lo + hi) / 2;
}

/** TWR: encadeia retornos de subperíodos, isolando o efeito dos aportes. */
export function twr(periodos: Array<{ inicio: number; fim: number; fluxo: number }>): number {
  let acc = 1;
  for (const p of periodos) {
    const base = p.inicio + p.fluxo;
    if (base <= 0) continue;
    acc *= p.fim / base;
  }
  return acc - 1;
}

export const retornos = (serie: number[]) =>
  serie.slice(1).map((v, i) => (serie[i] === 0 ? 0 : v / serie[i] - 1));

export const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

/** Desvio padrão amostral (n-1). Com <2 pontos não há dispersão mensurável. */
export function desvio(v: number[]): number {
  if (v.length < 2) return 0;
  const m = media(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

export const volAnual = (mensais: number[]) => desvio(mensais) * Math.sqrt(12);

export function drawdownMax(serie: number[]): number {
  let pico = -Infinity;
  let pior = 0;
  for (const v of serie) {
    if (v > pico) pico = v;
    if (pico > 0) pior = Math.min(pior, v / pico - 1);
  }
  return pior;
}

export function sharpe(mensais: number[], livreRiscoAnual: number): number {
  const s = volAnual(mensais);
  if (s === 0) return 0;
  return ((1 + media(mensais)) ** 12 - 1 - livreRiscoAnual) / s;
}

export function beta(ativo: number[], mercado: number[]): number {
  const n = Math.min(ativo.length, mercado.length);
  if (n < 2) return 0;
  const a = ativo.slice(-n);
  const m = mercado.slice(-n);
  const ma = media(a);
  const mm = media(m);
  const varM = m.reduce((s, x) => s + (x - mm) ** 2, 0);
  if (varM === 0) return 0;
  return a.reduce((s, x, i) => s + (x - ma) * (m[i] - mm), 0) / varM;
}

export const anualizar = (retornoTotal: number, meses: number) =>
  meses <= 0 ? 0 : (1 + retornoTotal) ** (12 / meses) - 1;

/** Retorno real: desconta a inflação do retorno nominal (Fisher). */
export const real = (nominal: number, inflacao: number) => (1 + nominal) / (1 + inflacao) - 1;

export function mesesAte(dataAlvo: string, hoje = new Date()): number {
  const alvo = new Date(dataAlvo);
  return Math.max(
    0,
    (alvo.getFullYear() - hoje.getFullYear()) * 12 + (alvo.getMonth() - hoje.getMonth()),
  );
}

/** Valor futuro de um valor presente mais aportes mensais constantes. */
export function valorFuturo(pv: number, aporte: number, taxaMensal: number, meses: number): number {
  if (taxaMensal === 0) return pv + aporte * meses;
  const f = (1 + taxaMensal) ** meses;
  return pv * f + aporte * ((f - 1) / taxaMensal);
}

/** Aporte mensal necessário para atingir um alvo. */
export function aporteNecessario(
  alvo: number,
  pv: number,
  taxaMensal: number,
  meses: number,
): number {
  if (meses <= 0) return Math.max(0, alvo - pv);
  if (taxaMensal === 0) return Math.max(0, (alvo - pv) / meses);
  const f = (1 + taxaMensal) ** meses;
  return Math.max(0, (alvo - pv * f) / ((f - 1) / taxaMensal));
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

/** Monte Carlo com seed fixa: mesma entrada sempre produz a mesma projeção (auditável). */
export function monteCarlo(opts: {
  pv: number;
  aporte: number;
  retornoAnual: number;
  volAnual: number;
  meses: number;
  alvo?: number;
  caminhos?: number;
  seed?: number;
}) {
  const caminhos = opts.caminhos ?? 2000;
  const rnd = mulberry32(opts.seed ?? 42);
  const dm = opts.retornoAnual / 12;
  const vm = opts.volAnual / Math.sqrt(12);
  const finais: number[] = [];
  let sucesso = 0;

  for (let c = 0; c < caminhos; c++) {
    let v = opts.pv;
    for (let m = 0; m < opts.meses; m++) {
      const u = Math.max(rnd(), 1e-9);
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
      v = Math.max(0, v * (1 + dm + vm * z) + opts.aporte);
    }
    finais.push(v);
    if (opts.alvo !== undefined && v >= opts.alvo) sucesso++;
  }

  finais.sort((a, b) => a - b);
  const q = (p: number) => finais[Math.min(finais.length - 1, Math.floor(p * finais.length))];
  return {
    p10: Math.round(q(0.1)),
    p50: Math.round(q(0.5)),
    p90: Math.round(q(0.9)),
    probabilidade: opts.alvo === undefined ? null : sucesso / caminhos,
  };
}

/** Alíquota de IR da tabela regressiva de renda fixa. */
export function aliquotaRegressiva(dias: number): number {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

/** Bola de neve (menor saldo) vs avalanche (maior taxa). Avalanche minimiza juros pagos. */
export function ordenarDividas<T extends { saldo: number; taxa_mensal: number }>(
  dividas: T[],
  estrategia: "avalanche" | "bola_de_neve",
): T[] {
  return [...dividas].sort((a, b) =>
    estrategia === "avalanche" ? b.taxa_mensal - a.taxa_mensal : a.saldo - b.saldo,
  );
}

/** Custo de carregar a dívida até o fim do prazo, em juros. */
export function jurosTotais(saldo: number, taxaMensal: number, meses: number): number {
  return Math.round(saldo * ((1 + taxaMensal) ** meses - 1));
}
