/**
 * Curva de juros e marcação a mercado de títulos públicos.
 * Puro, sem I/O — roda no cliente e no servidor.
 *
 * Fonte dos vértices: Tesouro Transparente (taxa e PU diários de cada título).
 * A curva é construída por interpolação sobre os vencimentos negociados,
 * em vez da ETTJ da ANBIMA, que é paga.
 */

export type Indexador = "SELIC" | "PRE" | "IPCA" | "IGPM";

export type TituloPublico = {
  nome: string;
  indexador: Indexador;
  vencimento: string; // ISO (YYYY-MM-DD)
  /** Taxa anual de compra, em decimal (0.1444 = 14,44% a.a.). */
  taxaCompra: number;
  taxaVenda: number;
  /** Preço unitário de compra, em centavos. */
  puCompra: number;
  puVenda: number;
  dataBase: string;
  jurosSemestrais: boolean;
};

export type Vertice = { prazoAnos: number; taxa: number };

export type Curva = {
  /** Prefixada: juro nominal. */
  nominal: Vertice[];
  /** IPCA+: juro real. */
  real: Vertice[];
  dataBase: string;
};

const DIA_MS = 86_400_000;

/** Prazo até o vencimento a partir de uma data de referência explícita. */
export function prazoAteHoje(vencimento: string | undefined, hojeIso: string): number | undefined {
  if (!vencimento) return undefined;
  return prazoEmAnos(vencimento, hojeIso);
}

export function prazoEmAnos(vencimento: string, base: string): number {
  const v = Date.parse(vencimento);
  const b = Date.parse(base);
  if (!Number.isFinite(v) || !Number.isFinite(b)) return 0;
  return Math.max(0, (v - b) / (365.25 * DIA_MS));
}

/** Monta os vértices nominal e real a partir dos títulos negociados. */
export function montarCurva(titulos: TituloPublico[], dataBase: string): Curva {
  const agrupa = (idx: Indexador): Vertice[] => {
    const porPrazo = new Map<number, number[]>();
    for (const t of titulos) {
      if (t.indexador !== idx) continue;
      const prazo = prazoEmAnos(t.vencimento, dataBase);
      if (prazo <= 0 || !Number.isFinite(t.taxaCompra)) continue;
      // Arredonda para 0,25 ano: títulos com juros semestrais e principais
      // de mesmo vencimento devem cair no mesmo vértice.
      const chave = Math.round(prazo * 4) / 4;
      const lista = porPrazo.get(chave) ?? [];
      lista.push(t.taxaCompra);
      porPrazo.set(chave, lista);
    }
    return [...porPrazo]
      .map(([prazoAnos, taxas]) => ({
        prazoAnos,
        taxa: taxas.reduce((a, b) => a + b, 0) / taxas.length,
      }))
      .sort((a, b) => a.prazoAnos - b.prazoAnos);
  };

  return { nominal: agrupa("PRE"), real: agrupa("IPCA"), dataBase };
}

/**
 * Taxa para um prazo qualquer, por interpolação linear entre vértices.
 * Fora da faixa, mantém a taxa do vértice mais próximo (flat extrapolation) —
 * extrapolar curva de juros produz valor sem significado econômico.
 */
export function taxaParaPrazo(vertices: Vertice[], prazoAnos: number): number | null {
  if (vertices.length === 0 || !Number.isFinite(prazoAnos) || prazoAnos < 0) return null;
  if (vertices.length === 1) return vertices[0].taxa;

  const primeiro = vertices[0];
  const ultimo = vertices[vertices.length - 1];
  if (prazoAnos <= primeiro.prazoAnos) return primeiro.taxa;
  if (prazoAnos >= ultimo.prazoAnos) return ultimo.taxa;

  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    if (prazoAnos >= a.prazoAnos && prazoAnos <= b.prazoAnos) {
      const span = b.prazoAnos - a.prazoAnos;
      if (span === 0) return a.taxa;
      const peso = (prazoAnos - a.prazoAnos) / span;
      return a.taxa + (b.taxa - a.taxa) * peso;
    }
  }
  return ultimo.taxa;
}

/**
 * Inflação implícita (breakeven): o quanto o mercado precifica de IPCA
 * para que prefixado e IPCA+ rendam o mesmo no mesmo prazo.
 */
export function inflacaoImplicita(curva: Curva, prazoAnos: number): number | null {
  const nominal = taxaParaPrazo(curva.nominal, prazoAnos);
  const real = taxaParaPrazo(curva.real, prazoAnos);
  if (nominal === null || real === null) return null;
  return (1 + nominal) / (1 + real) - 1;
}

/**
 * Preço de um título zero-cupom descontado pela taxa de mercado.
 * Valor de face de R$ 1.000 para prefixado; para IPCA+ o PU já vem
 * corrigido pelo índice, então o desconto incide sobre o valor nominal atual.
 */
export function precoZeroCupom(
  valorFace: number,
  taxaAnual: number,
  prazoAnos: number,
): number {
  if (prazoAnos <= 0) return valorFace;
  return valorFace / (1 + taxaAnual) ** prazoAnos;
}

