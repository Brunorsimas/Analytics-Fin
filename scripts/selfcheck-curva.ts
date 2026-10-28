import assert from "node:assert/strict";
import {
  explicarMarcacao,
  indexadorDe,
  inflacaoImplicita,
  marcarAMercado,
  montarCurva,
  prazoEmAnos,
  precoZeroCupom,
  taxaParaPrazo,
  type TituloPublico,
  type Vertice,
} from "../src/lib/curva";
import { procurarTitulo, rotuloTitulo } from "../src/lib/tesouro";
import { avaliarAtivo } from "../src/lib/dicas";
import { descreverCotacao, tipoDeBusca, type CotacaoLeve } from "../src/lib/conversa";
import type { Perfil } from "../src/lib/engine";

let ok = 0;
const falhas: string[] = [];
function t(nome: string, fn: () => void) {
  try {
    fn();
    ok++;
  } catch (e) {
    falhas.push(`${nome}: ${(e as Error).message}`);
  }
}

// ---------- indexadorDe ----------
t("indexador: Tesouro Selic", () => assert.equal(indexadorDe("Tesouro Selic"), "SELIC"));
t("indexador: Tesouro Prefixado", () => assert.equal(indexadorDe("Tesouro Prefixado"), "PRE"));
t("indexador: Tesouro IPCA+", () => assert.equal(indexadorDe("Tesouro IPCA+"), "IPCA"));
t("indexador: IPCA com juros semestrais", () =>
  assert.equal(indexadorDe("Tesouro IPCA+ com Juros Semestrais"), "IPCA"));
t("indexador: IGPM", () =>
  assert.equal(indexadorDe("Tesouro IGPM+ com Juros Semestrais"), "IGPM"));
t("indexador: Renda+ é IPCA", () =>
  assert.equal(indexadorDe("Tesouro Renda+ Aposentadoria Extra"), "IPCA"));
t("indexador: Educa+ é IPCA", () => assert.equal(indexadorDe("Tesouro Educa+"), "IPCA"));
t("indexador: desconhecido", () => assert.equal(indexadorDe("Qualquer coisa"), null));

// ---------- prazoEmAnos ----------
t("prazo: 1 ano exato", () => {
  const p = prazoEmAnos("2027-10-27", "2026-10-27");
  assert.ok(Math.abs(p - 1) < 0.01, `${p}`);
});
t("prazo: vencimento passado é 0", () =>
  assert.equal(prazoEmAnos("2020-01-01", "2026-10-27"), 0));
t("prazo: data inválida é 0", () => assert.equal(prazoEmAnos("xx", "2026-10-27"), 0));

// ---------- montarCurva ----------
const BASE = "2026-10-27";
function titulo(over: Partial<TituloPublico>): TituloPublico {
  return {
    nome: "Tesouro Prefixado",
    indexador: "PRE",
    vencimento: "2028-01-01",
    taxaCompra: 0.1444,
    taxaVenda: 0.1454,
    puCompra: 85393,
    puVenda: 85000,
    dataBase: BASE,
    jurosSemestrais: false,
    ...over,
  };
}

const TITULOS: TituloPublico[] = [
  titulo({ vencimento: "2027-01-01", taxaCompra: 0.1354 }),
  titulo({ vencimento: "2028-01-01", taxaCompra: 0.1444 }),
  titulo({ vencimento: "2029-01-01", taxaCompra: 0.1488 }),
  titulo({ vencimento: "2031-01-01", taxaCompra: 0.15 }),
  titulo({ indexador: "IPCA", nome: "Tesouro IPCA+", vencimento: "2029-05-15", taxaCompra: 0.0771 }),
  titulo({ indexador: "IPCA", nome: "Tesouro IPCA+", vencimento: "2035-05-15", taxaCompra: 0.079 }),
  titulo({ indexador: "IPCA", nome: "Tesouro IPCA+", vencimento: "2050-08-15", taxaCompra: 0.0716 }),
  titulo({ indexador: "SELIC", nome: "Tesouro Selic", vencimento: "2029-03-01", taxaCompra: 0.0005 }),
];

