import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-loader.mjs", pathToFileURL("./scripts/"));

const { xirr, twr, desvio, volAnual, drawdownMax, beta, anualizar, real, valorFuturo, aporteNecessario, monteCarlo, aliquotaRegressiva, ordenarDividas, mesesAte } =
  await import("../src/lib/calc.ts");
const { avaliarGates, alocacaoAlvo, rebalancear, gerarRecomendacoes, mesesReservaExigidos, metaRetornoMensal } =
  await import("../src/lib/engine.ts");

let ok = 0;
const falhas = [];
function t(nome, fn) {
  try {
    fn();
    ok++;
  } catch (e) {
    falhas.push(`${nome}: ${e.message}`);
  }
}

// ---------- calc ----------
t("xirr aproxima 10% a.a.", () => {
  const r = xirr([
    { data: "2025-01-01", valor: -1000 },
    { data: "2026-01-01", valor: 1100 },
  ]);
  assert.ok(Math.abs(r - 0.1) < 0.005, `obtido ${r}`);
});

t("xirr com aportes múltiplos", () => {
  const r = xirr([
    { data: "2024-01-01", valor: -1000 },
    { data: "2024-07-01", valor: -500 },
    { data: "2026-01-01", valor: 1800 },
  ]);
  assert.ok(r > 0 && r < 0.3, `obtido ${r}`);
});

t("xirr retorna null sem troca de sinal", () => {
  assert.equal(xirr([{ data: "2025-01-01", valor: -100 }, { data: "2026-01-01", valor: -50 }]), null);
});

t("twr isola aporte", () => {
  // Cresce 10%, recebe aporte, cresce 10% de novo -> 21%
  const r = twr([
    { inicio: 100, fim: 110, fluxo: 0 },
    { inicio: 110, fim: 231, fluxo: 100 },
  ]);
  assert.ok(Math.abs(r - 0.21) < 1e-9, `obtido ${r}`);
});

t("twr ignora período com base zero", () => {
  assert.equal(twr([{ inicio: 0, fim: 100, fluxo: 0 }]), 0);
});

t("desvio amostral conhecido", () => {
  assert.ok(Math.abs(desvio([2, 4, 4, 4, 5, 5, 7, 9]) - 2.13809) < 1e-4);
});

t("desvio com 1 ponto é zero", () => assert.equal(desvio([5]), 0));

t("volAnual escala por raiz de 12", () => {
  const m = [0.01, -0.02, 0.03, 0.0];
  assert.ok(Math.abs(volAnual(m) - desvio(m) * Math.sqrt(12)) < 1e-12);
});

t("drawdown máximo", () => {
  assert.ok(Math.abs(drawdownMax([100, 120, 60, 90]) - -0.5) < 1e-9);
});

t("drawdown de série sempre crescente é zero", () => {
  assert.equal(drawdownMax([10, 20, 30]), 0);
});

t("beta de série idêntica é 1", () => {
  const s = [0.01, -0.02, 0.03, 0.015];
  assert.ok(Math.abs(beta(s, s) - 1) < 1e-9);
});

t("anualizar 12 meses é identidade", () => {
  assert.ok(Math.abs(anualizar(0.2, 12) - 0.2) < 1e-9);
});

t("retorno real desconta inflação", () => {
  assert.ok(Math.abs(real(0.1, 0.05) - 0.047619) < 1e-5);
});

t("valorFuturo sem juros é soma simples", () => {
  assert.equal(valorFuturo(1000, 100, 0, 10), 2000);
});

t("valorFuturo com juros compostos", () => {
  assert.ok(Math.abs(valorFuturo(1000, 0, 0.01, 12) - 1000 * 1.01 ** 12) < 1e-9);
});

t("aporteNecessario fecha o alvo", () => {
  const a = aporteNecessario(100000, 10000, 0.008, 60);
  const vf = valorFuturo(10000, a, 0.008, 60);
  assert.ok(Math.abs(vf - 100000) < 1, `vf=${vf}`);
});

t("aporteNecessario nunca negativo", () => {
  assert.equal(aporteNecessario(100, 99999, 0.01, 12), 0);
});

t("monteCarlo é determinístico com mesma seed", () => {
  const o = { pv: 10000, aporte: 500, retornoAnual: 0.1, volAnual: 0.15, meses: 60, caminhos: 300 };
  assert.deepEqual(monteCarlo(o), monteCarlo(o));
});

t("monteCarlo ordena percentis", () => {
  const r = monteCarlo({ pv: 10000, aporte: 500, retornoAnual: 0.1, volAnual: 0.15, meses: 60, caminhos: 500 });
  assert.ok(r.p10 <= r.p50 && r.p50 <= r.p90, JSON.stringify(r));
});

