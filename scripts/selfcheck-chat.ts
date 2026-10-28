import assert from "node:assert/strict";
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
} from "../src/lib/parser";
import { estadoInicial, progresso, responder, type Estado } from "../src/lib/conversa";
import { completo, pendencias, perfilVazio } from "../src/lib/perfilLocal";
import { avaliarGates, gerarRecomendacoes } from "../src/lib/engine";
import { usuarioDe } from "../src/lib/perfilLocal";

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

// ---------- parseDinheiro ----------
t("dinheiro: inteiro simples", () => assert.equal(parseDinheiro("3500"), 350000));
t("dinheiro: com R$", () => assert.equal(parseDinheiro("R$ 3500"), 350000));
t("dinheiro: milhar pt-BR", () => assert.equal(parseDinheiro("3.500"), 350000));
t("dinheiro: milhar e centavos", () => assert.equal(parseDinheiro("3.500,50"), 350050));
t("dinheiro: só centavos", () => assert.equal(parseDinheiro("12,34"), 1234));
t("dinheiro: mil", () => assert.equal(parseDinheiro("3,5 mil"), 350000));
t("dinheiro: k", () => assert.equal(parseDinheiro("5k"), 500000));
t("dinheiro: milhão", () => assert.equal(parseDinheiro("2 milhões"), 200000000));
t("dinheiro: milhao sem acento", () => assert.equal(parseDinheiro("1 milhao"), 100000000));
t("dinheiro: frase completa", () => assert.equal(parseDinheiro("ganho uns 4.200 por mês"), 420000));
t("dinheiro: zero", () => assert.equal(parseDinheiro("0"), 0));
t("dinheiro: texto sem número", () => assert.equal(parseDinheiro("não sei"), null));
t("dinheiro: vazio", () => assert.equal(parseDinheiro(""), null));
t("dinheiro: 1.234.567,89", () => assert.equal(parseDinheiro("1.234.567,89"), 123456789));
t("dinheiro: não estoura limite", () => assert.equal(parseDinheiro("999999999999 milhões"), null));

// ---------- parseInteiro ----------
t("inteiro: numérico", () => assert.equal(parseInteiro("3"), 3));
t("inteiro: nenhum", () => assert.equal(parseInteiro("nenhum"), 0));
t("inteiro: nenhuma", () => assert.equal(parseInteiro("nenhuma"), 0));
t("inteiro: dois por extenso", () => assert.equal(parseInteiro("dois"), 2));
t("inteiro: frase", () => assert.equal(parseInteiro("tenho 2 filhos"), 2));
t("inteiro: sem número", () => assert.equal(parseInteiro("sei lá"), null));

// ---------- parsePercentual ----------
t("pct: com símbolo", () => assert.equal(parsePercentual("20%"), 20));
t("pct: por extenso", () => assert.equal(parsePercentual("20 por cento"), 20));
t("pct: decimal", () => assert.equal(parsePercentual("12,5%"), 12.5));
t("pct: acima de 100 rejeita", () => assert.equal(parsePercentual("150%"), null));
t("pct: negativo rejeita", () => assert.equal(parsePercentual("-5%"), null));

// ---------- parsePrazoMeses ----------
t("prazo: anos", () => assert.equal(parsePrazoMeses("5 anos"), 60));
t("prazo: 1 ano", () => assert.equal(parsePrazoMeses("1 ano"), 12));
t("prazo: meses", () => assert.equal(parsePrazoMeses("18 meses"), 18));
t("prazo: mes singular", () => assert.equal(parsePrazoMeses("6 mes"), 6));
t("prazo: longo prazo", () => assert.equal(parsePrazoMeses("longo prazo"), 240));
t("prazo: aposentadoria", () => assert.equal(parsePrazoMeses("até a aposentadoria"), 240));
t("prazo: curto prazo", () => assert.equal(parsePrazoMeses("curto prazo"), 12));
t("prazo: número solto vira anos", () => assert.equal(parsePrazoMeses("10"), 120));
t("prazo: meio ano", () => assert.equal(parsePrazoMeses("2,5 anos"), 30));
t("prazo: sem info", () => assert.equal(parsePrazoMeses("sei lá"), null));

