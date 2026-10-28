import { normalizarTicker } from "./ticker";
import {
  derivarPerfil,
  parseDeclaracaoIR,
  parseDinheiro,
  parseEstabilidade,
  parseInteiro,
  parseNome,
  parsePercentual,
  parsePrazoMeses,
  parseSimNao,
  parseTaxaMensal,
  parseTipoDivida,
} from "./parser";
import { perfilVazio, type PerfilLocal } from "./perfilLocal";

export type Passo =
  | "nome" | "renda" | "despesa" | "essencial" | "estabilidade" | "dependentes"
  | "reserva" | "seguro" | "saude" | "declaracao" | "divida_tem" | "divida_tipo"
  | "divida_saldo" | "divida_taxa" | "divida_parcela" | "divida_mais"
  | "investe" | "ativo_ticker" | "ativo_quantidade" | "ativo_preco" | "ativo_mais"
  | "aporte" | "horizonte" | "tolerancia"
  | "objetivo_tem" | "objetivo_nome" | "objetivo_valor" | "objetivo_prazo" | "objetivo_mais"
  | "fim" | "consulta";

export type CotacaoLeve = {
  ticker: string;
  nome: string;
  preco: number;
  variacaoPct: number | null;
  minimo52s: number | null;
  maximo52s: number | null;
  classe: string;
  fonte: string;
  atualizadoEm: string;
  /** Presentes apenas em títulos públicos. */
  indexador?: string;
  vencimento?: string;
  taxaCompra?: number;
  taxaCurva?: number | null;
  prazoAnos?: number;
  inflacaoImplicita?: number | null;
};

/** O que o usuário digitou é um ticker da B3 ou um título público? */
export function tipoDeBusca(texto: string): "ticker" | "tesouro" | null {
  if (normalizarTicker(texto)) return "ticker";
  const t = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/\b(tesouro|selic|ipca|prefixado|ltn|ntn-?[bf]|lft|renda\+|educa\+)\b/.test(t))
    return "tesouro";
  return null;
}

export type Estado = {
  passo: Passo;
  perfil: PerfilLocal;
  rascunhoDivida: Partial<{ tipo: string; saldo: number; taxa_mensal: number; parcela: number }>;
  rascunhoObjetivo: Partial<{ nome: string; valor_alvo: number; meses: number }>;
  rascunhoAtivo: Partial<{ cotacao: CotacaoLeve; quantidade: number; precoMedio: number }>;
  /** Para onde voltar depois de uma consulta avulsa de cotação. */
  retomarEm?: Passo;
};

export type Resposta = {
  estado: Estado;
  mensagens: string[];
  erro?: boolean;
  concluido?: boolean;
  /** Pede ao componente que busque a cotação e chame `aplicarCotacao`. */
  buscarCotacao?: string;
};

export function estadoInicial(perfil?: PerfilLocal): Estado {
  return {
    passo: "nome",
    perfil: perfil ?? perfilVazio(),
    rascunhoDivida: {},
    rascunhoObjetivo: {},
    rascunhoAtivo: {},
  };
}