t("monteCarlo probabilidade entre 0 e 1", () => {
  const r = monteCarlo({ pv: 1000, aporte: 100, retornoAnual: 0.08, volAnual: 0.2, meses: 36, alvo: 5000, caminhos: 400 });
  assert.ok(r.probabilidade >= 0 && r.probabilidade <= 1);
});

t("tabela regressiva de IR", () => {
  assert.equal(aliquotaRegressiva(100), 0.225);
  assert.equal(aliquotaRegressiva(200), 0.2);
  assert.equal(aliquotaRegressiva(400), 0.175);
  assert.equal(aliquotaRegressiva(900), 0.15);
});

t("avalanche ordena por taxa", () => {
  const d = [{ saldo: 100, taxa_mensal: 0.02 }, { saldo: 50, taxa_mensal: 0.09 }];
  assert.equal(ordenarDividas(d, "avalanche")[0].taxa_mensal, 0.09);
  assert.equal(ordenarDividas(d, "bola_de_neve")[0].saldo, 50);
});

t("ordenarDividas não muta a entrada", () => {
  const d = [{ saldo: 100, taxa_mensal: 0.02 }, { saldo: 50, taxa_mensal: 0.09 }];
  ordenarDividas(d, "avalanche");
  assert.equal(d[0].saldo, 100);
});

t("mesesAte no passado é 0", () => {
  assert.equal(mesesAte("2000-01-01"), 0);
});

// ---------- engine ----------
const USER_CLT = { id: 1, nome: "x", dependentes: 0, estabilidade_renda: "clt", declaracao_ir: "simplificada" };
const USER_AUT = { id: 2, nome: "y", dependentes: 2, estabilidade_renda: "autonomo", declaracao_ir: "completa" };
const PERFIL = {
  classificacao: "moderado", score: 50, tolerancia_perda_pct: 20,
  horizonte_meses: 120, restricoes: "[]", data_aplicacao: new Date().toISOString().slice(0, 10),
};
const SIT_OK = {
  renda_mensal: 1000000, despesa_mensal: 600000, custo_essencial: 500000,
  capacidade_aporte: 400000, reserva_atual: 1500000, possui_seguro_vida: 1, possui_plano_saude: 1,
};

t("reserva: CLT sem dependente = 3 meses", () => {
  assert.equal(mesesReservaExigidos(USER_CLT), 3);
});

t("reserva: autônomo com dependentes = 9 meses", () => {
  assert.equal(mesesReservaExigidos(USER_AUT), 9);
});

t("metaRetornoMensal cresce com o perfil", () => {
  const c = metaRetornoMensal({ ...PERFIL, classificacao: "conservador" }, 0.14);
  const a = metaRetornoMensal({ ...PERFIL, classificacao: "arrojado" }, 0.14);
  assert.ok(a > c);
});

t("gates aprovam situação saudável", () => {
  const r = avaliarGates(USER_CLT, SIT_OK, [], PERFIL, 0.14);
  assert.equal(r.liberado, true, JSON.stringify(r.gates));
});

t("RN01: dívida cara bloqueia", () => {
  const r = avaliarGates(USER_CLT, SIT_OK, [{ id: 1, tipo: "cartao", saldo: 100000, taxa_mensal: 0.12, parcela: 1, parcelas_restantes: 6 }], PERFIL, 0.14);
  assert.equal(r.liberado, false);
  assert.equal(r.primeiroAberto.n, 2);
});

t("dívida barata não bloqueia", () => {
  const r = avaliarGates(USER_CLT, SIT_OK, [{ id: 1, tipo: "financiamento_imovel", saldo: 100000, taxa_mensal: 0.006, parcela: 1, parcelas_restantes: 200 }], PERFIL, 0.14);
  assert.equal(r.liberado, true);
});

t("RN02/RN03: reserva insuficiente bloqueia", () => {
  const r = avaliarGates(USER_CLT, { ...SIT_OK, reserva_atual: 100000 }, [], PERFIL, 0.14);
  assert.equal(r.primeiroAberto.n, 3);
});

t("fluxo negativo bloqueia primeiro", () => {
  const r = avaliarGates(USER_CLT, { ...SIT_OK, despesa_mensal: 1200000, reserva_atual: 0 }, [], PERFIL, 0.14);
  assert.equal(r.primeiroAberto.n, 1);
});

t("RN06: suitability vencido bloqueia", () => {
  const r = avaliarGates(USER_CLT, SIT_OK, [], { ...PERFIL, data_aplicacao: "2019-01-01" }, 0.14);
  assert.equal(r.liberado, false);
  assert.ok(r.gates[4].aprovado === false);
});

