import assert from "node:assert/strict";
import { classificarTicker, normalizarTicker } from "../src/lib/ticker";
import { AVISO_DECISAO, avaliarAtivo, dicasEconomia } from "../src/lib/dicas";
import {
  aplicarCotacao,
  descreverCotacao,
  estadoInicial,
  iniciarConsulta,
  responder,
  type CotacaoLeve,
  type Estado,
} from "../src/lib/conversa";
import { perfilVazio, type PerfilLocal } from "../src/lib/perfilLocal";
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

// ---------- normalizarTicker ----------
t("ticker: ação simples", () => assert.equal(normalizarTicker("PETR4"), "PETR4"));
t("ticker: minúsculo normaliza", () => assert.equal(normalizarTicker("petr4"), "PETR4"));
t("ticker: com espaço", () => assert.equal(normalizarTicker("  itub4 "), "ITUB4"));
t("ticker: sufixo .SA removido", () => assert.equal(normalizarTicker("PETR4.SA"), "PETR4"));
t("ticker: FII de 2 dígitos", () => assert.equal(normalizarTicker("MXRF11"), "MXRF11"));
t("ticker: curto demais rejeita", () => assert.equal(normalizarTicker("PET4"), null));
t("ticker: sem número rejeita", () => assert.equal(normalizarTicker("PETRO"), null));
t("ticker: 3 dígitos rejeita", () => assert.equal(normalizarTicker("PETR123"), null));
t("ticker: vazio rejeita", () => assert.equal(normalizarTicker(""), null));
t("ticker: injeção rejeitada", () => assert.equal(normalizarTicker("'; DROP TABLE--"), null));
t("ticker: path traversal rejeitado", () => assert.equal(normalizarTicker("../../etc"), null));
t("ticker: URL rejeitada", () => assert.equal(normalizarTicker("http://x.com"), null));

// ---------- classificarTicker ----------
t("classe: 3 e 4 são ação", () => {
  assert.equal(classificarTicker("PETR4"), "acao");
  assert.equal(classificarTicker("WEGE3"), "acao");
});
t("classe: 11 é FII por padrão", () => assert.equal(classificarTicker("MXRF11"), "fii"));
t("classe: 34 é BDR", () => assert.equal(classificarTicker("AAPL34"), "bdr"));

// ---------- avaliarAtivo ----------
const PERFIL_BASE: Perfil = {
  classificacao: "moderado", score: 50, tolerancia_perda_pct: 20,
  horizonte_meses: 120, restricoes: "[]", data_aplicacao: "2026-01-01",
};

t("avaliar: gate aberto bloqueia renda variável", () => {
  const a = avaliarAtivo("acao", PERFIL_BASE, false, 120);
  assert.equal(a.adequado, false);
  assert.ok(a.bloqueios.some((x) => /gate/i.test(x)));
});

t("avaliar: horizonte curto bloqueia renda variável (RN04)", () => {
  const a = avaliarAtivo("acao", PERFIL_BASE, true, 12);
  assert.equal(a.adequado, false);
  assert.ok(a.bloqueios.some((x) => /horizonte/i.test(x)));
});

t("avaliar: horizonte longo e gates ok libera", () => {
  const a = avaliarAtivo("acao", PERFIL_BASE, true, 120);
  assert.equal(a.adequado, true);
  assert.equal(a.bloqueios.length, 0);
});

t("avaliar: conservador em renda variável gera alerta, não bloqueio", () => {
  const a = avaliarAtivo("acao", { ...PERFIL_BASE, classificacao: "conservador" }, true, 120);
  assert.equal(a.adequado, true);
  assert.ok(a.alertas.length > 0);
});

t("avaliar: restrição sem_acoes bloqueia ação", () => {
  const a = avaliarAtivo("acao", { ...PERFIL_BASE, restricoes: '["sem_acoes"]' }, true, 120);
  assert.equal(a.adequado, false);
});

t("avaliar: restrição sem_fii bloqueia FII", () => {
  const a = avaliarAtivo("fii", { ...PERFIL_BASE, restricoes: '["sem_fii"]' }, true, 120);
  assert.equal(a.adequado, false);
});