const brl = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Percentual com sinal, sempre em formato pt-BR (vírgula decimal). */
const pctBr = (v: number, casas = 2) =>
  `${v >= 0 ? "+" : ""}${v.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;

export function perguntaDe(estado: Estado): string {
  const p = estado.perfil;
  const nome = p.nome || "você";
  switch (estado.passo) {
    case "nome":
      return "Oi! Vou montar seu diagnóstico financeiro. Nada do que você digitar sai do seu navegador. Como posso te chamar?";
    case "renda":
      return `Prazer, ${nome}. Quanto você recebe por mês, já descontado tudo?`;
    case "despesa":
      return "E quanto gasta por mês, somando tudo?";
    case "essencial":
      return "Desse gasto, quanto é essencial — moradia, comida, saúde, transporte? É a base do cálculo da sua reserva de emergência.";
    case "estabilidade":
      return "Sua renda é CLT, autônoma, variável ou aposentadoria?";
    case "dependentes":
      return "Quantas pessoas dependem da sua renda? (se for só você, responda nenhuma)";
    case "reserva":
      return "Quanto você tem guardado hoje para emergências, em dinheiro de resgate rápido?";
    case "seguro":
      return "Você tem seguro de vida?";
    case "saude":
      return "E plano de saúde?";
    case "declaracao":
      return "Na declaração do imposto de renda, você usa o modelo completo ou o simplificado? (isso muda se o PGBL vale a pena)";
    case "divida_tem":
      return "Você tem alguma dívida ou financiamento em aberto?";
    case "divida_tipo":
      return "Que tipo de dívida? (cartão, empréstimo, financiamento de carro ou imóvel, consignado...)";
    case "divida_saldo":
      return "Quanto ainda falta pagar dessa dívida?";
    case "divida_taxa":
      return "Qual a taxa de juros dela? Pode ser ao mês ou ao ano — diga qual.";
    case "divida_parcela":
      return "Quanto você paga de parcela por mês nessa dívida?";
    case "divida_mais":
      return "Tem outra dívida para cadastrar?";
    case "investe":
      return "Fora a reserva, você já tem algum investimento em ações, fundos imobiliários ou ETFs?";
    case "ativo_ticker":
      return "Qual o ativo? Pode ser código da B3 (PETR4, MXRF11, IVVB11) ou título público (Tesouro Selic 2029, IPCA+ 2035, Prefixado 2028). Busco o valor atual.";
    case "ativo_quantidade":
      return estado.rascunhoAtivo.cotacao?.classe === "tesouro"
        ? "Quantos títulos você tem? (pode ser fração, como 0,5)"
        : "Quantas cotas você tem desse ativo?";
    case "ativo_preco":
      return estado.rascunhoAtivo.cotacao?.classe === "tesouro"
        ? "Por quanto comprou cada título? (se não lembrar, responda zero)"
        : "Por quanto você comprou, em média, cada cota? (se não lembrar, responda zero)";
    case "ativo_mais":
      return "Quer cadastrar outro ativo?";
    case "consulta":
      return "Quer consultar outro ativo? Digite o código, ou responda não para seguir.";
    case "aporte":
      return "Quanto consegue separar por mês para investir?";
    case "horizonte":
      return "Por quanto tempo pretende deixar esse dinheiro rendendo?";
    case "tolerancia":
      return "Última da parte de risco: se sua carteira caísse, qual queda você aguentaria em um ano sem vender no desespero? Responda em porcentagem.";
    case "objetivo_tem":
      return "Quer cadastrar algum objetivo? (comprar imóvel, aposentadoria, viagem, faculdade...)";
    case "objetivo_nome":
      return "Qual o objetivo?";
    case "objetivo_valor":
      return "Quanto custa, mais ou menos?";
    case "objetivo_prazo":
      return "Para quando?";
    case "objetivo_mais":
      return "Quer cadastrar outro objetivo?";
    case "fim":
      return "Pronto! Seu diagnóstico está calculado.";
  }
}

function proximo(estado: Estado, passo: Passo, msgs: string[] = []): Resposta {
  const novo = { ...estado, passo };
  return { estado: novo, mensagens: [...msgs, perguntaDe(novo)], concluido: passo === "fim" };
}

function erro(estado: Estado, msg: string): Resposta {
  return { estado, mensagens: [msg], erro: true };
}

const hojeIso = () => new Date().toISOString().slice(0, 10);

function dataFutura(meses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

/** Avança a conversa. Puro: mesma entrada, mesma saída. */
export function responder(estado: Estado, texto: string): Resposta {
  const t = texto.trim();
  if (!t) return erro(estado, "Não entendi. Pode escrever de novo?");

  const p: PerfilLocal = JSON.parse(JSON.stringify(estado.perfil)) as PerfilLocal;
  const st: Estado = { ...estado, perfil: p };

  switch (estado.passo) {
    case "nome": {
      const nome = parseNome(t);
      if (!nome) return erro(st, "Não consegui identificar um nome aí. Pode escrever só o primeiro nome?");
      p.nome = nome;
      return proximo(st, "renda");
    }

    case "renda": {
      const v = parseDinheiro(t);
      if (v === null || v <= 0)
        return erro(st, "Preciso de um valor em reais. Por exemplo: 3500, ou 3,5 mil.");
      p.situacao.renda_mensal = v;
      return proximo(st, "despesa", [`Anotado: ${brl(v)} de renda mensal.`]);
    }

    case "despesa": {
      const v = parseDinheiro(t);
      if (v === null || v < 0) return erro(st, "Preciso de um valor em reais. Por exemplo: 2800.");
      p.situacao.despesa_mensal = v;
      const sobra = p.situacao.renda_mensal - v;
      const nota =
        sobra > 0
          ? `Sobram ${brl(sobra)} por mês.`
          : `Atenção: suas despesas passam a renda em ${brl(Math.abs(sobra))}.`;
      return proximo(st, "essencial", [nota]);
    }

    case "essencial": {
      const v = parseDinheiro(t);
      if (v === null || v < 0) return erro(st, "Preciso de um valor em reais.");
      if (v > p.situacao.despesa_mensal)
        return erro(
          st,
          `O gasto essencial não pode passar o gasto total de ${brl(p.situacao.despesa_mensal)}. Quanto é só do essencial?`,
        );
      p.situacao.custo_essencial = v;
      return proximo(st, "estabilidade");
    }

    case "estabilidade": {
      const e = parseEstabilidade(t);
      if (!e)
        return erro(st, "Não identifiquei. Responda CLT, autônomo, renda variável ou aposentado.");
      p.estabilidade_renda = e;
      return proximo(st, "dependentes");
    }

    case "dependentes": {
      const n = parseInteiro(t);
      if (n === null || n < 0 || n > 20)
        return erro(st, "Quantas pessoas dependem da sua renda? Responda um número, ou nenhuma.");
      p.dependentes = n;
      return proximo(st, "reserva");
    }

    case "reserva": {
      const v = parseDinheiro(t);
      if (v === null || v < 0) return erro(st, "Preciso de um valor. Se não tem nada, responda zero.");
      p.situacao.reserva_atual = v;
      const meses = p.situacao.custo_essencial > 0 ? v / p.situacao.custo_essencial : 0;
      return proximo(st, "seguro", [
        `Isso cobre ${meses.toFixed(1)} ${meses === 1 ? "mês" : "meses"} do seu custo essencial.`,
      ]);
    }

    case "seguro": {
      const b = parseSimNao(t);
      if (b === null) return erro(st, "Responda sim ou não.");
      p.situacao.possui_seguro_vida = b ? 1 : 0;
      return proximo(st, "saude");
    }

    case "saude": {
      const b = parseSimNao(t);
      if (b === null) return erro(st, "Responda sim ou não.");
      p.situacao.possui_plano_saude = b ? 1 : 0;
      return proximo(st, "declaracao");
    }

    case "declaracao": {
      const d = parseDeclaracaoIR(t);
      if (!d) return erro(st, "Responda completa, simplificada, ou isento se não declara.");
      p.declaracao_ir = d;
      return proximo(st, "divida_tem");
    }

    case "divida_tem": {
      const b = parseSimNao(t);
      if (b === null) return erro(st, "Responda sim ou não.");
      return b ? proximo(st, "divida_tipo") : proximo(st, "investe");
    }

    case "divida_tipo": {
      const tipo = parseTipoDivida(t) ?? "outro";
      st.rascunhoDivida = { tipo };
      return proximo(st, "divida_saldo");
    }

    case "divida_saldo": {
      const v = parseDinheiro(t);
      if (v === null || v <= 0) return erro(st, "Quanto falta pagar? Responda um valor em reais.");
      st.rascunhoDivida = { ...st.rascunhoDivida, saldo: v };
      return proximo(st, "divida_taxa");
    }

    case "divida_taxa": {
      const taxa = parseTaxaMensal(t);
      if (taxa === null)
        return erro(st, "Não entendi a taxa. Exemplos: 12% ao mês, 2,5 a.m., 150% ao ano.");
      st.rascunhoDivida = { ...st.rascunhoDivida, taxa_mensal: taxa };
      return proximo(st, "divida_parcela", [
        `Isso dá ${(((1 + taxa) ** 12 - 1) * 100).toFixed(1)}% ao ano.`,
      ]);
    }

    case "divida_parcela": {
      const v = parseDinheiro(t);
      if (v === null || v < 0) return erro(st, "Quanto paga por mês? Responda um valor.");
      const r = st.rascunhoDivida;
      const saldo = r.saldo ?? 0;
      const taxa = r.taxa_mensal ?? 0;
      // Estimativa de prazo restante; se a parcela não cobre os juros, usa teto de 240.
      let parcelas = 1;
      if (v > 0) {
        const juros = saldo * taxa;
        parcelas = v > juros ? Math.ceil(saldo / (v - juros)) : 240;
        parcelas = Math.max(1, Math.min(480, parcelas));
      }
      p.dividas.push({
        id: p.dividas.length + 1,
        tipo: String(r.tipo ?? "outro"),
        saldo,
        taxa_mensal: taxa,
        parcela: v,
        parcelas_restantes: parcelas,
      });
      st.rascunhoDivida = {};
      return proximo(st, "divida_mais", [
        `Dívida registrada: ${brl(saldo)} a ${(taxa * 100).toFixed(2)}% ao mês.`,
      ]);
    }

    case "divida_mais": {
      const b = parseSimNao(t);
      if (b === null) return erro(st, "Responda sim ou não.");
      return b ? proximo(st, "divida_tipo") : proximo(st, "investe");
    }

    case "investe": {
      const b = parseSimNao(t);
      if (b === null) return erro(st, "Responda sim ou não.");
      if (!b) {
        p.posicoes = [];
        return proximo(st, "aporte");
      }
      return proximo(st, "ativo_ticker");
    }

    case "ativo_ticker": {
      const tipo = tipoDeBusca(t);
      if (!tipo)
        return erro(
          st,
          "Não reconheci. Use o código da B3 (PETR4, MXRF11) ou o nome do título público (Tesouro Selic 2029, IPCA+ 2035).",
        );
      const alvo = tipo === "ticker" ? normalizarTicker(t)! : t.trim();
      // O componente busca e devolve por aplicarCotacao().
      return { estado: st, mensagens: [`Buscando ${alvo}…`], buscarCotacao: alvo };
    }

    case "ativo_quantidade": {
      const n = Number(t.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
      if (!Number.isFinite(n) || n <= 0)
        return erro(st, "Quantas cotas? Responda um número maior que zero.");
      st.rascunhoAtivo = { ...st.rascunhoAtivo, quantidade: n };
      return proximo(st, "ativo_preco");
    }

    case "ativo_preco": {
      const v = parseDinheiro(t);
      if (v === null || v < 0) return erro(st, "Responda um valor, ou zero se não lembrar.");
      const r = st.rascunhoAtivo;
      const cot = r.cotacao;
      if (!cot || !r.quantidade) {
        st.rascunhoAtivo = {};
        return erro(st, "Perdi os dados do ativo. Vamos tentar de novo: qual o código?");
      }
      const precoMedio = v / 100;
      const valorAtual = Math.round(r.quantidade * cot.preco * 100);
      p.posicoes.push({
        ticker: cot.ticker,
        nome: cot.nome,
        valor: valorAtual,
        quantidade: r.quantidade,
        precoMedio: precoMedio > 0 ? precoMedio : undefined,
        classe: cot.classe,
        indexador: cot.indexador,
        vencimento: cot.vencimento,
        taxaContratada: cot.taxaCompra,
      });
      st.rascunhoAtivo = {};

      const eTesouro = cot.classe === "tesouro";
      const msgs = [
        `${eTesouro ? cot.nome : cot.ticker} registrado: ${brl(valorAtual)} ${
          eTesouro ? "marcado a mercado" : "a preço de mercado"
        }.`,
      ];
      if (precoMedio > 0) {
        const investido = Math.round(r.quantidade * precoMedio * 100);
        const resultado = valorAtual - investido;
        const pctRes = investido > 0 ? (resultado / investido) * 100 : 0;
        msgs.push(
          `Você investiu ${brl(investido)}. Resultado: ${resultado >= 0 ? "+" : ""}${brl(resultado)} (${pctBr(pctRes, 1)}).`,
        );
        // Marcação a mercado: explica por que o valor difere do contratado.
        if (eTesouro && cot.taxaCompra !== undefined && cot.indexador !== "SELIC") {
          msgs.push(
            resultado >= 0
              ? "Esse resultado é a marcação a mercado: a taxa caiu desde a sua compra, então o título vale mais hoje. Levando até o vencimento, vale a taxa que você contratou."
              : "Esse resultado é a marcação a mercado: a taxa subiu desde a sua compra, então vender hoje renderia menos. Levando até o vencimento, vale a taxa que você contratou.",
          );
        }
      }
      return proximo(st, "ativo_mais", msgs);
    }

    case "ativo_mais": {
      const b = parseSimNao(t);
      if (b === null) return erro(st, "Responda sim ou não.");
      return b ? proximo(st, "ativo_ticker") : proximo(st, "aporte");
    }

    case "consulta": {
      const b = parseSimNao(t);
      if (b === false) {
        const volta = st.retomarEm ?? "fim";
        st.retomarEm = undefined;
        return proximo(st, volta);
      }
      const tipo = tipoDeBusca(t);
      if (!tipo)
        return erro(
          st,
          "Digite um código da B3 (PETR4) ou um título público (IPCA+ 2035), ou responda não para seguir.",
        );
      const alvo = tipo === "ticker" ? normalizarTicker(t)! : t.trim();
      return { estado: st, mensagens: [`Buscando ${alvo}…`], buscarCotacao: alvo };
    }

    case "aporte": {
      const v = parseDinheiro(t);
      if (v === null || v < 0) return erro(st, "Responda um valor, ou zero.");
      p.situacao.capacidade_aporte = v;
      return proximo(st, "horizonte");
    }

    case "horizonte": {
      const m = parsePrazoMeses(t);
      if (m === null || m <= 0)
        return erro(st, "Não entendi o prazo. Exemplos: 5 anos, 18 meses, longo prazo.");
      p.perfil.horizonte_meses = m;
      return proximo(st, "tolerancia");
    }

    case "tolerancia": {
      const pct = parsePercentual(t);
      if (pct === null || pct <= 0)
        return erro(st, "Responda uma porcentagem. Por exemplo: 10%, 20%, 30%.");
      p.perfil.tolerancia_perda_pct = pct;
      const { score, classificacao } = derivarPerfil(pct, p.perfil.horizonte_meses);
      p.perfil.score = score;
      p.perfil.classificacao = classificacao;
      p.perfil.data_aplicacao = hojeIso();
      return proximo(st, "objetivo_tem", [
        `Com ${pct}% de tolerância e ${p.perfil.horizonte_meses} meses de prazo, seu perfil é ${classificacao} (score ${score}).`,
      ]);
    }

    case "objetivo_tem": {
      const b = parseSimNao(t);
      if (b === null) return erro(st, "Responda sim ou não.");
      return b ? proximo(st, "objetivo_nome") : proximo(st, "fim");
    }

    case "objetivo_nome": {
      st.rascunhoObjetivo = { nome: t.slice(0, 60) };
      return proximo(st, "objetivo_valor");
    }

    case "objetivo_valor": {
      const v = parseDinheiro(t);
      if (v === null || v <= 0) return erro(st, "Quanto custa? Responda um valor em reais.");
      st.rascunhoObjetivo = { ...st.rascunhoObjetivo, valor_alvo: v };
      return proximo(st, "objetivo_prazo");
    }

    case "objetivo_prazo": {
      const m = parsePrazoMeses(t);
      if (m === null || m <= 0)
        return erro(st, "Não entendi o prazo. Exemplos: 3 anos, 18 meses.");
      const r = st.rascunhoObjetivo;
      p.objetivos.push({
        id: p.objetivos.length + 1,
        nome: String(r.nome ?? "Objetivo"),
        tipo: "outro",
        valor_alvo: r.valor_alvo ?? 0,
        data_alvo: dataFutura(m),
        valor_atual: 0,
        aporte_mensal: 0,
        prioridade: Math.min(5, p.objetivos.length + 2),
        flexivel: 1,
        status: "ativo",
      });
      st.rascunhoObjetivo = {};
      return proximo(st, "objetivo_mais", [`Objetivo "${p.objetivos[p.objetivos.length - 1].nome}" registrado.`]);
    }

    case "objetivo_mais": {
      const b = parseSimNao(t);
      if (b === null) return erro(st, "Responda sim ou não.");
      return b ? proximo(st, "objetivo_nome") : proximo(st, "fim");
    }

    case "fim":
      return { estado: st, mensagens: ["Seu diagnóstico já está pronto. Veja o resultado abaixo."], concluido: true };
  }
}

const CLASSE_NOME: Record<string, string> = {
  acao: "ação",
  fii: "fundo imobiliário",
  etf: "ETF",
  bdr: "BDR",
  tesouro: "título público",
  desconhecida: "ativo",
};

const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const taxaPct = (v: number) =>
  `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const INDEXADOR_TEXTO: Record<string, string> = {
  SELIC: "acompanha a Selic",
  PRE: "taxa travada até o vencimento",
  IPCA: "IPCA mais juro real",
  IGPM: "IGP-M mais juro real",
};