t("gate 4 não bloqueia", () => {
  const r = avaliarGates(USER_AUT, { ...SIT_OK, reserva_atual: 99999999, possui_seguro_vida: 0 }, [], PERFIL, 0.14);
  assert.equal(r.gates[3].aprovado, false);
  assert.equal(r.liberado, true);
});

t("alocação soma 100%", () => {
  for (const p of ["conservador", "moderado", "arrojado"]) {
    const { faixas } = alocacaoAlvo({ ...PERFIL, classificacao: p }, 120, 0.1);
    const soma = Object.values(faixas).reduce((s, f) => s + f.alvo, 0);
    assert.ok(Math.abs(soma - 100) < 0.5, `${p} somou ${soma}`);
  }
});

t("RN04: horizonte < 24m zera renda variável", () => {
  const { faixas } = alocacaoAlvo({ ...PERFIL, classificacao: "arrojado" }, 12, 0.1);
  assert.equal(faixas.acao.alvo, 0);
  assert.equal(faixas.fii.alvo, 0);
  assert.equal(faixas.exterior.alvo, 0);
});

t("arrojado tem mais risco que conservador", () => {
  const risco = (p) => {
    const { faixas } = alocacaoAlvo({ ...PERFIL, classificacao: p, tolerancia_perda_pct: 90 }, 240, 0.05);
    return faixas.acao.alvo + faixas.fii.alvo + faixas.exterior.alvo;
  };
  assert.ok(risco("arrojado") > risco("moderado"));
  assert.ok(risco("moderado") > risco("conservador"));
});

t("tolerância baixa corta renda variável", () => {
  const alta = alocacaoAlvo({ ...PERFIL, classificacao: "arrojado", tolerancia_perda_pct: 90 }, 240, 0.05).faixas;
  const baixa = alocacaoAlvo({ ...PERFIL, classificacao: "arrojado", tolerancia_perda_pct: 5 }, 240, 0.05).faixas;
  assert.ok(baixa.acao.alvo < alta.acao.alvo);
});

t("restrição sem_exterior zera a classe", () => {
  const { faixas } = alocacaoAlvo({ ...PERFIL, restricoes: '["sem_exterior"]' }, 240, 0.05);
  assert.equal(faixas.exterior.alvo, 0);
});

t("restrição inválida não quebra", () => {
  const { faixas } = alocacaoAlvo({ ...PERFIL, restricoes: "nao-e-json" }, 240, 0.05);
  assert.ok(faixas.acao.alvo >= 0);
});

t("faixas min<=alvo<=max", () => {
  const { faixas } = alocacaoAlvo(PERFIL, 120, 0.1);
  for (const [c, f] of Object.entries(faixas)) {
    assert.ok(f.min <= f.alvo && f.alvo <= f.max, `${c}: ${JSON.stringify(f)}`);
  }
});

t("RN08: rebalanceia por aporte, sem venda", () => {
  const { faixas } = alocacaoAlvo(PERFIL, 120, 0.05);
  const r = rebalancear([{ classe: "rf_pos", valor: 100000 }], faixas, 50000);
  assert.ok(r.viaAporte.length > 0);
  assert.ok(r.viaAporte.every((v) => v.valor > 0));
});

t("rebalancear com carteira vazia não quebra", () => {
  const { faixas } = alocacaoAlvo(PERFIL, 120, 0.05);
  const r = rebalancear([], faixas, 50000);
  assert.deepEqual(r.desvios, []);
});

t("aporte distribuído não excede o disponível", () => {
  const { faixas } = alocacaoAlvo(PERFIL, 120, 0.05);
  const r = rebalancear([{ classe: "rf_pos", valor: 100000 }], faixas, 50000);
  const soma = r.viaAporte.reduce((s, v) => s + v.valor, 0);
  assert.ok(soma <= 50000 + 2, `soma=${soma}`);
});

t("desvio alto sinaliza venda", () => {
  const { faixas } = alocacaoAlvo({ ...PERFIL, classificacao: "conservador" }, 240, 0.05);
  const r = rebalancear([{ classe: "acao", valor: 100000 }], faixas, 0);
  assert.equal(r.exigeVenda, true);
});

const baseRec = {
  usuario: USER_CLT, situacao: SIT_OK, dividas: [], objetivos: [], perfil: PERFIL,
  cdiAnual: 0.14, selicAnual: 0.1475, posicoes: [{ classe: "rf_pos", valor: 1000000 }],
  concentracaoEmissor: [],
};

