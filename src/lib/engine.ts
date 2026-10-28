import { aporteNecessario, jurosTotais, mesesAte, ordenarDividas, valorFuturo } from "./calc";

export const ALGORITMO_VERSAO = "motor-2026.1";

/** Teto de cobertura do FGC por emissor, em centavos: R$ 250.000,00. */
export const TETO_FGC = 250_000_00;

export type Classe = "rf_pos" | "rf_ipca" | "rf_pre" | "acao" | "fii" | "exterior";

export const CLASSE_LABEL: Record<Classe, string> = {
  rf_pos: "Renda fixa pós-fixada",
  rf_ipca: "Renda fixa IPCA+",
  rf_pre: "Renda fixa prefixada",
  acao: "Ações",
  fii: "Fundos imobiliários",
  exterior: "Exterior",
};

export type Usuario = {
  id: number;
  nome: string;
  dependentes: number;
  estabilidade_renda: string;
  declaracao_ir: string;
};

export type Situacao = {
  renda_mensal: number;
  despesa_mensal: number;
  custo_essencial: number;
  capacidade_aporte: number;
  reserva_atual: number;
  possui_seguro_vida: number;
  possui_plano_saude: number;
};

export type Divida = {
  id: number;
  tipo: string;
  saldo: number;
  taxa_mensal: number;
  parcela: number;
  parcelas_restantes: number;
};

export type Objetivo = {
  id: number;
  nome: string;
  tipo: string;
  valor_alvo: number;
  data_alvo: string;
  valor_atual: number;
  aporte_mensal: number;
  prioridade: number;
  flexivel: number;
  status: string;
};

export type Perfil = {
  classificacao: "conservador" | "moderado" | "arrojado";
  score: number;
  tolerancia_perda_pct: number;
  horizonte_meses: number;
  restricoes: string;
  data_aplicacao: string;
};

export type Fator = {
  fator: string;
  dado: string;
  peso: "alto" | "medio" | "baixo";
  direcao: "favor" | "contra" | "neutro";
};

export type Recomendacao = {
  chave: string;
  tipo: "gate" | "alocacao" | "rebalanceamento" | "alerta" | "objetivo" | "fiscal";
  prioridade: number;
  titulo: string;
  acao: string;
  valor?: number;
  justificativa: Fator[];
  riscos: string[];
  alternativas: string[];
  seNaoSeguir: string;
  bloqueante: boolean;
};

export type Gate = {
  n: number;
  nome: string;
  aprovado: boolean;
  bloqueante: boolean;
  detalhe: string;
};

/** Validade do suitability: 24 meses (Resolução CVM 30). */
export function validadeSuitability(dataAplicacao: string, agora = new Date()) {
  const validade = new Date(dataAplicacao);
  validade.setFullYear(validade.getFullYear() + 2);
  return { validade, vigente: validade.getTime() > agora.getTime() };
}

/** RN03: meses de custo essencial exigidos em reserva, por estabilidade de renda. */
export function mesesReservaExigidos(u: Usuario): number {
  const base =
    u.estabilidade_renda === "clt"
      ? 3
      : u.estabilidade_renda === "aposentado"
        ? 3
        : u.estabilidade_renda === "variavel" || u.estabilidade_renda === "autonomo"
          ? 6
          : 12;
  return u.dependentes > 0 && base < 12 ? base + 3 : base;
}

/** Meta de retorno líquido realista da carteira — régua do RN01. */
export function metaRetornoMensal(perfil: Perfil, cdiAnual: number): number {
  const premio = { conservador: 1.0, moderado: 1.15, arrojado: 1.35 }[perfil.classificacao];
  return (1 + cdiAnual * premio) ** (1 / 12) - 1;
}