t("avaliar: FII menciona isenção e os 20% na venda", () => {
  const a = avaliarAtivo("fii", PERFIL_BASE, true, 120);
  const txt = a.pontos.join(" ");
  assert.ok(/isent/i.test(txt), "isenção ausente");
  assert.ok(/20%/.test(txt), "tributação da venda ausente");
});

t("avaliar: ação menciona 20 mil e 15%", () => {
  const txt = avaliarAtivo("acao", PERFIL_BASE, true, 120).pontos.join(" ");
  assert.ok(/20 mil/i.test(txt) && /15%/.test(txt));
});

t("avaliar: ETF menciona diversificação e taxa", () => {
  const txt = avaliarAtivo("etf", PERFIL_BASE, true, 120).pontos.join(" ");
  assert.ok(/diversifica/i.test(txt) && /taxa/i.test(txt));
});

t("avaliar: BDR menciona câmbio", () => {
  const txt = avaliarAtivo("bdr", PERFIL_BASE, true, 120).pontos.join(" ");
  assert.ok(/cambial|câmbio/i.test(txt));
});

t("avaliar: nunca diz comprar ou vender", () => {
  for (const c of ["acao", "fii", "etf", "bdr", "desconhecida"] as const) {
    for (const lib of [true, false]) {
      const a = avaliarAtivo(c, PERFIL_BASE, lib, 120);
      const txt = [...a.pontos, ...a.alertas, ...a.bloqueios].join(" ").toLowerCase();
      for (const proibido of ["compre", "venda agora", "recomendo comprar", "garantido", "lucro certo"]) {
        assert.ok(!txt.includes(proibido), `"${proibido}" apareceu em ${c}`);
      }
    }
  }
});

t("avaliar: restrições em JSON inválido não quebram", () => {
  const a = avaliarAtivo("acao", { ...PERFIL_BASE, restricoes: "nao-e-json" }, true, 120);
  assert.ok(Array.isArray(a.pontos));
});

t("aviso de decisão é curto e atribui responsabilidade", () => {
  assert.ok(AVISO_DECISAO.length < 200, "aviso longo demais");
  assert.ok(/decisão é sua/i.test(AVISO_DECISAO));
  assert.ok(/não é indicação/i.test(AVISO_DECISAO));
});

// ---------- dicasEconomia ----------
function perfilCom(over: Partial<PerfilLocal>): PerfilLocal {
  const base = perfilVazio("Teste");
  return {
    ...base,
    ...over,
    situacao: { ...base.situacao, ...(over.situacao ?? {}) },
  };
}

t("dica: déficit é detectado", () => {
  const d = dicasEconomia(
    perfilCom({ situacao: { ...perfilVazio().situacao, renda_mensal: 300000, despesa_mensal: 400000, custo_essencial: 250000 } }),
  );
  assert.ok(d.some((x) => x.chave === "deficit"));
});

t("dica: superávit não gera alerta de déficit", () => {
  const d = dicasEconomia(
    perfilCom({ situacao: { ...perfilVazio().situacao, renda_mensal: 800000, despesa_mensal: 400000, custo_essencial: 300000 } }),
  );
  assert.ok(!d.some((x) => x.chave === "deficit"));
});

t("dica: gasto não essencial alto é detectado", () => {
  const d = dicasEconomia(
    perfilCom({ situacao: { ...perfilVazio().situacao, renda_mensal: 1000000, despesa_mensal: 600000, custo_essencial: 300000 } }),
  );
  const dica = d.find((x) => x.chave === "nao_essencial");
  assert.ok(dica, "não detectou");
  assert.ok(dica!.impactoMensal! > 0);
});

t("dica: taxa de poupança baixa", () => {
  const d = dicasEconomia(
    perfilCom({ situacao: { ...perfilVazio().situacao, renda_mensal: 1000000, despesa_mensal: 950000, custo_essencial: 900000 } }),
  );
  assert.ok(d.some((x) => x.chave === "taxa_poupanca"));
});

t("dica: juros caros geram alerta com valor mensal", () => {
  const d = dicasEconomia(
    perfilCom({
      situacao: { ...perfilVazio().situacao, renda_mensal: 1000000, despesa_mensal: 500000, custo_essencial: 400000 },
      dividas: [{ id: 1, tipo: "cartao", saldo: 1000000, taxa_mensal: 0.12, parcela: 100000, parcelas_restantes: 12 }],
    }),
  );
  const dica = d.find((x) => x.chave === "juros_1");
  assert.ok(dica, "não detectou");
  assert.equal(dica!.impactoMensal, 120000);
});