const CURVA = montarCurva(TITULOS, BASE);

t("curva: separa nominal e real", () => {
  assert.ok(CURVA.nominal.length >= 4, `nominal=${CURVA.nominal.length}`);
  assert.ok(CURVA.real.length >= 3, `real=${CURVA.real.length}`);
});

t("curva: Selic não entra em nenhuma das duas", () => {
  const total = CURVA.nominal.length + CURVA.real.length;
  assert.equal(total, 7, `esperado 7 vértices, obtido ${total}`);
});

t("curva: vértices ordenados por prazo", () => {
  for (const serie of [CURVA.nominal, CURVA.real]) {
    for (let i = 1; i < serie.length; i++) {
      assert.ok(serie[i].prazoAnos > serie[i - 1].prazoAnos, "fora de ordem");
    }
  }
});

t("curva: taxas são finitas e plausíveis", () => {
  for (const v of [...CURVA.nominal, ...CURVA.real]) {
    assert.ok(Number.isFinite(v.taxa), `taxa=${v.taxa}`);
    assert.ok(v.taxa > 0 && v.taxa < 0.5, `taxa fora de faixa: ${v.taxa}`);
    assert.ok(Number.isFinite(v.prazoAnos) && v.prazoAnos > 0, `prazo=${v.prazoAnos}`);
  }
});

t("curva: nominal fica acima da real (juro > juro real)", () => {
  const n = taxaParaPrazo(CURVA.nominal, 5)!;
  const r = taxaParaPrazo(CURVA.real, 5)!;
  assert.ok(n > r, `nominal=${n} real=${r}`);
});

t("curva: títulos de mesmo vencimento viram um vértice", () => {
  const dupla = montarCurva(
    [
      titulo({ vencimento: "2031-01-01", taxaCompra: 0.15 }),
      titulo({ vencimento: "2031-01-01", taxaCompra: 0.1502, jurosSemestrais: true }),
    ],
    BASE,
  );
  assert.equal(dupla.nominal.length, 1, "deveria agrupar");
  assert.ok(Math.abs(dupla.nominal[0].taxa - 0.1501) < 1e-6, `média=${dupla.nominal[0].taxa}`);
});

t("curva: lista vazia não quebra", () => {
  const c = montarCurva([], BASE);
  assert.deepEqual(c.nominal, []);
  assert.deepEqual(c.real, []);
});

// ---------- taxaParaPrazo ----------
const V: Vertice[] = [
  { prazoAnos: 1, taxa: 0.1 },
  { prazoAnos: 2, taxa: 0.12 },
  { prazoAnos: 5, taxa: 0.15 },
];

t("interpolação: vértice exato", () => assert.equal(taxaParaPrazo(V, 2), 0.12));

t("interpolação: ponto médio", () => {
  const r = taxaParaPrazo(V, 1.5)!;
  assert.ok(Math.abs(r - 0.11) < 1e-9, `${r}`);
});

t("interpolação: entre vértices distantes", () => {
  const r = taxaParaPrazo(V, 3.5)!;
  assert.ok(Math.abs(r - 0.135) < 1e-9, `${r}`);
});

t("interpolação: abaixo da faixa usa o primeiro (sem extrapolar)", () =>
  assert.equal(taxaParaPrazo(V, 0.1), 0.1));

t("interpolação: acima da faixa usa o último (sem extrapolar)", () =>
  assert.equal(taxaParaPrazo(V, 50), 0.15));

t("interpolação: vazio devolve null", () => assert.equal(taxaParaPrazo([], 5), null));

t("interpolação: um vértice devolve a própria taxa", () =>
  assert.equal(taxaParaPrazo([{ prazoAnos: 3, taxa: 0.13 }], 10), 0.13));

t("interpolação: prazo negativo devolve null", () => assert.equal(taxaParaPrazo(V, -1), null));

t("interpolação: NaN devolve null", () => assert.equal(taxaParaPrazo(V, NaN), null));