/** Camada 1 — gates de saúde financeira, ordem fixa e bloqueante. */
export function avaliarGates(
  u: Usuario,
  s: Situacao,
  dividas: Divida[],
  perfil: Perfil,
  cdiAnual: number,
): { gates: Gate[]; liberado: boolean; primeiroAberto: Gate | null } {
  const sobra = s.renda_mensal - s.despesa_mensal;
  const metaMensal = metaRetornoMensal(perfil, cdiAnual);
  const caras = dividas.filter((d) => d.taxa_mensal > metaMensal);
  const mesesExig = mesesReservaExigidos(u);
  const reservaAlvo = s.custo_essencial * mesesExig;
  const suitabilityValido = validadeSuitability(perfil.data_aplicacao).vigente;

  const gates: Gate[] = [
    {
      n: 1,
      nome: "Fluxo de caixa positivo",
      aprovado: sobra > 0,
      bloqueante: true,
      detalhe:
        sobra > 0
          ? `Sobram ${(sobra / 100).toFixed(2)} por mês`
          : `Déficit de ${Math.abs(sobra / 100).toFixed(2)} por mês`,
    },
    {
      n: 2,
      nome: "Sem dívida cara",
      aprovado: caras.length === 0,
      bloqueante: true,
      detalhe:
        caras.length === 0
          ? "Nenhuma dívida acima da meta de retorno"
          : `${caras.length} dívida(s) acima da meta de ${(metaMensal * 100).toFixed(2)}% a.m.`,
    },
    {
      n: 3,
      nome: "Reserva de emergência",
      aprovado: s.reserva_atual >= reservaAlvo,
      bloqueante: true,
      detalhe: `${(s.reserva_atual / Math.max(1, s.custo_essencial)).toFixed(1)} de ${mesesExig} meses de custo essencial`,
    },
    {
      n: 4,
      nome: "Proteção (seguro e saúde)",
      aprovado: (u.dependentes === 0 || s.possui_seguro_vida === 1) && s.possui_plano_saude === 1,
      bloqueante: false,
      detalhe:
        u.dependentes > 0 && s.possui_seguro_vida === 0
          ? `${u.dependentes} dependente(s) sem seguro de vida`
          : "Proteção adequada",
    },
    {
      n: 5,
      nome: "Suitability vigente",
      aprovado: suitabilityValido,
      bloqueante: true,
      detalhe: suitabilityValido
        ? `Aplicado em ${perfil.data_aplicacao}, válido`
        : "Questionário vencido (mais de 24 meses)",
    },
  ];

  const primeiroAberto = gates.find((g) => g.bloqueante && !g.aprovado) ?? null;
  return { gates, liberado: primeiroAberto === null, primeiroAberto };
}

type Faixa = { min: number; alvo: number; max: number };

const MATRIZ: Record<Perfil["classificacao"], Record<Classe, number>> = {
  conservador: { rf_pos: 60, rf_ipca: 25, rf_pre: 10, acao: 5, fii: 0, exterior: 0 },
  moderado: { rf_pos: 35, rf_ipca: 20, rf_pre: 5, acao: 20, fii: 10, exterior: 10 },
  arrojado: { rf_pos: 15, rf_ipca: 15, rf_pre: 5, acao: 35, fii: 12, exterior: 18 },
};

/** RN04: horizonte curto elimina renda variável — o ativo não tem tempo de se recuperar. */
function ajustarPorHorizonte(base: Record<Classe, number>, meses: number) {
  const out = { ...base };
  const risco: Classe[] = ["acao", "fii", "exterior"];
  let corte = 0;
  if (meses < 24) corte = 1;
  else if (meses < 60) corte = 0.5;
  else if (meses < 120) corte = 0.2;
  if (corte === 0) return out;
  let realocado = 0;
  for (const c of risco) {
    const reduz = out[c] * corte;
    out[c] -= reduz;
    realocado += reduz;
  }
  out.rf_pos += realocado;
  return out;
}

/** Tolerância a perda declarada limita renda variável: queda estimada ≈ 45% da parcela de risco. */
function ajustarPorTolerancia(base: Record<Classe, number>, toleranciaPct: number) {
  const out = { ...base };
  const risco: Classe[] = ["acao", "fii", "exterior"];
  const totalRisco = risco.reduce((s, c) => s + out[c], 0);
  const quedaEstimada = totalRisco * 0.45;
  if (quedaEstimada <= toleranciaPct || totalRisco === 0) return out;
  const fator = (toleranciaPct / 0.45) / totalRisco;
  let realocado = 0;
  for (const c of risco) {
    const novo = out[c] * fator;
    realocado += out[c] - novo;
    out[c] = novo;
  }
  out.rf_pos += realocado;
  return out;
}