export type Marcacao = {
  /** Valor pelo qual você compraria hoje, em centavos. */
  valorMercado: number;
  /** Valor pago na compra, em centavos. */
  valorInvestido: number;
  resultado: number;
  retornoPct: number;
  /** Quanto renderia se carregasse até o vencimento, pela taxa contratada. */
  valorNoVencimento: number;
  taxaContratada: number;
  taxaMercadoHoje: number;
  prazoRestanteAnos: number;
  /** Sensibilidade do preço a uma variação de 1 p.p. na taxa. */
  duration: number;
  /** Variação de preço se a taxa subir 1 p.p. */
  impacto1pp: number;
};

/**
 * Marca a posição a mercado: compara o que você contratou com a taxa de hoje.
 *
 * Taxa de mercado acima da contratada derruba o preço (você travou um juro
 * menor); abaixo, valoriza. É por isso que vender antes do vencimento pode
 * dar resultado diferente do contratado.
 */
export function marcarAMercado(opts: {
  quantidade: number;
  /** PU pago na compra, em reais. */
  precoCompra: number;
  /** PU de mercado hoje, em reais. */
  precoMercado: number;
  taxaContratada: number;
  taxaMercadoHoje: number;
  prazoRestanteAnos: number;
}): Marcacao {
  const q = opts.quantidade;
  const valorMercado = Math.round(q * opts.precoMercado * 100);
  const valorInvestido = Math.round(q * opts.precoCompra * 100);
  const resultado = valorMercado - valorInvestido;

  // Duration de Macaulay para zero-cupom é o próprio prazo;
  // a modificada desconta pela taxa.
  const duration = opts.prazoRestanteAnos / (1 + opts.taxaMercadoHoje);
  const impacto1pp = Math.round(valorMercado * -duration * 0.01);

  const valorNoVencimento = Math.round(
    valorInvestido * (1 + opts.taxaContratada) ** opts.prazoRestanteAnos,
  );

  return {
    valorMercado,
    valorInvestido,
    resultado,
    retornoPct: valorInvestido > 0 ? resultado / valorInvestido : 0,
    valorNoVencimento,
    taxaContratada: opts.taxaContratada,
    taxaMercadoHoje: opts.taxaMercadoHoje,
    prazoRestanteAnos: opts.prazoRestanteAnos,
    duration,
    impacto1pp,
  };
}

/** Classifica o tipo do título a partir do nome do Tesouro Transparente. */
export function indexadorDe(nome: string): Indexador | null {
  const n = nome.toLowerCase();
  if (n.includes("selic")) return "SELIC";
  if (n.includes("igpm") || n.includes("igp-m")) return "IGPM";
  if (n.includes("ipca") || n.includes("renda+") || n.includes("educa+")) return "IPCA";
  if (n.includes("prefixado")) return "PRE";
  return null;
}

const nBr = (v: number, casas = 1) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

const pctBr = (v: number) =>
  `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const reaisBr = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Explica em texto o que a marcação significa.
 * Determinístico: o texto é montado dos números, nunca gerado por modelo.
 *
 * Em IPCA+ o preço se move por dois motivos — correção pela inflação e
 * mudança da taxa. O texto trata o efeito da taxa separado do resultado
 * total, para não parecer contradizer um resultado positivo.
 */
export function explicarMarcacao(m: Marcacao, indexador: Indexador): string[] {
  const out: string[] = [];

  if (indexador === "SELIC") {
    out.push(
      "Tesouro Selic acompanha a taxa básica e praticamente não oscila. Vender antes do vencimento costuma não gerar perda relevante.",
    );
    return out;
  }

  const diff = m.taxaMercadoHoje - m.taxaContratada;
  const corrigido = indexador === "IPCA" || indexador === "IGPM";

  if (Math.abs(diff) < 0.0005) {
    out.push(
      `A taxa de mercado hoje (${pctBr(m.taxaMercadoHoje)}) está praticamente igual à que você contratou (${pctBr(m.taxaContratada)}).`,
    );
  } else if (diff > 0) {
    out.push(
      `Você contratou ${pctBr(m.taxaContratada)} e o mercado paga ${pctBr(m.taxaMercadoHoje)} hoje. A alta da taxa empurra o preço para baixo${
        corrigido ? ", efeito que convive com a correção pela inflação acumulada" : ""
      }.`,
    );
  } else {
    out.push(
      `Você contratou ${pctBr(m.taxaContratada)} e o mercado paga ${pctBr(m.taxaMercadoHoje)} hoje. A queda da taxa empurra o preço para cima${
        corrigido ? ", somando-se à correção pela inflação acumulada" : ""
      }.`,
    );
  }

  if (corrigido) {
    out.push(
      `O resultado de ${reaisBr(m.resultado)} junta os dois efeitos: a inflação já corrigida no período e a variação da taxa.`,
    );
  }

  out.push(
    `Levando até o vencimento, em ${nBr(m.prazoRestanteAnos)} ano(s), vale a taxa que você contratou — a oscilação do meio do caminho não muda o resultado final.`,
  );

  if (m.duration > 1) {
    out.push(
      `Duration de ${nBr(m.duration)}: se a taxa de mercado subir 1 ponto percentual, o preço cai cerca de ${reaisBr(Math.abs(m.impacto1pp))}. Prazo maior significa oscilação maior.`,
    );
  }

  return out;
}