t("interpolação: monotônica em curva crescente", () => {
  let ant = -1;
  for (let p = 0.5; p <= 6; p += 0.25) {
    const taxa = taxaParaPrazo(V, p)!;
    assert.ok(taxa >= ant - 1e-12, `caiu em ${p}`);
    ant = taxa;
  }
});

// ---------- inflacaoImplicita ----------
t("implícita: nominal 14% e real 7% dá cerca de 6,5%", () => {
  const imp = inflacaoImplicita(CURVA, 5)!;
  assert.ok(imp > 0.03 && imp < 0.12, `${imp}`);
});

t("implícita: fórmula de Fisher, não subtração", () => {
  const c = montarCurva(
    [
      titulo({ vencimento: "2031-10-27", taxaCompra: 0.1 }),
      titulo({ indexador: "IPCA", nome: "Tesouro IPCA+", vencimento: "2031-10-27", taxaCompra: 0.05 }),
    ],
    BASE,
  );
  const imp = inflacaoImplicita(c, 5)!;
  const esperado = 1.1 / 1.05 - 1;
  assert.ok(Math.abs(imp - esperado) < 1e-9, `${imp} vs ${esperado}`);
  assert.ok(Math.abs(imp - 0.05) > 1e-4, "usou subtração em vez de Fisher");
});

t("implícita: sem curva real devolve null", () => {
  const c = montarCurva([titulo({})], BASE);
  assert.equal(inflacaoImplicita(c, 5), null);
});

// ---------- precoZeroCupom ----------
t("zero-cupom: desconto de 1 ano", () => {
  const p = precoZeroCupom(1000, 0.1, 1);
  assert.ok(Math.abs(p - 909.0909) < 0.01, `${p}`);
});

t("zero-cupom: prazo zero devolve a face", () =>
  assert.equal(precoZeroCupom(1000, 0.1, 0), 1000));

t("zero-cupom: taxa maior reduz o preço", () => {
  assert.ok(precoZeroCupom(1000, 0.15, 5) < precoZeroCupom(1000, 0.1, 5));
});

t("zero-cupom: prazo maior reduz o preço", () => {
  assert.ok(precoZeroCupom(1000, 0.1, 10) < precoZeroCupom(1000, 0.1, 5));
});

// ---------- marcarAMercado ----------
const MARC_GANHO = marcarAMercado({
  quantidade: 10,
  precoCompra: 2980,
  precoMercado: 3421.77,
  taxaContratada: 0.0787,
  taxaMercadoHoje: 0.072,
  prazoRestanteAnos: 8.5,
});

t("marcação: valores em centavos inteiros", () => {
  assert.ok(Number.isInteger(MARC_GANHO.valorMercado), `${MARC_GANHO.valorMercado}`);
  assert.ok(Number.isInteger(MARC_GANHO.valorInvestido), `${MARC_GANHO.valorInvestido}`);
  assert.ok(Number.isInteger(MARC_GANHO.resultado), `${MARC_GANHO.resultado}`);
});

t("marcação: resultado é a diferença", () => {
  assert.equal(MARC_GANHO.resultado, MARC_GANHO.valorMercado - MARC_GANHO.valorInvestido);
});

t("marcação: taxa caiu, título valorizou", () => {
  assert.ok(MARC_GANHO.resultado > 0, `${MARC_GANHO.resultado}`);
  assert.ok(MARC_GANHO.retornoPct > 0);
});

t("marcação: taxa subiu, título desvalorizou", () => {
  const m = marcarAMercado({
    quantidade: 10,
    precoCompra: 3421.77,
    precoMercado: 2980,
    taxaContratada: 0.072,
    taxaMercadoHoje: 0.0787,
    prazoRestanteAnos: 8.5,
  });
  assert.ok(m.resultado < 0, `${m.resultado}`);
});

t("marcação: duration é positiva e menor que o prazo", () => {
  assert.ok(MARC_GANHO.duration > 0);
  assert.ok(MARC_GANHO.duration < MARC_GANHO.prazoRestanteAnos, "duration >= prazo");
});