function aplicarRestricoes(base: Record<Classe, number>, restricoes: string[]) {
  const out = { ...base };
  let realocado = 0;
  if (restricoes.includes("sem_exterior")) {
    realocado += out.exterior;
    out.exterior = 0;
  }
  if (restricoes.includes("sem_fii")) {
    realocado += out.fii;
    out.fii = 0;
  }
  if (restricoes.includes("sem_acoes")) {
    realocado += out.acao;
    out.acao = 0;
  }
  out.rf_pos += realocado;
  return out;
}

/** Camada 2 — alocação estratégica por classe, com faixas de tolerância. */
export function alocacaoAlvo(
  perfil: Perfil,
  horizonteMeses: number,
  selicAnual: number,
): { faixas: Record<Classe, Faixa>; notas: string[] } {
  const notas: string[] = [];
  let base = { ...MATRIZ[perfil.classificacao] };

  const comHorizonte = ajustarPorHorizonte(base, horizonteMeses);
  if (JSON.stringify(comHorizonte) !== JSON.stringify(base)) {
    notas.push(
      `Horizonte de ${horizonteMeses} meses reduziu a parcela de renda variável (RN04).`,
    );
  }
  base = comHorizonte;

  const comTolerancia = ajustarPorTolerancia(base, perfil.tolerancia_perda_pct);
  if (JSON.stringify(comTolerancia) !== JSON.stringify(base)) {
    notas.push(
      `Tolerância declarada de ${perfil.tolerancia_perda_pct}% de queda limitou a exposição a risco.`,
    );
  }
  base = comTolerancia;

  let restricoes: string[] = [];
  try {
    restricoes = JSON.parse(perfil.restricoes) as string[];
  } catch {
    restricoes = [];
  }
  const comRestricoes = aplicarRestricoes(base, restricoes);
  if (JSON.stringify(comRestricoes) !== JSON.stringify(base)) {
    notas.push(`Restrições do usuário aplicadas: ${restricoes.join(", ")}.`);
  }
  base = comRestricoes;

  // Ajuste tático limitado a ±5 p.p. (escopo 4.4 Camada 2)
  if (selicAnual >= 0.13 && base.acao > 5) {
    const desl = Math.min(5, base.acao - 5);
    base.acao -= desl;
    base.rf_pos += desl;
    notas.push(
      `Selic em ${(selicAnual * 100).toFixed(2)}% a.a.: deslocamento tático de ${desl.toFixed(1)} p.p. de ações para pós-fixado.`,
    );
  }

  const soma = Object.values(base).reduce((a, b) => a + b, 0);
  const faixas = {} as Record<Classe, Faixa>;
  for (const k of Object.keys(base) as Classe[]) {
    const alvo = (base[k] / soma) * 100;
    faixas[k] = {
      alvo: Math.round(alvo * 10) / 10,
      min: Math.round(Math.max(0, alvo - 5) * 10) / 10,
      max: Math.round(Math.min(100, alvo + 5) * 10) / 10,
    };
  }
  return { faixas, notas };
}

export type PosicaoClasse = { classe: Classe; valor: number };

/** Camada 4 — rebalanceamento. RN08: prefere direcionar aporte novo a vender. */
export function rebalancear(
  atual: PosicaoClasse[],
  faixas: Record<Classe, Faixa>,
  aporteDisponivel: number,
) {
  const total = atual.reduce((s, p) => s + p.valor, 0);
  if (total === 0) return { desvios: [], viaAporte: [], exigeVenda: false };

  const desvios = (Object.keys(faixas) as Classe[]).map((c) => {
    const valor = atual.find((p) => p.classe === c)?.valor ?? 0;
    const pctAtual = (valor / total) * 100;
    const f = faixas[c];
    const fora = pctAtual < f.min || pctAtual > f.max;
    const alvoValor = (f.alvo / 100) * (total + aporteDisponivel);
    return {
      classe: c,
      pctAtual: Math.round(pctAtual * 10) / 10,
      alvo: f.alvo,
      desvio: Math.round((pctAtual - f.alvo) * 10) / 10,
      fora,
      faltaValor: Math.round(alvoValor - valor),
    };
  });

  const faltantes = desvios.filter((d) => d.faltaValor > 0);
  const somaFalta = faltantes.reduce((s, d) => s + d.faltaValor, 0);
  const viaAporte = faltantes
    .map((d) => ({
      classe: d.classe,
      valor: somaFalta > 0 ? Math.round((d.faltaValor / somaFalta) * aporteDisponivel) : 0,
      desvio: d.desvio,
    }))
    .filter((d) => d.valor > 0)
    .sort((a, b) => a.desvio - b.desvio);

  const exigeVenda = desvios.some((d) => Math.abs(d.desvio) > 10);
  return { desvios, viaAporte, exigeVenda };
}