// ---------- parseEstabilidade ----------
t("estab: clt", () => assert.equal(parseEstabilidade("sou CLT"), "clt"));
t("estab: carteira assinada", () => assert.equal(parseEstabilidade("carteira assinada"), "clt"));
t("estab: autonomo", () => assert.equal(parseEstabilidade("sou autônomo"), "autonomo"));
t("estab: pj", () => assert.equal(parseEstabilidade("trabalho como PJ"), "autonomo"));
t("estab: variavel", () => assert.equal(parseEstabilidade("minha renda varia muito"), "variavel"));
t("estab: aposentado", () => assert.equal(parseEstabilidade("sou aposentado"), "aposentado"));
t("estab: desconhecido", () => assert.equal(parseEstabilidade("trabalho"), null));
t("estab: autonoma feminino", () => assert.equal(parseEstabilidade("sou autônoma"), "autonomo"));
t("estab: aposentada feminino", () => assert.equal(parseEstabilidade("aposentada"), "aposentado"));
t("estab: freelancer", () => assert.equal(parseEstabilidade("freelancer"), "autonomo"));

// ---------- parseSimNao ----------
t("simnao: sim", () => assert.equal(parseSimNao("sim"), true));
t("simnao: tenho", () => assert.equal(parseSimNao("tenho sim"), true));
t("simnao: nao", () => assert.equal(parseSimNao("não"), false));
t("simnao: nao sem acento", () => assert.equal(parseSimNao("nao"), false));
t("simnao: ainda nao", () => assert.equal(parseSimNao("ainda não"), false));
t("simnao: ambiguo", () => assert.equal(parseSimNao("talvez"), null));
t("simnao: 'ainda nao tenho' é negativa", () => assert.equal(parseSimNao("ainda não tenho"), false));
t("simnao: 'nao possuo' é negativa", () => assert.equal(parseSimNao("não possuo"), false));
t("simnao: 'tenho sim' é positiva", () => assert.equal(parseSimNao("tenho sim"), true));

// ---------- parseTaxaMensal ----------
t("taxa: ao mes", () => {
  const r = parseTaxaMensal("12% ao mês")!;
  assert.ok(Math.abs(r - 0.12) < 1e-9, `${r}`);
});
t("taxa: a.m.", () => {
  const r = parseTaxaMensal("2,5 a.m.")!;
  assert.ok(Math.abs(r - 0.025) < 1e-9, `${r}`);
});
t("taxa: ao ano converte", () => {
  const r = parseTaxaMensal("150% ao ano")!;
  const esperado = 2.5 ** (1 / 12) - 1;
  assert.ok(Math.abs(r - esperado) < 1e-9, `${r} vs ${esperado}`);
});
t("taxa: anual menor que mensal equivalente", () => {
  const anual = parseTaxaMensal("12% ao ano")!;
  const mensal = parseTaxaMensal("12% ao mês")!;
  assert.ok(anual < mensal);
});
t("taxa: sem número", () => assert.equal(parseTaxaMensal("não sei"), null));
t("taxa: zero rejeita", () => assert.equal(parseTaxaMensal("0%"), null));

// ---------- parseNome ----------
t("nome: simples", () => assert.equal(parseNome("Maria"), "Maria"));
t("nome: com saudação", () => assert.equal(parseNome("oi, meu nome é João"), "João"));
t("nome: me chamo", () => assert.equal(parseNome("me chamo Ana Paula"), "Ana"));
t("nome: normaliza caixa", () => assert.equal(parseNome("PEDRO"), "Pedro"));
t("nome: só primeiro nome", () => assert.equal(parseNome("Carlos Silva Santos"), "Carlos"));
t("nome: vazio", () => assert.equal(parseNome("   "), null));
t("nome: só números", () => assert.equal(parseNome("12345"), null));
t("nome: 'sou o Pedro'", () => assert.equal(parseNome("sou o Pedro"), "Pedro"));
t("nome: 'oi, sou a Ana'", () => assert.equal(parseNome("oi, sou a Ana"), "Ana"));
t("nome: 'pode me chamar de Zé'", () => assert.equal(parseNome("pode me chamar de Zé"), "Zé"));
t("nome: com acento preservado", () => assert.equal(parseNome("Thaís"), "Thaís"));
t("nome: bom dia + nome", () => assert.equal(parseNome("bom dia, meu nome é Lucas"), "Lucas"));