t("marcação: impacto de 1 p.p. é negativo (taxa sobe, preço cai)", () => {
  assert.ok(MARC_GANHO.impacto1pp < 0, `${MARC_GANHO.impacto1pp}`);
});

t("marcação: prazo maior amplifica o impacto", () => {
  const curto = marcarAMercado({
    quantidade: 1, precoCompra: 1000, precoMercado: 1000,
    taxaContratada: 0.1, taxaMercadoHoje: 0.1, prazoRestanteAnos: 2,
  });
  const longo = marcarAMercado({
    quantidade: 1, precoCompra: 1000, precoMercado: 1000,
    taxaContratada: 0.1, taxaMercadoHoje: 0.1, prazoRestanteAnos: 20,
  });
  assert.ok(Math.abs(longo.impacto1pp) > Math.abs(curto.impacto1pp));
});

t("marcação: nenhum campo é NaN", () => {
  for (const [k, v] of Object.entries(MARC_GANHO)) {
    if (typeof v === "number") assert.ok(Number.isFinite(v), `${k}=${v}`);
  }
});

t("marcação: investido zero não gera divisão por zero", () => {
  const m = marcarAMercado({
    quantidade: 0, precoCompra: 0, precoMercado: 100,
    taxaContratada: 0.1, taxaMercadoHoje: 0.1, prazoRestanteAnos: 5,
  });
  assert.equal(m.retornoPct, 0);
  assert.ok(Number.isFinite(m.retornoPct));
});

// ---------- explicarMarcacao ----------
t("explicação: Selic diz que não oscila", () => {
  const txt = explicarMarcacao(MARC_GANHO, "SELIC").join(" ");
  assert.ok(/não oscila|praticamente/i.test(txt), txt);
});

t("explicação: taxa que subiu é explicada como pressão de baixa", () => {
  const m = marcarAMercado({
    quantidade: 1, precoCompra: 1000, precoMercado: 900,
    taxaContratada: 0.07, taxaMercadoHoje: 0.09, prazoRestanteAnos: 8,
  });
  const txt = explicarMarcacao(m, "IPCA").join(" ");
  assert.ok(/preço para baixo/i.test(txt), txt);
  assert.ok(/vencimento/i.test(txt), "não menciona carregar até o fim");
});

t("explicação: taxa que caiu é explicada como pressão de alta", () => {
  const m = marcarAMercado({
    quantidade: 1, precoCompra: 900, precoMercado: 1000,
    taxaContratada: 0.09, taxaMercadoHoje: 0.07, prazoRestanteAnos: 8,
  });
  assert.ok(/preço para cima/i.test(explicarMarcacao(m, "IPCA").join(" ")));
});

t("explicação: taxa em alta com resultado positivo não se contradiz", () => {
  // Caso real: IPCA+ comprado a 21,00 vale 25,02 (inflação acumulada),
  // mas a taxa subiu de 6,5% para 7,9%. O texto não pode dizer "você perdeu".
  const m = marcarAMercado({
    quantidade: 10, precoCompra: 2100, precoMercado: 2502.69,
    taxaContratada: 0.065, taxaMercadoHoje: 0.079, prazoRestanteAnos: 8.5,
  });
  assert.ok(m.resultado > 0, "cenário deveria ter resultado positivo");
  const txt = explicarMarcacao(m, "IPCA").join(" ");
  assert.ok(!/recebe menos/i.test(txt), `contradiz o resultado: ${txt}`);
  assert.ok(!/caiu de preço/i.test(txt), `contradiz o resultado: ${txt}`);
  assert.ok(/junta os dois efeitos|correção pela inflação/i.test(txt), txt);
});

t("explicação: prefixado não menciona correção por inflação", () => {
  const m = marcarAMercado({
    quantidade: 1, precoCompra: 850, precoMercado: 860,
    taxaContratada: 0.14, taxaMercadoHoje: 0.145, prazoRestanteAnos: 2,
  });
  const txt = explicarMarcacao(m, "PRE").join(" ");
  assert.ok(!/correção pela inflação/i.test(txt), txt);
});