/** Descreve a cotação em texto, sem opinar sobre comprar ou vender. */
export function descreverCotacao(c: CotacaoLeve): string[] {
  // Título público: taxa e prazo importam mais que a variação do dia.
  if (c.classe === "tesouro") {
    const linhas = [`${c.nome}`, `Preço de compra hoje: ${reais(c.preco)}`];

    if (c.taxaCompra !== undefined) {
      const sufixo =
        c.indexador === "IPCA" || c.indexador === "IGPM"
          ? ` + ${c.indexador === "IPCA" ? "IPCA" : "IGP-M"}`
          : " ao ano";
      linhas.push(`Taxa contratada agora: ${taxaPct(c.taxaCompra)}${sufixo}.`);
    }

    if (c.vencimento) {
      const prazo =
        c.prazoAnos !== undefined
          ? ` — ${c.prazoAnos.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ano(s) pela frente`
          : "";
      linhas.push(
        `Vence em ${c.vencimento.split("-").reverse().join("/")}${prazo}. ${INDEXADOR_TEXTO[c.indexador ?? ""] ?? ""}`.trim(),
      );
    }

    if (c.taxaCurva !== undefined && c.taxaCurva !== null && c.taxaCompra !== undefined) {
      const dif = c.taxaCompra - c.taxaCurva;
      if (Math.abs(dif) > 0.001) {
        linhas.push(
          `A curva de juros para esse prazo está em ${taxaPct(c.taxaCurva)}; este título paga ${dif > 0 ? "acima" : "abaixo"} disso.`,
        );
      }
    }

    if (c.inflacaoImplicita !== undefined && c.inflacaoImplicita !== null) {
      linhas.push(
        `Inflação implícita no mercado para esse prazo: ${taxaPct(c.inflacaoImplicita)} ao ano — é o IPCA que faria prefixado e IPCA+ empatarem.`,
      );
    }

    linhas.push(`Fonte: ${c.fonte}.`);
    return linhas;
  }

  const linhas = [
    `${c.ticker} — ${c.nome}`,
    `Preço agora: ${reais(c.preco)}${c.variacaoPct !== null ? ` (${pctBr(c.variacaoPct)} hoje)` : ""}`,
  ];
  if (c.minimo52s !== null && c.maximo52s !== null) {
    const faixa = c.maximo52s - c.minimo52s;
    const pos = faixa > 0 ? ((c.preco - c.minimo52s) / faixa) * 100 : 50;
    linhas.push(
      `Faixa de 12 meses: ${reais(c.minimo52s)} a ${reais(c.maximo52s)}. Hoje está a ${pos.toFixed(0)}% dessa faixa.`,
    );
  }
  linhas.push(`Classificado como ${CLASSE_NOME[c.classe] ?? "ativo"}. Fonte: ${c.fonte}.`);
  return linhas;
}