t("RN09: toda recomendação tem justificativa", () => {
  const { recomendacoes } = gerarRecomendacoes(baseRec);
  assert.ok(recomendacoes.length > 0);
  for (const r of recomendacoes) {
    assert.ok(r.justificativa.length > 0, `${r.chave} sem justificativa`);
    assert.ok(r.titulo && r.acao, `${r.chave} incompleta`);
    assert.ok(r.seNaoSeguir, `${r.chave} sem cenário`);
  }
});

t("gates abertos impedem alocação", () => {
  const { recomendacoes, liberado } = gerarRecomendacoes({
    ...baseRec,
    dividas: [{ id: 1, tipo: "cartao", saldo: 500000, taxa_mensal: 0.13, parcela: 1000, parcelas_restantes: 10 }],
  });
  assert.equal(liberado, false);
  assert.equal(recomendacoes.some((r) => r.tipo === "alocacao"), false);
  assert.ok(recomendacoes.some((r) => r.chave.startsWith("gate2_divida")));
});

t("gates aprovados geram alocação", () => {
  const { recomendacoes, liberado } = gerarRecomendacoes(baseRec);
  assert.equal(liberado, true);
  assert.ok(recomendacoes.some((r) => r.tipo === "alocacao"));
});

t("bloqueantes vêm primeiro", () => {
  const { recomendacoes } = gerarRecomendacoes({
    ...baseRec,
    situacao: { ...SIT_OK, reserva_atual: 0 },
  });
  assert.equal(recomendacoes[0].bloqueante, true);
});

t("RN07: FGC acima do teto alerta", () => {
  const { recomendacoes } = gerarRecomendacoes({
    ...baseRec,
    concentracaoEmissor: [{ emissor: "Banco X", valor: 30000000, fgc: true }],
  });
  assert.ok(recomendacoes.some((r) => r.chave.startsWith("fgc_")));
});

t("RN07: abaixo do teto não alerta", () => {
  const { recomendacoes } = gerarRecomendacoes({
    ...baseRec,
    concentracaoEmissor: [{ emissor: "Banco X", valor: 1000000, fgc: true }],
  });
  assert.equal(recomendacoes.some((r) => r.chave.startsWith("fgc_")), false);
});

t("RN14: PGBL só na declaração completa", () => {
  const sem = gerarRecomendacoes(baseRec);
  assert.equal(sem.recomendacoes.some((r) => r.chave === "pgbl"), false);
  const com = gerarRecomendacoes({ ...baseRec, usuario: { ...USER_CLT, declaracao_ir: "completa" } });
  const pgbl = com.recomendacoes.find((r) => r.chave === "pgbl");
  assert.ok(pgbl);
  assert.equal(pgbl.valor, Math.round(SIT_OK.renda_mensal * 12 * 0.12));
});

t("objetivo inalcançável gera recomendação com gap", () => {
  const { recomendacoes } = gerarRecomendacoes({
    ...baseRec,
    objetivos: [{
      id: 9, nome: "Casa", tipo: "imovel", valor_alvo: 50000000, data_alvo: "2029-01-01",
      valor_atual: 0, aporte_mensal: 10000, prioridade: 2, flexivel: 1, status: "ativo",
    }],
  });
  const r = recomendacoes.find((x) => x.chave === "objetivo_9");
  assert.ok(r && r.valor > 0);
});

t("objetivo folgado não gera recomendação", () => {
  const { recomendacoes } = gerarRecomendacoes({
    ...baseRec,
    objetivos: [{
      id: 8, nome: "Viagem", tipo: "viagem", valor_alvo: 100000, data_alvo: "2030-01-01",
      valor_atual: 100000, aporte_mensal: 50000, prioridade: 3, flexivel: 1, status: "ativo",
    }],
  });
  assert.equal(recomendacoes.some((x) => x.chave === "objetivo_8"), false);
});

t("chaves de recomendação são únicas", () => {
  const { recomendacoes } = gerarRecomendacoes({
    ...baseRec,
    usuario: USER_AUT,
    dividas: [
      { id: 1, tipo: "cartao", saldo: 500000, taxa_mensal: 0.13, parcela: 1000, parcelas_restantes: 10 },
      { id: 2, tipo: "pessoal", saldo: 300000, taxa_mensal: 0.05, parcela: 800, parcelas_restantes: 12 },
    ],
    concentracaoEmissor: [{ emissor: "Banco X", valor: 30000000, fgc: true }],
  });
  const chaves = recomendacoes.map((r) => r.chave);
  assert.equal(new Set(chaves).size, chaves.length);
});

console.log(`\nself-check: ${ok} passaram, ${falhas.length} falharam`);
if (falhas.length) {
  for (const f of falhas) console.error(`  FALHA  ${f}`);
  process.exit(1);
}