/** Camada 5 — gera recomendações com justificativa estruturada (RN09/RN10). */
export function gerarRecomendacoes(input: {
  usuario: Usuario;
  situacao: Situacao;
  dividas: Divida[];
  objetivos: Objetivo[];
  perfil: Perfil;
  cdiAnual: number;
  selicAnual: number;
  posicoes: PosicaoClasse[];
  concentracaoEmissor: Array<{ emissor: string; valor: number; fgc: boolean }>;
}): { recomendacoes: Recomendacao[]; gates: Gate[]; liberado: boolean } {
  const { usuario: u, situacao: s, dividas, objetivos, perfil, cdiAnual, selicAnual } = input;
  const recs: Recomendacao[] = [];
  const { gates, liberado, primeiroAberto } = avaliarGates(u, s, dividas, perfil, cdiAnual);
  const metaMensal = metaRetornoMensal(perfil, cdiAnual);
  const sobra = s.renda_mensal - s.despesa_mensal;

  // Gate 1
  if (!gates[0].aprovado) {
    recs.push({
      chave: "gate1_fluxo",
      tipo: "gate",
      prioridade: 1,
      titulo: "Seu fluxo de caixa está negativo",
      acao: `Cortar ${((Math.abs(sobra) * 1.2) / 100).toFixed(2)} de despesa mensal antes de investir`,
      valor: Math.abs(sobra),
      justificativa: [
        {
          fator: "Fluxo de caixa",
          dado: `Renda ${(s.renda_mensal / 100).toFixed(2)} contra despesa ${(s.despesa_mensal / 100).toFixed(2)}`,
          peso: "alto",
          direcao: "contra",
        },
      ],
      riscos: ["Novo endividamento para cobrir o déficit"],
      alternativas: ["Reduzir despesa não essencial", "Aumentar renda"],
      seNaoSeguir: "O déficit vira dívida de cartão, a modalidade mais cara do mercado.",
      bloqueante: true,
    });
  }

  // Gate 2 — RN01
  const caras = ordenarDividas(
    dividas.filter((d) => d.taxa_mensal > metaMensal),
    "avalanche",
  );
  for (const d of caras) {
    const juros = jurosTotais(d.saldo, d.taxa_mensal, d.parcelas_restantes);
    const ganhoInvestindo = Math.round(
      valorFuturo(d.saldo, 0, metaMensal, d.parcelas_restantes) - d.saldo,
    );
    recs.push({
      chave: `gate2_divida_${d.id}`,
      tipo: "gate",
      prioridade: 1,
      titulo: `Quitar ${d.tipo.replace(/_/g, " ")} rende mais que investir`,
      acao: `Direcionar o aporte para amortizar ${(d.saldo / 100).toFixed(2)}`,
      valor: d.saldo,
      justificativa: [
        {
          fator: "Taxa da dívida",
          dado: `${(d.taxa_mensal * 100).toFixed(2)}% a.m. (${(((1 + d.taxa_mensal) ** 12 - 1) * 100).toFixed(1)}% a.a.)`,
          peso: "alto",
          direcao: "contra",
        },
        {
          fator: "Meta de retorno da carteira",
          dado: `${(metaMensal * 100).toFixed(2)}% a.m. para o perfil ${perfil.classificacao}`,
          peso: "alto",
          direcao: "neutro",
        },
        {
          fator: "Diferencial garantido",
          dado: `Economia de juros ${(juros / 100).toFixed(2)} contra ganho estimado ${(ganhoInvestindo / 100).toFixed(2)}`,
          peso: "alto",
          direcao: "favor",
        },
      ],
      riscos: ["Usar a reserva de emergência para quitar deixa você exposto a imprevistos"],
      alternativas: ["Portabilidade da dívida", "Negociar desconto à vista"],
      seNaoSeguir: `Custo de ${(juros / 100).toFixed(2)} em juros até o fim do contrato.`,
      bloqueante: true,
    });
  }

  // Gate 3 — RN02/RN03
  const mesesExig = mesesReservaExigidos(u);
  const reservaAlvo = s.custo_essencial * mesesExig;
  if (s.reserva_atual < reservaAlvo) {
    const falta = reservaAlvo - s.reserva_atual;
    const aporteLivre = Math.max(s.capacidade_aporte, sobra > 0 ? sobra : 0);
    const mesesParaCompletar = aporteLivre > 0 ? Math.ceil(falta / aporteLivre) : null;
    recs.push({
      chave: "gate3_reserva",
      tipo: "gate",
      prioridade: 1,
      titulo: "Completar a reserva de emergência",
      acao: `Aportar ${(falta / 100).toFixed(2)} em ativo de liquidez diária`,
      valor: falta,
      justificativa: [
        {
          fator: "Cobertura atual",
          dado: `${(s.reserva_atual / Math.max(1, s.custo_essencial)).toFixed(1)} meses de ${mesesExig} exigidos`,
          peso: "alto",
          direcao: "contra",
        },
        {
          fator: "Estabilidade de renda",
          dado: `${u.estabilidade_renda}, ${u.dependentes} dependente(s)`,
          peso: "alto",
          direcao: "neutro",
        },
        {
          fator: "Prazo estimado",
          dado: mesesParaCompletar ? `${mesesParaCompletar} meses no ritmo atual` : "sem aporte disponível",
          peso: "medio",
          direcao: "neutro",
        },
      ],
      riscos: ["Resgatar investimento de risco em queda para cobrir emergência realiza o prejuízo"],
      alternativas: ["Tesouro Selic", "CDB de liquidez diária com FGC", "Fundo simples DI"],
      seNaoSeguir: "Qualquer imprevisto vira dívida de cartão ou venda forçada em momento ruim.",
      bloqueante: true,
    });
  }

  // Gate 4
  if (u.dependentes > 0 && s.possui_seguro_vida === 0) {
    recs.push({
      chave: "gate4_seguro",
      tipo: "alerta",
      prioridade: 2,
      titulo: "Sem seguro de vida com dependentes",
      acao: "Contratar seguro de vida com cobertura de 3 a 5 anos de renda",
      valor: s.renda_mensal * 12 * 4,
      justificativa: [
        {
          fator: "Dependentes",
          dado: `${u.dependentes} pessoa(s) dependem da sua renda`,
          peso: "alto",
          direcao: "contra",
        },
      ],
      riscos: ["Patrimônio consumido rapidamente na ausência de renda"],
      alternativas: ["Seguro de vida temporário", "Cobertura via empregador"],
      seNaoSeguir: "A família fica sem reposição de renda.",
      bloqueante: false,
    });
  }

  // Gate 5 — RN06
  if (!gates[4].aprovado) {
    recs.push({
      chave: "gate5_suitability",
      tipo: "gate",
      prioridade: 1,
      titulo: "Questionário de perfil vencido",
      acao: "Refazer o questionário de suitability",
      justificativa: [
        {
          fator: "Validade",
          dado: `Última aplicação em ${perfil.data_aplicacao}, acima de 24 meses`,
          peso: "alto",
          direcao: "contra",
        },
      ],
      riscos: ["Recomendação baseada em perfil desatualizado"],
      alternativas: [],
      seNaoSeguir: "Novas recomendações ficam suspensas (RN06).",
      bloqueante: true,
    });
  }

  // Camada 2 e 4 — só com gates aprovados
  if (liberado) {
    const horizonte = Math.max(
      perfil.horizonte_meses,
      ...objetivos.filter((o) => o.status === "ativo").map((o) => mesesAte(o.data_alvo)),
    );
    const { faixas, notas } = alocacaoAlvo(perfil, horizonte, selicAnual);
    const aporte = s.capacidade_aporte;
    const { desvios, viaAporte, exigeVenda } = rebalancear(input.posicoes, faixas, aporte);

    recs.push({
      chave: "alocacao_alvo",
      tipo: "alocacao",
      prioridade: 2,
      titulo: "Carteira-alvo definida para o seu perfil",
      acao: (Object.keys(faixas) as Classe[])
        .filter((c) => faixas[c].alvo > 0)
        .map((c) => `${CLASSE_LABEL[c]} ${faixas[c].alvo}%`)
        .join(" · "),
      justificativa: [
        {
          fator: "Perfil de risco",
          dado: `${perfil.classificacao} (score ${perfil.score})`,
          peso: "alto",
          direcao: "neutro",
        },
        {
          fator: "Horizonte",
          dado: `${horizonte} meses até o objetivo mais distante`,
          peso: "alto",
          direcao: "neutro",
        },
        {
          fator: "Tolerância a perda",
          dado: `aceita queda de até ${perfil.tolerancia_perda_pct}% em 12 meses`,
          peso: "alto",
          direcao: "neutro",
        },
        ...notas.map(
          (n): Fator => ({ fator: "Ajuste aplicado", dado: n, peso: "medio", direcao: "neutro" }),
        ),
      ],
      riscos: ["Alocação é ponto de partida, não garantia de retorno"],
      alternativas: ["Revisar o perfil para alterar a composição"],
      seNaoSeguir: "Carteira sem referência fica exposta a decisão emocional.",
      bloqueante: false,
    });

    for (const v of viaAporte) {
      recs.push({
        chave: `rebal_${v.classe}`,
        tipo: "rebalanceamento",
        prioridade: 3,
        titulo: `Direcionar aporte para ${CLASSE_LABEL[v.classe]}`,
        acao: `Aportar ${(v.valor / 100).toFixed(2)} em ${CLASSE_LABEL[v.classe]}`,
        valor: v.valor,
        justificativa: [
          {
            fator: "Desvio da meta",
            dado: `${v.desvio > 0 ? "+" : ""}${v.desvio} p.p. em relação ao alvo`,
            peso: v.desvio < -5 ? "alto" : "medio",
            direcao: "contra",
          },
          {
            fator: "Método",
            dado: "Rebalanceamento por aporte novo, sem venda (RN08)",
            peso: "alto",
            direcao: "favor",
          },
        ],
        riscos: ["Aporte concentrado em um momento de preço alto"],
        alternativas: ["Diluir o aporte em 2 ou 3 meses"],
        seNaoSeguir: "O desvio da carteira aumenta e o risco deixa de corresponder ao perfil.",
        bloqueante: false,
      });
    }

    if (exigeVenda) {
      const pior = desvios.sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio))[0];
      recs.push({
        chave: "rebal_venda",
        tipo: "rebalanceamento",
        prioridade: 3,
        titulo: "Desvio alto exige rebalanceamento com venda",
        acao: `Reduzir ${CLASSE_LABEL[pior.classe]}, hoje em ${pior.pctAtual}% contra alvo de ${pior.alvo}%`,
        justificativa: [
          {
            fator: "Desvio",
            dado: `${pior.desvio} p.p., acima do limite crítico de 10 p.p.`,
            peso: "alto",
            direcao: "contra",
          },
        ],
        riscos: ["A venda gera fato gerador de IR e custo de corretagem"],
        alternativas: ["Suspender novos aportes nessa classe até o desvio fechar"],
        seNaoSeguir: "A carteira opera em risco acima do perfil declarado.",
        bloqueante: false,
      });
    }
  } else if (primeiroAberto) {
    recs.push({
      chave: "bloqueio_alocacao",
      tipo: "alerta",
      prioridade: 2,
      titulo: "Recomendação de investimento de risco suspensa",
      acao: `Resolver o gate ${primeiroAberto.n} — ${primeiroAberto.nome}`,
      justificativa: [
        {
          fator: "Gate aberto",
          dado: primeiroAberto.detalhe,
          peso: "alto",
          direcao: "contra",
        },
      ],
      riscos: ["Investir com a base financeira frágil costuma terminar em resgate forçado"],
      alternativas: ["Manter aportes apenas em liquidez diária enquanto o gate estiver aberto"],
      seNaoSeguir: "Risco de perda realizada por necessidade de caixa.",
      bloqueante: true,
    });
  }

  // Objetivos
  for (const o of objetivos.filter((x) => x.status === "ativo")) {
    const meses = mesesAte(o.data_alvo);
    const taxa = metaMensal;
    const projetado = valorFuturo(o.valor_atual, o.aporte_mensal, taxa, meses);
    if (projetado >= o.valor_alvo) continue;
    const necessario = aporteNecessario(o.valor_alvo, o.valor_atual, taxa, meses);
    const gap = Math.round(necessario - o.aporte_mensal);
    recs.push({
      chave: `objetivo_${o.id}`,
      tipo: "objetivo",
      prioridade: o.prioridade,
      titulo: `"${o.nome}" não chega na data`,
      acao: `Aumentar o aporte em ${(gap / 100).toFixed(2)} por mês${o.flexivel ? " ou adiar a data" : ""}`,
      valor: gap,
      justificativa: [
        {
          fator: "Projeção atual",
          dado: `${(projetado / 100).toFixed(2)} contra alvo de ${(o.valor_alvo / 100).toFixed(2)}`,
          peso: "alto",
          direcao: "contra",
        },
        {
          fator: "Prazo",
          dado: `${meses} meses restantes`,
          peso: "alto",
          direcao: "neutro",
        },
        {
          fator: "Aporte necessário",
          dado: `${(necessario / 100).toFixed(2)} por mês a ${(taxa * 100).toFixed(2)}% a.m.`,
          peso: "alto",
          direcao: "neutro",
        },
      ],
      riscos: ["Retorno estimado não é garantido"],
      alternativas: o.flexivel
        ? ["Adiar a data-alvo", "Reduzir o valor-alvo", "Aumentar o aporte"]
        : ["Aumentar o aporte", "Rever a prioridade entre objetivos"],
      seNaoSeguir: `Faltariam ${((o.valor_alvo - projetado) / 100).toFixed(2)} na data-alvo.`,
      bloqueante: false,
    });
  }

  // RN07 — FGC
  for (const c of input.concentracaoEmissor) {
    if (c.fgc && c.valor > TETO_FGC) {
      recs.push({
        chave: `fgc_${c.emissor}`,
        tipo: "alerta",
        prioridade: 2,
        titulo: `Exposição acima do teto do FGC em ${c.emissor}`,
        acao: `Reduzir para no máximo 250.000,00 por emissor`,
        valor: c.valor - TETO_FGC,
        justificativa: [
          {
            fator: "Teto do FGC",
            dado: `${(c.valor / 100).toFixed(2)} aplicados contra cobertura de 250.000,00`,
            peso: "alto",
            direcao: "contra",
          },
        ],
        riscos: ["O valor acima do teto fica sem garantia em caso de quebra do emissor"],
        alternativas: ["Distribuir entre emissores", "Migrar o excedente para título público"],
        seNaoSeguir: "O excedente vira risco de crédito puro.",
        bloqueante: false,
      });
    }
  }

  // PGBL — RN14
  if (u.declaracao_ir === "completa" && liberado) {
    const limite = Math.round(s.renda_mensal * 12 * 0.12);
    recs.push({
      chave: "pgbl",
      tipo: "fiscal",
      prioridade: 3,
      titulo: "PGBL pode reduzir seu IR",
      acao: `Aportar até ${(limite / 100).toFixed(2)} por ano em PGBL`,
      valor: limite,
      justificativa: [
        {
          fator: "Tipo de declaração",
          dado: "Completa — permite deduzir o aporte da base de cálculo",
          peso: "alto",
          direcao: "favor",
        },
        {
          fator: "Limite legal",
          dado: "12% da renda bruta anual (RN14)",
          peso: "alto",
          direcao: "neutro",
        },
      ],
      riscos: [
        "O IR incide sobre o valor total do resgate, não só sobre o rendimento",
        "Taxa de administração alta corrói o benefício fiscal",
      ],
      alternativas: ["VGBL se mudar para a declaração simplificada", "Tesouro IPCA+ longo"],
      seNaoSeguir: "Benefício fiscal anual não aproveitado.",
      bloqueante: false,
    });
  }

  recs.sort((a, b) => a.prioridade - b.prioridade || Number(b.bloqueante) - Number(a.bloqueante));
  return { recomendacoes: recs, gates, liberado };
}