// ---------- parseTipoDivida ----------
t("divida: cartao", () => assert.equal(parseTipoDivida("cartão de crédito"), "cartao"));
t("divida: financiamento carro", () =>
  assert.equal(parseTipoDivida("financiamento do carro"), "financiamento_veiculo"));
t("divida: financiamento imovel", () =>
  assert.equal(parseTipoDivida("financiamento do apartamento"), "financiamento_imovel"));
t("divida: consignado", () => assert.equal(parseTipoDivida("consignado"), "consignado"));
t("divida: pessoal", () => assert.equal(parseTipoDivida("empréstimo pessoal"), "pessoal"));

// ---------- parseDeclaracaoIR ----------
t("ir: completa", () => assert.equal(parseDeclaracaoIR("uso a completa"), "completa"));
t("ir: simplificada", () => assert.equal(parseDeclaracaoIR("simplificada"), "simplificada"));
t("ir: isento", () => assert.equal(parseDeclaracaoIR("sou isento"), "isento"));
t("ir: isenta feminino", () => assert.equal(parseDeclaracaoIR("isenta"), "isento"));
t("ir: nao declaro", () => assert.equal(parseDeclaracaoIR("não declaro"), "isento"));
t("divida: consignada feminino", () => assert.equal(parseTipoDivida("consignada"), "consignado"));
t("divida: emprestimo sem acento", () => assert.equal(parseTipoDivida("emprestimo"), "pessoal"));

// ---------- derivarPerfil ----------
t("perfil: tolerância baixa + prazo curto = conservador", () => {
  assert.equal(derivarPerfil(5, 12).classificacao, "conservador");
});
t("perfil: tolerância alta + prazo longo = arrojado", () => {
  assert.equal(derivarPerfil(40, 240).classificacao, "arrojado");
});
t("perfil: score entre 0 e 100", () => {
  for (const tol of [0, 5, 20, 50, 100]) {
    for (const h of [6, 24, 60, 120, 480]) {
      const s = derivarPerfil(tol, h).score;
      assert.ok(s >= 0 && s <= 100, `tol=${tol} h=${h} score=${s}`);
    }
  }
});
t("perfil: mais tolerância nunca reduz o score", () => {
  let ant = -1;
  for (const tol of [0, 10, 20, 30, 40, 50]) {
    const s = derivarPerfil(tol, 120).score;
    assert.ok(s >= ant, `score caiu em tol=${tol}`);
    ant = s;
  }
});

// ---------- fluxo da conversa ----------
function conversar(respostas: string[]): Estado {
  let st = estadoInicial();
  for (const r of respostas) {
    const res = responder(st, r);
    st = res.estado;
  }
  return st;
}

// nome, renda, despesa, essencial, estabilidade, dependentes, reserva,
// seguro, saúde, declaração, dívida?, investe?, aporte, horizonte, tolerância, objetivo?
const FLUXO_BASE = [
  "Maria", "8000", "5000", "3500", "CLT", "1", "12000",
  "não", "sim", "simplificada", "não", "não", "1500", "10 anos", "25%", "não",
];

t("conversa: fluxo completo chega ao fim", () => {
  const st = conversar(FLUXO_BASE);
  assert.equal(st.passo, "fim");
});

t("conversa: perfil fica completo", () => {
  const st = conversar(FLUXO_BASE);
  assert.equal(completo(st.perfil), true, `pendências: ${JSON.stringify(pendencias(st.perfil))}`);
});