t("explicação: números em formato pt-BR (vírgula decimal)", () => {
  const m = marcarAMercado({
    quantidade: 10, precoCompra: 2100, precoMercado: 2502.69,
    taxaContratada: 0.065, taxaMercadoHoje: 0.079, prazoRestanteAnos: 8.5,
  });
  for (const idx of ["PRE", "IPCA"] as const) {
    const txt = explicarMarcacao(m, idx).join(" ");
    // Não pode haver número decimal com ponto fora de valor monetário.
    assert.ok(!/\b\d+\.\d+\s*(ano|%)/.test(txt), `decimal com ponto: ${txt}`);
    assert.ok(!/Duration de \d+\.\d/.test(txt), `duration com ponto: ${txt}`);
  }
});

t("explicação: nunca sugere comprar ou vender", () => {
  for (const idx of ["SELIC", "PRE", "IPCA", "IGPM"] as const) {
    const txt = explicarMarcacao(MARC_GANHO, idx).join(" ").toLowerCase();
    for (const p of ["compre", "venda agora", "aproveite", "garantido"]) {
      assert.ok(!txt.includes(p), `"${p}" em ${idx}`);
    }
  }
});

t("explicação: sem valores inválidos", () => {
  for (const idx of ["SELIC", "PRE", "IPCA", "IGPM"] as const) {
    const txt = explicarMarcacao(MARC_GANHO, idx).join(" ");
    assert.ok(!/NaN|Infinity|undefined/.test(txt), txt);
  }
});

// ---------- procurarTitulo ----------
const CATALOGO: TituloPublico[] = [
  titulo({ nome: "Tesouro Selic", indexador: "SELIC", vencimento: "2029-03-01" }),
  titulo({ nome: "Tesouro Selic", indexador: "SELIC", vencimento: "2031-03-01" }),
  titulo({ nome: "Tesouro Prefixado", indexador: "PRE", vencimento: "2028-01-01" }),
  titulo({ nome: "Tesouro Prefixado com Juros Semestrais", indexador: "PRE", vencimento: "2031-01-01", jurosSemestrais: true }),
  titulo({ nome: "Tesouro IPCA+", indexador: "IPCA", vencimento: "2035-05-15" }),
  titulo({ nome: "Tesouro IPCA+ com Juros Semestrais", indexador: "IPCA", vencimento: "2035-05-15", jurosSemestrais: true }),
  titulo({ nome: "Tesouro Educa+", indexador: "IPCA", vencimento: "2035-12-15" }),
  titulo({ nome: "Tesouro Renda+ Aposentadoria Extra", indexador: "IPCA", vencimento: "2064-12-15" }),
];

t("busca: Tesouro Selic 2029", () => {
  const r = procurarTitulo(CATALOGO, "tesouro selic 2029");
  assert.equal(r.length, 1);
  assert.equal(r[0].vencimento, "2029-03-01");
});

t("busca: IPCA+ 2035 não traz o de juros semestrais", () => {
  const r = procurarTitulo(CATALOGO, "ipca+ 2035");
  assert.equal(r.length, 1);
  assert.equal(r[0].jurosSemestrais, false);
});

t("busca: pedir juros semestrais traz o certo", () => {
  const r = procurarTitulo(CATALOGO, "ipca 2035 juros semestrais");
  assert.equal(r.length, 1);
  assert.equal(r[0].jurosSemestrais, true);
});

t("busca: Educa+ não aparece em busca por IPCA genérica", () => {
  const r = procurarTitulo(CATALOGO, "ipca 2035");
  assert.ok(!r.some((x) => x.nome.includes("Educa")), "Educa+ vazou");
});

t("busca: Educa+ explícito funciona", () => {
  const r = procurarTitulo(CATALOGO, "educa+ 2035");
  assert.equal(r.length, 1);
  assert.ok(r[0].nome.includes("Educa"));
});

