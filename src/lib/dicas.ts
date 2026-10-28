import type { Classe } from "./ticker";
import type { Perfil, Situacao } from "./engine";
import type { PerfilLocal } from "./perfilLocal";

export type Dica = {
  chave: string;
  titulo: string;
  texto: string;
  impactoMensal?: number;
  base: string;
};

const brl = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Dicas de economia derivadas dos números do próprio usuário.
 * Cada uma declara em `base` o dado que a originou — sem conselho genérico.
 */
export function dicasEconomia(p: PerfilLocal): Dica[] {
  const s: Situacao = p.situacao;
  const out: Dica[] = [];
  const sobra = s.renda_mensal - s.despesa_mensal;
  const taxaPoupanca = s.renda_mensal > 0 ? sobra / s.renda_mensal : 0;
  const naoEssencial = Math.max(0, s.despesa_mensal - s.custo_essencial);
  const pctNaoEssencial = s.despesa_mensal > 0 ? naoEssencial / s.despesa_mensal : 0;

  if (sobra <= 0) {
    out.push({
      chave: "deficit",
      titulo: "Seu mês fecha no vermelho",
      texto: `Faltam ${brl(Math.abs(sobra))} por mês. O corte precisa sair do gasto não essencial, que hoje é ${brl(naoEssencial)}. Se o corte não couber aí, a conversa passa a ser sobre renda, não sobre economia.`,
      impactoMensal: Math.abs(sobra),
      base: `Renda ${brl(s.renda_mensal)} contra despesa ${brl(s.despesa_mensal)}`,
    });
  }

  if (naoEssencial > 0 && pctNaoEssencial > 0.3) {
    const corte = Math.round(naoEssencial * 0.2);
    out.push({
      chave: "nao_essencial",
      titulo: "Gasto não essencial acima de 30% do total",
      texto: `${brl(naoEssencial)} do seu gasto não é essencial — ${(pctNaoEssencial * 100).toFixed(0)}% do total. Cortar 20% disso libera ${brl(corte)} por mês, sem tocar em moradia, comida, saúde ou transporte.`,
      impactoMensal: corte,
      base: `Despesa total ${brl(s.despesa_mensal)}, essencial ${brl(s.custo_essencial)}`,
    });
  }

  if (taxaPoupanca > 0 && taxaPoupanca < 0.1) {
    const alvo = Math.round(s.renda_mensal * 0.1);
    out.push({
      chave: "taxa_poupanca",
      titulo: "Taxa de poupança abaixo de 10%",
      texto: `Você guarda ${(taxaPoupanca * 100).toFixed(1)}% da renda. Chegar a 10% significa ${brl(alvo)} por mês, ${brl(alvo - sobra)} a mais que hoje.`,
      impactoMensal: alvo - sobra,
      base: `Sobra de ${brl(sobra)} sobre renda de ${brl(s.renda_mensal)}`,
    });
  }

  const parcelas = p.dividas.reduce((a, d) => a + d.parcela, 0);
  const comprometimento = s.renda_mensal > 0 ? parcelas / s.renda_mensal : 0;
  if (comprometimento > 0.3) {
    out.push({
      chave: "comprometimento",
      titulo: "Parcelas consomem mais de 30% da renda",
      texto: `${brl(parcelas)} por mês saem em parcelas, ${(comprometimento * 100).toFixed(0)}% da sua renda. Acima de 30% sobra pouco espaço para imprevisto, e qualquer aperto vira dívida nova.`,
      base: `${p.dividas.length} dívida(s), parcela total ${brl(parcelas)}`,
    });
  }

  const caras = p.dividas.filter((d) => d.taxa_mensal > 0.04);
  for (const d of caras) {
    const jurosMes = Math.round(d.saldo * d.taxa_mensal);
    out.push({
      chave: `juros_${d.id}`,
      titulo: `Juros de ${d.tipo.replace(/_/g, " ")} corroem o orçamento`,
      texto: `Essa dívida gera ${brl(jurosMes)} de juros por mês, só para não crescer. É dinheiro que some antes de virar qualquer coisa. Portabilidade ou negociação à vista costumam reduzir isso mais rápido que cortar despesa.`,
      impactoMensal: jurosMes,
      base: `Saldo ${brl(d.saldo)} a ${(d.taxa_mensal * 100).toFixed(2)}% ao mês`,
    });
  }

  if (s.possui_plano_saude === 0) {
    out.push({
      chave: "saude",
      titulo: "Sem plano de saúde",
      texto:
        "Um procedimento inesperado consome reserva de emergência inteira. Antes de aumentar aporte, vale comparar o custo do plano com o risco que você está carregando sozinho.",
      base: "Plano de saúde não informado no perfil",
    });
  }

  if (p.dependentes > 0 && s.possui_seguro_vida === 0) {
    out.push({
      chave: "seguro",
      titulo: "Dependentes sem seguro de vida",
      texto: `${p.dependentes} pessoa(s) dependem da sua renda e não há cobertura. Seguro de vida temporário costuma custar bem menos do que as pessoas imaginam, e é mais barato que recompor patrimônio.`,
      base: `${p.dependentes} dependente(s), sem seguro`,
    });
  }

  if (s.reserva_atual > 0 && s.custo_essencial > 0) {
    const meses = s.reserva_atual / s.custo_essencial;
    if (meses > 12) {
      const excedente = Math.round(s.reserva_atual - s.custo_essencial * 12);
      out.push({
        chave: "reserva_excesso",
        titulo: "Reserva maior que o necessário",
        texto: `Você tem ${meses.toFixed(1)} meses de custo essencial guardados. Acima de 12 meses, o excedente de ${brl(excedente)} costuma render mais fora da liquidez diária — mantendo o resto intacto.`,
        base: `Reserva ${brl(s.reserva_atual)}, custo essencial ${brl(s.custo_essencial)}`,
      });
    }
  }

  return out;
}