t("dica: comprometimento acima de 30%", () => {
  const d = dicasEconomia(
    perfilCom({
      situacao: { ...perfilVazio().situacao, renda_mensal: 1000000, despesa_mensal: 500000, custo_essencial: 400000 },
      dividas: [{ id: 1, tipo: "consignado", saldo: 5000000, taxa_mensal: 0.018, parcela: 400000, parcelas_restantes: 20 }],
    }),
  );
  assert.ok(d.some((x) => x.chave === "comprometimento"));
});

t("dica: reserva excessiva é apontada", () => {
  const d = dicasEconomia(
    perfilCom({
      situacao: { ...perfilVazio().situacao, renda_mensal: 1000000, despesa_mensal: 500000, custo_essencial: 300000, reserva_atual: 9000000 },
    }),
  );
  assert.ok(d.some((x) => x.chave === "reserva_excesso"));
});

t("dica: reserva adequada não é apontada", () => {
  const d = dicasEconomia(
    perfilCom({
      situacao: { ...perfilVazio().situacao, renda_mensal: 1000000, despesa_mensal: 500000, custo_essencial: 300000, reserva_atual: 1800000 },
    }),
  );
  assert.ok(!d.some((x) => x.chave === "reserva_excesso"));
});

t("dica: dependentes sem seguro", () => {
  const d = dicasEconomia(
    perfilCom({
      dependentes: 2,
      situacao: { ...perfilVazio().situacao, renda_mensal: 1000000, despesa_mensal: 500000, custo_essencial: 400000, possui_seguro_vida: 0 },
    }),
  );
  assert.ok(d.some((x) => x.chave === "seguro"));
});

t("dica: toda dica cita a base e não tem valor inválido", () => {
  const d = dicasEconomia(
    perfilCom({
      dependentes: 1,
      situacao: { ...perfilVazio().situacao, renda_mensal: 500000, despesa_mensal: 600000, custo_essencial: 300000 },
      dividas: [{ id: 1, tipo: "cartao", saldo: 2000000, taxa_mensal: 0.13, parcela: 300000, parcelas_restantes: 10 }],
    }),
  );
  assert.ok(d.length > 0);
  for (const x of d) {
    assert.ok(x.base.length > 0, `${x.chave} sem base`);
    assert.ok(x.titulo.length > 0 && x.texto.length > 0, `${x.chave} incompleta`);
    assert.ok(!/NaN|Infinity|undefined/.test(x.texto + x.base), `${x.chave} com valor inválido`);
    if (x.impactoMensal !== undefined) {
      assert.ok(Number.isFinite(x.impactoMensal), `${x.chave} impacto=${x.impactoMensal}`);
    }
  }
});

t("dica: chaves são únicas", () => {
  const d = dicasEconomia(
    perfilCom({
      dependentes: 1,
      situacao: { ...perfilVazio().situacao, renda_mensal: 500000, despesa_mensal: 600000, custo_essencial: 300000 },
      dividas: [
        { id: 1, tipo: "cartao", saldo: 2000000, taxa_mensal: 0.13, parcela: 300000, parcelas_restantes: 10 },
        { id: 2, tipo: "pessoal", saldo: 500000, taxa_mensal: 0.06, parcela: 80000, parcelas_restantes: 8 },
      ],
    }),
  );
  const ch = d.map((x) => x.chave);
  assert.equal(new Set(ch).size, ch.length);
});

// ---------- fluxo de ativos na conversa ----------
const COT: CotacaoLeve = {
  ticker: "PETR4", nome: "Petróleo Brasileiro S.A.", preco: 52.79,
  variacaoPct: -2.02, minimo52s: 29.53, maximo52s: 59.79,
  classe: "acao", fonte: "Yahoo Finance", atualizadoEm: "2026-10-28T10:08:16.000Z",
};

function ate(passo: string, respostas: string[]): Estado {
  let st = estadoInicial();
  for (const r of respostas) st = responder(st, r).estado;
  assert.equal(st.passo, passo, `esperado ${passo}, obtido ${st.passo}`);
  return st;
}