t("busca: Renda+ explícito funciona", () => {
  const r = procurarTitulo(CATALOGO, "renda+ 2064");
  assert.equal(r.length, 1);
});

t("busca: sem acento funciona", () => {
  assert.ok(procurarTitulo(CATALOGO, "prefixado 2028").length === 1);
});

t("busca: prefixado traz só prefixado", () => {
  const r = procurarTitulo(CATALOGO, "prefixado");
  assert.ok(r.length > 0);
  assert.ok(r.every((x) => x.indexador === "PRE"), "trouxe outro indexador");
});

t("busca: ano inexistente devolve vazio", () => {
  assert.equal(procurarTitulo(CATALOGO, "selic 2099").length, 0);
});

t("busca: resultado ordenado por vencimento", () => {
  const r = procurarTitulo(CATALOGO, "selic");
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i].vencimento >= r[i - 1].vencimento, "fora de ordem");
  }
});

t("rótulo inclui nome e ano", () => {
  const r = rotuloTitulo(CATALOGO[0]);
  assert.ok(r.includes("Selic") && r.includes("2029"), r);
});

// ---------- tipoDeBusca ----------
t("tipo: PETR4 é ticker", () => assert.equal(tipoDeBusca("PETR4"), "ticker"));
t("tipo: MXRF11 é ticker", () => assert.equal(tipoDeBusca("MXRF11"), "ticker"));
t("tipo: tesouro selic é tesouro", () => assert.equal(tipoDeBusca("tesouro selic 2029"), "tesouro"));
t("tipo: ipca+ 2035 é tesouro", () => assert.equal(tipoDeBusca("ipca+ 2035"), "tesouro"));
t("tipo: prefixado é tesouro", () => assert.equal(tipoDeBusca("prefixado 2028"), "tesouro"));
t("tipo: LTN é tesouro", () => assert.equal(tipoDeBusca("LTN 2028"), "tesouro"));
t("tipo: texto solto é null", () => assert.equal(tipoDeBusca("qualquer coisa"), null));
t("tipo: injeção é null", () => assert.equal(tipoDeBusca("'; DROP TABLE--"), null));

// ---------- descreverCotacao para tesouro ----------
const COT_TESOURO: CotacaoLeve = {
  ticker: "Tesouro IPCA+ 2035",
  nome: "Tesouro IPCA+ 2035",
  preco: 2502.69,
  variacaoPct: null,
  minimo52s: null,
  maximo52s: null,
  classe: "tesouro",
  fonte: "Tesouro Transparente",
  atualizadoEm: "2026-10-27",
  indexador: "IPCA",
  vencimento: "2035-05-15",
  taxaCompra: 0.079,
  taxaCurva: 0.0785,
  prazoAnos: 8.6,
  inflacaoImplicita: 0.0652,
};

t("descrição tesouro: traz taxa e vencimento", () => {
  const txt = descreverCotacao(COT_TESOURO).join(" ");
  assert.ok(/7,90%/.test(txt), `taxa ausente: ${txt}`);
  assert.ok(/15\/05\/2035/.test(txt), `vencimento ausente: ${txt}`);
  assert.ok(/IPCA/.test(txt), "indexador ausente");
});

t("descrição tesouro: traz inflação implícita", () => {
  const txt = descreverCotacao(COT_TESOURO).join(" ");
  assert.ok(/6,52%/.test(txt), `implícita ausente: ${txt}`);
  assert.ok(/implícita/i.test(txt));
});

t("descrição tesouro: cita a fonte oficial", () => {
  assert.ok(/Tesouro Transparente/.test(descreverCotacao(COT_TESOURO).join(" ")));
});

t("descrição tesouro: sem campos nulos vazando", () => {
  const txt = descreverCotacao({
    ...COT_TESOURO, taxaCurva: null, inflacaoImplicita: null,
  }).join(" ");
  assert.ok(!/NaN|undefined|null/.test(txt), txt);
});