t("conversa: valores gravados corretamente", () => {
  const st = conversar(FLUXO_BASE);
  assert.equal(st.perfil.nome, "Maria");
  assert.equal(st.perfil.situacao.renda_mensal, 800000);
  assert.equal(st.perfil.situacao.despesa_mensal, 500000);
  assert.equal(st.perfil.situacao.custo_essencial, 350000);
  assert.equal(st.perfil.situacao.reserva_atual, 1200000);
  assert.equal(st.perfil.situacao.capacidade_aporte, 150000);
  assert.equal(st.perfil.estabilidade_renda, "clt");
  assert.equal(st.perfil.dependentes, 1);
  assert.equal(st.perfil.perfil.horizonte_meses, 120);
  assert.equal(st.perfil.perfil.tolerancia_perda_pct, 25);
});

t("conversa: entrada inválida não avança o passo", () => {
  const st = estadoInicial();
  const r = responder(st, "12345");
  assert.equal(r.erro, true);
  assert.equal(r.estado.passo, "nome");
});

t("conversa: entrada inválida não corrompe o perfil", () => {
  let st = estadoInicial();
  st = responder(st, "Maria").estado;
  const antes = JSON.stringify(st.perfil);
  const r = responder(st, "abcdef");
  assert.equal(r.erro, true);
  assert.equal(JSON.stringify(r.estado.perfil), antes);
});

t("conversa: essencial maior que despesa é rejeitado", () => {
  let st = estadoInicial();
  for (const r of ["Maria", "8000", "5000"]) st = responder(st, r).estado;
  const res = responder(st, "9000");
  assert.equal(res.erro, true);
  assert.equal(res.estado.passo, "essencial");
});

t("conversa: cadastra dívida completa", () => {
  const st = conversar([
    "João", "5000", "4000", "3000", "CLT", "0", "2000",
    "não", "sim", "simplificada",
    "sim", "cartão", "3000", "12% ao mês", "500", "não",
    "não", "500", "5 anos", "15%", "não",
  ]);
  assert.equal(st.perfil.dividas.length, 1);
  const d = st.perfil.dividas[0];
  assert.equal(d.tipo, "cartao");
  assert.equal(d.saldo, 300000);
  assert.ok(Math.abs(d.taxa_mensal - 0.12) < 1e-9);
  assert.ok(d.parcelas_restantes > 0 && d.parcelas_restantes <= 480);
});

t("conversa: duas dívidas", () => {
  const st = conversar([
    "João", "5000", "4000", "3000", "CLT", "0", "2000",
    "não", "sim", "simplificada",
    "sim", "cartão", "3000", "12% ao mês", "500",
    "sim", "consignado", "8000", "1,8% ao mês", "400", "não",
    "não", "500", "5 anos", "15%", "não",
  ]);
  assert.equal(st.perfil.dividas.length, 2);
  assert.deepEqual(st.perfil.dividas.map((d) => d.id), [1, 2]);
});

t("conversa: parcela que não cobre juros limita o prazo", () => {
  const st = conversar([
    "João", "5000", "4000", "3000", "CLT", "0", "2000",
    "não", "sim", "simplificada",
    "sim", "cartão", "10000", "15% ao mês", "100", "não",
    "não", "500", "5 anos", "15%", "não",
  ]);
  assert.equal(st.perfil.dividas[0].parcelas_restantes, 240);
});

t("conversa: cadastra objetivo", () => {
  const st = conversar([
    ...FLUXO_BASE.slice(0, -1),
    "sim", "Comprar casa", "300000", "8 anos", "não",
  ]);
  assert.equal(st.perfil.objetivos.length, 1);
  const o = st.perfil.objetivos[0];
  assert.equal(o.nome, "Comprar casa");
  assert.equal(o.valor_alvo, 30000000);
  assert.ok(o.data_alvo > new Date().toISOString().slice(0, 10));
});

t("conversa: responder é puro (não muta o estado anterior)", () => {
  let st = estadoInicial();
  st = responder(st, "Maria").estado;
  const snapshot = JSON.stringify(st);
  responder(st, "8000");
  assert.equal(JSON.stringify(st), snapshot, "estado anterior foi mutado");
});