/**
 * Aplica o resultado da busca de cotação ao estado.
 * Separado de `responder` porque a busca é assíncrona e vive fora do núcleo puro.
 */
export function aplicarCotacao(
  estado: Estado,
  ticker: string,
  cotacao: CotacaoLeve | null,
): Resposta {
  const st: Estado = {
    ...estado,
    perfil: JSON.parse(JSON.stringify(estado.perfil)) as PerfilLocal,
  };

  if (!cotacao) {
    const msg = `Não encontrei ${ticker} na B3. Confira o código — ações terminam em 3 ou 4 (PETR4), fundos imobiliários e ETFs em 11 (MXRF11).`;
    return { estado: st, mensagens: [msg, perguntaDe(st)], erro: true };
  }

  const descricao = descreverCotacao(cotacao);

  if (st.passo === "consulta") {
    return {
      estado: st,
      mensagens: [...descricao, perguntaDe(st)],
    };
  }

  st.rascunhoAtivo = { cotacao };
  const novo: Estado = { ...st, passo: "ativo_quantidade" };
  return { estado: novo, mensagens: [...descricao, perguntaDe(novo)] };
}

/** Abre uma consulta avulsa de cotação, para retomar o fluxo depois. */
export function iniciarConsulta(estado: Estado, ticker: string): Resposta {
  const st: Estado = { ...estado, passo: "consulta", retomarEm: estado.passo };
  return { estado: st, mensagens: [`Buscando ${ticker}…`], buscarCotacao: ticker };
}

export const TOTAL_PASSOS = 20;

const ORDEM: Passo[] = [
  "nome", "renda", "despesa", "essencial", "estabilidade", "dependentes",
  "reserva", "seguro", "saude", "declaracao", "divida_tem",
  "investe", "aporte", "horizonte", "tolerancia", "objetivo_tem", "fim",
];

export function progresso(passo: Passo): number {
  const i = ORDEM.indexOf(passo);
  if (i < 0) return 55; // passos de detalhe (dívida/objetivo) ficam no meio
  return Math.round((i / (ORDEM.length - 1)) * 100);
}