const ATE_INVESTE = [
  "Maria", "8000", "5000", "3500", "CLT", "1", "12000",
  "não", "sim", "simplificada", "não",
];

t("conversa: chega no passo de investimentos", () => {
  ate("investe", ATE_INVESTE);
});

t("conversa: 'não' em investe pula para aporte", () => {
  const st = ate("investe", ATE_INVESTE);
  const r = responder(st, "não");
  assert.equal(r.estado.passo, "aporte");
  assert.equal(r.estado.perfil.posicoes.length, 0);
});

t("conversa: 'sim' pede o ticker", () => {
  const st = ate("investe", ATE_INVESTE);
  assert.equal(responder(st, "sim").estado.passo, "ativo_ticker");
});

t("conversa: ticker válido dispara busca", () => {
  let st = ate("investe", ATE_INVESTE);
  st = responder(st, "sim").estado;
  const r = responder(st, "PETR4");
  assert.equal(r.buscarCotacao, "PETR4");
});

t("conversa: ticker inválido não dispara busca", () => {
  let st = ate("investe", ATE_INVESTE);
  st = responder(st, "sim").estado;
  const r = responder(st, "xyz");
  assert.equal(r.erro, true);
  assert.equal(r.buscarCotacao, undefined);
  assert.equal(r.estado.passo, "ativo_ticker");
});

t("cotação aplicada avança para quantidade", () => {
  let st = ate("investe", ATE_INVESTE);
  st = responder(st, "sim").estado;
  st = responder(st, "PETR4").estado;
  const r = aplicarCotacao(st, "PETR4", COT);
  assert.equal(r.estado.passo, "ativo_quantidade");
  assert.equal(r.estado.rascunhoAtivo.cotacao?.ticker, "PETR4");
  assert.ok(r.mensagens.join(" ").includes("52,79"), "preço não exibido");
});

t("cotação nula mantém o passo e avisa", () => {
  let st = ate("investe", ATE_INVESTE);
  st = responder(st, "sim").estado;
  st = responder(st, "ZZZZ99").estado;
  const r = aplicarCotacao(st, "ZZZZ99", null);
  assert.equal(r.erro, true);
  assert.equal(r.estado.passo, "ativo_ticker");
});

t("ativo completo entra na carteira com valor de mercado", () => {
  let st = ate("investe", ATE_INVESTE);
  st = responder(st, "sim").estado;
  st = responder(st, "PETR4").estado;
  st = aplicarCotacao(st, "PETR4", COT).estado;
  st = responder(st, "100").estado;
  const r = responder(st, "40");
  const pos = r.estado.perfil.posicoes;
  assert.equal(pos.length, 1);
  assert.equal(pos[0].ticker, "PETR4");
  assert.equal(pos[0].quantidade, 100);
  assert.equal(pos[0].precoMedio, 40);
  assert.equal(pos[0].valor, Math.round(100 * 52.79 * 100));
  assert.equal(pos[0].classe, "acao");
});

t("resultado do ativo é calculado na mensagem", () => {
  let st = ate("investe", ATE_INVESTE);
  st = responder(st, "sim").estado;
  st = responder(st, "PETR4").estado;
  st = aplicarCotacao(st, "PETR4", COT).estado;
  st = responder(st, "100").estado;
  const r = responder(st, "40");
  const txt = r.mensagens.join(" ");
  // 100 × 52,79 = 5.279,00 contra 4.000,00 investidos = +1.279,00 (+32,0%)
  assert.ok(/1\.279,00/.test(txt), `resultado ausente: ${txt}`);
  assert.ok(/\+32,0%/.test(txt), `percentual ausente: ${txt}`);
});

t("preço médio zero não gera resultado falso", () => {
  let st = ate("investe", ATE_INVESTE);
  st = responder(st, "sim").estado;
  st = responder(st, "PETR4").estado;
  st = aplicarCotacao(st, "PETR4", COT).estado;
  st = responder(st, "100").estado;
  const r = responder(st, "0");
  assert.equal(r.estado.perfil.posicoes[0].precoMedio, undefined);
  assert.ok(!/Resultado/.test(r.mensagens.join(" ")));
});