t("conversa: progresso é monotônico e limitado", () => {
  let st = estadoInicial();
  let ant = -1;
  for (const r of FLUXO_BASE) {
    const pr = progresso(st.passo);
    assert.ok(pr >= 0 && pr <= 100, `progresso fora de faixa: ${pr}`);
    if (["nome", "renda", "despesa", "essencial"].includes(st.passo)) {
      assert.ok(pr >= ant, `progresso retrocedeu em ${st.passo}`);
      ant = pr;
    }
    st = responder(st, r).estado;
  }
});

t("conversa: toda pergunta tem texto", () => {
  let st = estadoInicial();
  for (const r of FLUXO_BASE) {
    const res = responder(st, r);
    for (const m of res.mensagens) {
      assert.ok(m.length > 0, `mensagem vazia no passo ${st.passo}`);
      assert.ok(!/NaN|Infinity|undefined|null/.test(m), `mensagem com valor inválido: "${m}"`);
    }
    st = res.estado;
  }
});

// ---------- integração: conversa alimenta o motor ----------
t("integração: perfil do chat roda no motor sem erro", () => {
  const st = conversar(FLUXO_BASE);
  const p = st.perfil;
  const r = gerarRecomendacoes({
    usuario: usuarioDe(p),
    situacao: p.situacao,
    dividas: p.dividas,
    objetivos: p.objetivos,
    perfil: p.perfil,
    cdiAnual: 0.1465,
    selicAnual: 0.1475,
    posicoes: [],
    concentracaoEmissor: [],
  });
  assert.ok(r.recomendacoes.length > 0);
  for (const rec of r.recomendacoes) {
    assert.ok(rec.justificativa.length > 0, `${rec.chave} sem justificativa`);
    for (const f of rec.justificativa) {
      assert.ok(!/NaN|Infinity|undefined/.test(f.dado), `${rec.chave}: "${f.dado}"`);
    }
  }
});

t("integração: dívida cara informada no chat bloqueia o gate 2", () => {
  const st = conversar([
    "João", "5000", "4000", "3000", "CLT", "0", "20000",
    "não", "sim", "simplificada",
    "sim", "cartão", "3000", "12% ao mês", "500", "não",
    "não", "500", "5 anos", "15%", "não",
  ]);
  const p = st.perfil;
  const g = avaliarGates(usuarioDe(p), p.situacao, p.dividas, p.perfil, 0.1465);
  assert.equal(g.liberado, false);
  assert.equal(g.primeiroAberto!.n, 2);
});

t("integração: reserva insuficiente bloqueia o gate 3", () => {
  const st = conversar([
    "João", "5000", "4000", "3000", "CLT", "0", "1000",
    "não", "sim", "simplificada", "não",
    "não", "500", "5 anos", "15%", "não",
  ]);
  const p = st.perfil;
  const g = avaliarGates(usuarioDe(p), p.situacao, p.dividas, p.perfil, 0.1465);
  assert.equal(g.liberado, false);
  assert.equal(g.primeiroAberto!.n, 3);
});

t("integração: situação saudável libera os gates", () => {
  const st = conversar([
    "João", "10000", "5000", "3000", "CLT", "0", "15000",
    "não", "sim", "simplificada", "não",
    "não", "2000", "10 anos", "30%", "não",
  ]);
  const p = st.perfil;
  const g = avaliarGates(usuarioDe(p), p.situacao, p.dividas, p.perfil, 0.1465);
  assert.equal(g.liberado, true, JSON.stringify(g.gates.filter((x) => !x.aprovado)));
});

// ---------- perfilLocal ----------
t("perfilVazio tem pendências", () => {
  assert.ok(pendencias(perfilVazio()).length > 0);
  assert.equal(completo(perfilVazio()), false);
});

t("pendências listam campo e pergunta", () => {
  for (const p of pendencias(perfilVazio())) {
    assert.ok(p.campo.length > 0 && p.pergunta.length > 0);
  }
});

console.log(`\nchat self-check: ${ok} passaram, ${falhas.length} falharam`);
if (falhas.length) {
  for (const f of falhas) console.error(`  FALHA  ${f}`);
  process.exit(1);
}