t("descrição tesouro: nunca sugere compra", () => {
  const txt = descreverCotacao(COT_TESOURO).join(" ").toLowerCase();
  for (const p of ["compre", "aproveite", "oportunidade", "garantido"]) {
    assert.ok(!txt.includes(p), `"${p}" presente`);
  }
});

t("descrição tesouro: prazo em formato pt-BR", () => {
  const txt = descreverCotacao(COT_TESOURO).join(" ");
  assert.ok(/8,6 ano/.test(txt), `prazo com ponto decimal: ${txt}`);
  assert.ok(!/\d+\.\d+ ano/.test(txt), `decimal com ponto: ${txt}`);
});

// ---------- avaliarAtivo para tesouro ----------
const PERFIL: Perfil = {
  classificacao: "moderado", score: 50, tolerancia_perda_pct: 20,
  horizonte_meses: 60, restricoes: "[]", data_aplicacao: "2026-01-01",
};

t("avaliar tesouro: cita garantia do Tesouro e IR regressivo", () => {
  const txt = avaliarAtivo("tesouro", PERFIL, true, 60, { indexador: "IPCA" }).pontos.join(" ");
  assert.ok(/Tesouro Nacional/.test(txt), "garantia ausente");
  assert.ok(/22,5%|regressiva/.test(txt), "tabela de IR ausente");
});

t("avaliar tesouro: Selic indicado para curto prazo", () => {
  const txt = avaliarAtivo("tesouro", PERFIL, true, 12, { indexador: "SELIC" }).pontos.join(" ");
  assert.ok(/reserva de emergência|curto prazo/i.test(txt), txt);
});

t("avaliar tesouro: IPCA+ menciona marcação a mercado", () => {
  const txt = avaliarAtivo("tesouro", PERFIL, true, 60, { indexador: "IPCA" }).pontos.join(" ");
  assert.ok(/marcação a mercado/i.test(txt), txt);
});

t("avaliar tesouro: prefixado menciona risco de inflação", () => {
  const txt = avaliarAtivo("tesouro", PERFIL, true, 60, { indexador: "PRE" }).pontos.join(" ");
  assert.ok(/inflação/i.test(txt), txt);
});

t("avaliar tesouro: vencimento além do horizonte gera alerta", () => {
  const a = avaliarAtivo("tesouro", PERFIL, true, 60, { indexador: "IPCA", prazoAnos: 20 });
  assert.ok(a.alertas.some((x) => /horizonte/i.test(x)), JSON.stringify(a.alertas));
});

t("avaliar tesouro: Selic longo não gera alerta de horizonte", () => {
  const a = avaliarAtivo("tesouro", PERFIL, true, 60, { indexador: "SELIC", prazoAnos: 20 });
  assert.ok(!a.alertas.some((x) => /horizonte/i.test(x)), "alertou sem motivo");
});

t("avaliar tesouro: nunca bloqueia por gate (renda fixa)", () => {
  const a = avaliarAtivo("tesouro", PERFIL, false, 60, { indexador: "SELIC" });
  assert.equal(a.bloqueios.length, 0, JSON.stringify(a.bloqueios));
  assert.equal(a.adequado, true);
});

t("avaliar tesouro: não diz comprar ou vender", () => {
  for (const idx of ["SELIC", "PRE", "IPCA", "IGPM"]) {
    const a = avaliarAtivo("tesouro", PERFIL, true, 60, { indexador: idx, prazoAnos: 10 });
    const txt = [...a.pontos, ...a.alertas, ...a.bloqueios].join(" ").toLowerCase();
    for (const p of ["compre", "venda agora", "recomendo", "garantido de"]) {
      assert.ok(!txt.includes(p), `"${p}" em ${idx}`);
    }
    assert.ok(!/NaN|Infinity|undefined/.test(txt), `valor inválido em ${idx}`);
  }
});

console.log(`\ncurva self-check: ${ok} passaram, ${falhas.length} falharam`);
if (falhas.length) {
  for (const f of falhas) console.error(`  FALHA  ${f}`);
  process.exit(1);
}