t("quantidade inválida é rejeitada", () => {
  let st = ate("investe", ATE_INVESTE);
  st = responder(st, "sim").estado;
  st = responder(st, "PETR4").estado;
  st = aplicarCotacao(st, "PETR4", COT).estado;
  const r = responder(st, "zero");
  assert.equal(r.erro, true);
  assert.equal(r.estado.passo, "ativo_quantidade");
});

t("dois ativos acumulam na carteira", () => {
  let st = ate("investe", ATE_INVESTE);
  st = responder(st, "sim").estado;
  st = responder(st, "PETR4").estado;
  st = aplicarCotacao(st, "PETR4", COT).estado;
  st = responder(st, "100").estado;
  st = responder(st, "40").estado;
  st = responder(st, "sim").estado;
  st = responder(st, "MXRF11").estado;
  st = aplicarCotacao(st, "MXRF11", { ...COT, ticker: "MXRF11", nome: "Maxi Renda FII", preco: 9.02, classe: "fii" }).estado;
  st = responder(st, "1000").estado;
  const r = responder(st, "10");
  assert.equal(r.estado.perfil.posicoes.length, 2);
  assert.equal(r.estado.perfil.posicoes[1].classe, "fii");
});

t("'não' em ativo_mais segue para aporte", () => {
  let st = ate("investe", ATE_INVESTE);
  st = responder(st, "sim").estado;
  st = responder(st, "PETR4").estado;
  st = aplicarCotacao(st, "PETR4", COT).estado;
  st = responder(st, "100").estado;
  st = responder(st, "40").estado;
  assert.equal(responder(st, "não").estado.passo, "aporte");
});

// ---------- consulta avulsa ----------
t("consulta avulsa guarda o passo de retorno", () => {
  const st = ate("investe", ATE_INVESTE);
  const r = iniciarConsulta(st, "PETR4");
  assert.equal(r.estado.passo, "consulta");
  assert.equal(r.estado.retomarEm, "investe");
  assert.equal(r.buscarCotacao, "PETR4");
});

t("consulta não altera a carteira", () => {
  const st = ate("investe", ATE_INVESTE);
  const antes = JSON.stringify(st.perfil);
  const r = aplicarCotacao(iniciarConsulta(st, "PETR4").estado, "PETR4", COT);
  assert.equal(JSON.stringify(r.estado.perfil), antes);
  assert.equal(r.estado.passo, "consulta");
});

t("'não' na consulta retoma o passo anterior", () => {
  const st = ate("investe", ATE_INVESTE);
  let c = iniciarConsulta(st, "PETR4").estado;
  c = aplicarCotacao(c, "PETR4", COT).estado;
  const r = responder(c, "não");
  assert.equal(r.estado.passo, "investe");
  assert.equal(r.estado.retomarEm, undefined);
});

// ---------- descreverCotacao ----------
t("descrição traz preço, faixa e fonte", () => {
  const linhas = descreverCotacao(COT).join(" ");
  assert.ok(/PETR4/.test(linhas));
  assert.ok(/52,79/.test(linhas), "preço ausente");
  assert.ok(/-2,02%/.test(linhas), "variação ausente");
  assert.ok(/29,53/.test(linhas) && /59,79/.test(linhas), "faixa ausente");
  assert.ok(/Yahoo Finance/.test(linhas), "fonte ausente");
});

t("descrição sem faixa de 52 semanas não quebra", () => {
  const linhas = descreverCotacao({ ...COT, minimo52s: null, maximo52s: null }).join(" ");
  assert.ok(!/NaN|undefined|null/.test(linhas), linhas);
});

t("descrição sem variação não quebra", () => {
  const linhas = descreverCotacao({ ...COT, variacaoPct: null }).join(" ");
  assert.ok(!/NaN|undefined|null/.test(linhas), linhas);
});

t("descrição nunca sugere compra", () => {
  const linhas = descreverCotacao(COT).join(" ").toLowerCase();
  for (const p of ["compre", "boa oportunidade", "aproveite", "barato", "caro"]) {
    assert.ok(!linhas.includes(p), `"${p}" na descrição`);
  }
});

console.log(`\nativos self-check: ${ok} passaram, ${falhas.length} falharam`);
if (falhas.length) {
  for (const f of falhas) console.error(`  FALHA  ${f}`);
  process.exit(1);
}