export type AvaliacaoAtivo = {
  adequado: boolean;
  pontos: string[];
  alertas: string[];
  bloqueios: string[];
};

const CLASSE_LABEL: Record<Classe, string> = {
  acao: "ação",
  fii: "fundo imobiliário",
  etf: "ETF",
  bdr: "BDR",
  tesouro: "título público",
  desconhecida: "ativo",
};

/**
 * Avalia a adequação de um ativo ao perfil — sem dizer "compre" ou "venda".
 * Opera no nível de classe, dentro do enquadramento regulatório da v0.
 */
export function avaliarAtivo(
  classe: Classe,
  perfil: Perfil,
  gatesLiberados: boolean,
  horizonteMeses: number,
  /** Só para títulos públicos: muda o perfil de risco da análise. */
  tesouro?: { indexador?: string; vencimento?: string; prazoAnos?: number },
): AvaliacaoAtivo {
  const pontos: string[] = [];
  const alertas: string[] = [];
  const bloqueios: string[] = [];
  const label = CLASSE_LABEL[classe];
  const rendaVariavel = classe === "acao" || classe === "fii" || classe === "etf" || classe === "bdr";

  if (!gatesLiberados && rendaVariavel) {
    bloqueios.push(
      "Você tem um gate de saúde financeira em aberto. Enquanto ele existir, qualquer aplicação de risco entra na frente de algo mais urgente.",
    );
  }

  if (rendaVariavel && horizonteMeses < 24) {
    bloqueios.push(
      `Seu horizonte é de ${horizonteMeses} meses. ${label[0].toUpperCase()}${label.slice(1)} precisa de tempo para se recuperar de queda — abaixo de 2 anos o risco de vender no prejuízo é alto.`,
    );
  }

  if (perfil.classificacao === "conservador" && rendaVariavel) {
    alertas.push(
      `Seu perfil é conservador e isso é ${label}. Não impede nada, mas a oscilação vai ser maior do que você declarou tolerar (${perfil.tolerancia_perda_pct}%).`,
    );
  }

  let restricoes: string[] = [];
  try {
    restricoes = JSON.parse(perfil.restricoes) as string[];
  } catch {
    restricoes = [];
  }
  if (classe === "acao" && restricoes.includes("sem_acoes"))
    bloqueios.push("Você declarou não querer ações.");
  if (classe === "fii" && restricoes.includes("sem_fii"))
    bloqueios.push("Você declarou não querer fundos imobiliários.");
  if ((classe === "etf" || classe === "bdr") && restricoes.includes("sem_exterior"))
    alertas.push("Você declarou evitar exposição ao exterior; confira se este ativo se encaixa.");

  switch (classe) {
    case "acao":
      pontos.push("Renda variável: sem garantia de retorno e sem proteção do FGC.");
      pontos.push("Lucro em vendas acima de R$ 20 mil no mês é tributado em 15%.");
      pontos.push("Concentração em um único papel aumenta risco sem aumentar retorno esperado.");
      break;
    case "fii":
      pontos.push("Rendimento mensal isento de IR para pessoa física, dentro das regras da Lei 11.033.");
      pontos.push("Ganho de capital na venda é tributado em 20%, sem a isenção de R$ 20 mil.");
      pontos.push("Vacância e inadimplência dos inquilinos afetam o rendimento.");
      break;
    case "etf":
      pontos.push("Diversificação automática: um ETF carrega dezenas ou centenas de ativos.");
      pontos.push("Ganho tributado em 15%, sem isenção de R$ 20 mil.");
      pontos.push("Taxa de administração reduz o retorno ao longo do tempo — compare antes.");
      break;
    case "bdr":
      pontos.push("Exposição a empresa estrangeira negociada em reais.");
      pontos.push("Variação cambial afeta o resultado, para os dois lados.");
      pontos.push("Dividendos de BDR têm tratamento tributário distinto do de ações locais.");
      break;
    case "tesouro": {
      const idx = tesouro?.indexador;
      pontos.push("Garantido pelo Tesouro Nacional — o menor risco de crédito do mercado.");
      pontos.push("IR pela tabela regressiva: 22,5% até 180 dias, caindo a 15% após 2 anos.");

      if (idx === "SELIC") {
        pontos.push(
          "Acompanha a Selic e quase não oscila: serve para reserva de emergência e objetivo de curto prazo.",
        );
      } else if (idx === "IPCA" || idx === "IGPM") {
        pontos.push(
          "Protege o poder de compra: rende a inflação mais um juro real contratado.",
        );
        pontos.push(
          "Oscila entre a compra e o vencimento (marcação a mercado). Vender antes pode render mais ou menos que o contratado.",
        );
      } else if (idx === "PRE") {
        pontos.push(
          "Taxa travada: você sabe hoje quanto recebe no vencimento, em reais.",
        );
        pontos.push(
          "Se a inflação subir mais que o previsto, o ganho real encolhe. Oscila antes do vencimento.",
        );
      }

      if (tesouro?.prazoAnos !== undefined && tesouro.prazoAnos > 0) {
        const prazoMeses = tesouro.prazoAnos * 12;
        if (idx !== "SELIC" && horizonteMeses > 0 && prazoMeses > horizonteMeses * 1.5) {
          alertas.push(
            `O título vence em ${tesouro.prazoAnos.toFixed(1)} ano(s), bem além do seu horizonte de ${horizonteMeses} meses. Resgatar antes expõe você à marcação a mercado.`,
          );
        }
        if (tesouro.prazoAnos > 10 && idx !== "SELIC") {
          pontos.push(
            `Prazo longo (${tesouro.prazoAnos.toFixed(0)} anos) amplifica a oscilação de preço: pequena mudança de taxa move bastante o valor.`,
          );
        }
      }
      break;
    }
    default:
      pontos.push("Não consegui classificar este ativo com segurança.");
  }

  if (rendaVariavel && horizonteMeses >= 120) {
    pontos.push(
      `Seu horizonte de ${horizonteMeses} meses é compatível com renda variável — tempo é o que reduz o risco dessa classe.`,
    );
  }

  return { adequado: bloqueios.length === 0, pontos, alertas, bloqueios };
}

/** Texto fixo de responsabilidade. Curto e sem repetição. */
export const AVISO_DECISAO =
  "A decisão é sua. Esta análise mostra como o ativo se encaixa no que você informou — não é indicação de compra nem garantia de retorno.";
