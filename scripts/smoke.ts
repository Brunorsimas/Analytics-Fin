/**
 * Smoke de integração contra o Neon real + motor rodando sobre os perfis demo.
 * Uso: node .selfcheck/scripts/smoke.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function carregarEnv() {
  for (const arquivo of [".env.local", ".env"]) {
    try {
      const txt = readFileSync(join(process.cwd(), arquivo), "utf8");
      for (const linha of txt.split("\n")) {
        const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* ausente */
    }
  }
}
// DATABASE_URL precisa existir antes de qualquer import do módulo neon.
carregarEnv();

import { ativos, indicadores, perfilDemo, perfisDemo, serieIndicador } from "../src/lib/neon";
import { alocacaoAlvo, avaliarGates, gerarRecomendacoes, TETO_FGC } from "../src/lib/engine";
import { completo, pendencias, usuarioDe, type PerfilLocal } from "../src/lib/perfilLocal";
import { mesesAte } from "../src/lib/calc";
import { cotar, indicadoresAoVivo } from "../src/lib/cotacao";
import { procurarTitulo, tesouro } from "../src/lib/tesouro";
import { avaliarAtivo, dicasEconomia } from "../src/lib/dicas";
import type { Classe as ClasseTicker } from "../src/lib/ticker";

let ok = 0;
const falhas: string[] = [];
async function t(nome: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    ok++;
  } catch (e) {
    falhas.push(`${nome}: ${(e as Error).message}`);
  }
}

async function main() {
// ---------- Neon: dados de referência ----------
const ind = await indicadores();

await t("Neon: indicadores retornam valores plausíveis", () => {
  assert.ok(ind.cdiAnual > 0 && ind.cdiAnual < 1, `cdi=${ind.cdiAnual}`);
  assert.ok(ind.selicAnual > 0 && ind.selicAnual < 1, `selic=${ind.selicAnual}`);
  assert.ok(ind.ipcaAnual > 0 && ind.ipcaAnual < 1, `ipca=${ind.ipcaAnual}`);
  assert.ok(ind.atualizadoEm.length >= 10, `data=${ind.atualizadoEm}`);
});

await t("Neon: nenhum indicador é NaN", () => {
  for (const [k, v] of Object.entries(ind)) {
    if (typeof v === "number") assert.ok(Number.isFinite(v), `${k}=${v}`);
  }
});

const listaAtivos = await ativos();

await t("Neon: ativos carregam", () => {
  assert.ok(listaAtivos.length >= 10, `${listaAtivos.length} ativos`);
});

await t("Neon: todo ativo tem preço finito e positivo", () => {
  for (const a of listaAtivos) {
    assert.ok(Number.isFinite(a.preco_atual) && a.preco_atual > 0, `${a.ticker}=${a.preco_atual}`);
    assert.ok(a.ticker.length > 0 && a.nome.length > 0, `${a.ticker} incompleto`);
    assert.ok(Number.isInteger(a.liquidez_dias), `${a.ticker} liquidez=${a.liquidez_dias}`);
    assert.equal(typeof a.fgc, "boolean", `${a.ticker} fgc não é boolean`);
  }
});

await t("Neon: classes de ativo são as esperadas", () => {
  const validas = new Set(["rf_pos", "rf_ipca", "rf_pre", "acao", "fii", "exterior"]);
  for (const a of listaAtivos) {
    assert.ok(validas.has(a.classe), `${a.ticker} com classe "${a.classe}"`);
  }
});

await t("Neon: série do IBOV tem histórico", async () => {
  const s = await serieIndicador("IBOV");
  assert.ok(s.length >= 12, `${s.length} pontos`);
  for (const p of s) assert.ok(Number.isFinite(p.valor) && p.valor > 0, `${p.data}=${p.valor}`);
});

await t("Neon: série do CDI mensal é plausível", async () => {
  const s = await serieIndicador("CDI_MENSAL");
  assert.ok(s.length >= 12);
  for (const p of s) assert.ok(p.valor > 0 && p.valor < 0.05, `${p.data}=${p.valor}`);
});

// ---------- Neon: perfis demo ----------
const demos = await perfisDemo();

await t("Neon: dois perfis demo existem", () => {
  assert.equal(demos.length, 2);
});

await t("Neon: perfis usam apenas o primeiro nome", () => {
  for (const d of demos) {
    assert.ok(!d.nome.includes(" "), `"${d.nome}" tem sobrenome`);
    assert.ok(d.nome.length >= 2, `"${d.nome}" curto demais`);
  }
});

await t("Neon: slug bate com o nome em minúsculo", () => {
  for (const d of demos) {
    assert.equal(d.slug, d.nome.toLowerCase());
  }
});

for (const d of demos) {
  const p = d.payload as PerfilLocal;

  await t(`[${d.nome}] payload é um perfil completo (RN13)`, () => {
    assert.equal(completo(p), true, `pendências: ${JSON.stringify(pendencias(p))}`);
  });

  await t(`[${d.nome}] nome do payload bate com o da tabela`, () => {
    assert.equal(p.nome, d.nome);
  });

  await t(`[${d.nome}] valores monetários são inteiros (centavos)`, () => {
    const s = p.situacao;
    for (const [k, v] of Object.entries(s)) {
      assert.ok(Number.isInteger(v), `situacao.${k} = ${v} não é inteiro`);
    }
    for (const dv of p.dividas) {
      assert.ok(Number.isInteger(dv.saldo), `dívida ${dv.id} saldo=${dv.saldo}`);
      assert.ok(Number.isInteger(dv.parcela), `dívida ${dv.id} parcela=${dv.parcela}`);
    }
    for (const o of p.objetivos) {
      assert.ok(Number.isInteger(o.valor_alvo), `objetivo ${o.id} alvo=${o.valor_alvo}`);
    }
  });

  await t(`[${d.nome}] taxas de dívida são decimais mensais plausíveis`, () => {
    for (const dv of p.dividas) {
      assert.ok(dv.taxa_mensal > 0 && dv.taxa_mensal < 0.5, `${dv.tipo} taxa=${dv.taxa_mensal}`);
      assert.ok(dv.parcelas_restantes > 0, `${dv.tipo} parcelas=${dv.parcelas_restantes}`);
    }
  });

  await t(`[${d.nome}] objetivos têm data futura ou status atingido`, () => {
    for (const o of p.objetivos) {
      if (o.status !== "ativo") continue;
      assert.ok(mesesAte(o.data_alvo) >= 0, `${o.nome} data=${o.data_alvo}`);
    }
  });

  const gates = avaliarGates(usuarioDe(p), p.situacao, p.dividas, p.perfil, ind.cdiAnual);

  await t(`[${d.nome}] gates avaliam sem erro`, () => {
    assert.equal(gates.gates.length, 5);
    assert.deepEqual(gates.gates.map((g) => g.n), [1, 2, 3, 4, 5]);
    assert.equal(gates.liberado, gates.primeiroAberto === null);
  });

  const total = p.posicoes.reduce((acc, x) => acc + x.valor, 0);
  const posicoes = total > 0 ? [{ classe: "rf_pos" as const, valor: total }] : [];

  const { recomendacoes, liberado } = gerarRecomendacoes({
    usuario: usuarioDe(p),
    situacao: p.situacao,
    dividas: p.dividas,
    objetivos: p.objetivos,
    perfil: p.perfil,
    cdiAnual: ind.cdiAnual,
    selicAnual: ind.selicAnual,
    posicoes,
    concentracaoEmissor: [],
  });

  await t(`[${d.nome}] gera recomendações`, () => {
    assert.ok(recomendacoes.length > 0);
  });

  await t(`[${d.nome}] toda recomendação é auditável (RN09/RN10)`, () => {
    for (const r of recomendacoes) {
      assert.ok(r.justificativa.length > 0, `${r.chave} sem justificativa`);
      assert.ok(r.seNaoSeguir.length > 10, `${r.chave} sem cenário`);
      assert.ok(r.titulo.length > 0 && r.acao.length > 0, `${r.chave} incompleta`);
      for (const f of r.justificativa) {
        assert.ok(!/NaN|Infinity|undefined/.test(f.dado), `${r.chave}: "${f.dado}"`);
      }
      if (r.valor !== undefined) {
        assert.ok(Number.isFinite(r.valor), `${r.chave}: valor=${r.valor}`);
      }
    }
  });

  await t(`[${d.nome}] chaves de recomendação são únicas`, () => {
    const ch = recomendacoes.map((r) => r.chave);
    assert.equal(new Set(ch).size, ch.length, `duplicadas: ${ch}`);
  });

  await t(`[${d.nome}] alocação existe se e somente se liberado`, () => {
    assert.equal(recomendacoes.some((r) => r.tipo === "alocacao"), liberado);
  });

  await t(`[${d.nome}] alocação soma 100% e respeita faixas`, () => {
    const horizonte = Math.max(
      p.perfil.horizonte_meses,
      ...p.objetivos.filter((o) => o.status === "ativo").map((o) => mesesAte(o.data_alvo)),
      0,
    );
    const { faixas } = alocacaoAlvo(p.perfil, horizonte, ind.selicAnual);
    const soma = Object.values(faixas).reduce((acc, f) => acc + f.alvo, 0);
    assert.ok(Math.abs(soma - 100) < 0.5, `somou ${soma}`);
    for (const [c, f] of Object.entries(faixas)) {
      assert.ok(f.min <= f.alvo && f.alvo <= f.max, `${c}: ${JSON.stringify(f)}`);
      assert.ok(Number.isFinite(f.alvo), `${c} alvo=${f.alvo}`);
    }
  });

  await t(`[${d.nome}] PGBL respeita o tipo de declaração (RN14)`, () => {
    const tem = recomendacoes.some((r) => r.chave === "pgbl");
    assert.equal(tem, p.declaracao_ir === "completa" && liberado);
  });
}

// ---------- cenários esperados ----------
await t("Ana está bloqueada no gate 2 (dívida cara)", async () => {
  const d = await perfilDemo("ana");
  assert.ok(d, "perfil ana ausente");
  const p = d!.payload as PerfilLocal;
  const g = avaliarGates(usuarioDe(p), p.situacao, p.dividas, p.perfil, ind.cdiAnual);
  assert.equal(g.liberado, false);
  assert.equal(g.primeiroAberto!.n, 2);
});

await t("Bruno está liberado para investir", async () => {
  const d = await perfilDemo("bruno");
  assert.ok(d, "perfil bruno ausente");
  const p = d!.payload as PerfilLocal;
  const g = avaliarGates(usuarioDe(p), p.situacao, p.dividas, p.perfil, ind.cdiAnual);
  assert.equal(g.liberado, true, JSON.stringify(g.gates.filter((x) => !x.aprovado)));
});

await t("perfilDemo com slug inexistente devolve null", async () => {
  assert.equal(await perfilDemo("nao-existe"), null);
});

await t("teto do FGC está correto em centavos", () => {
  assert.equal(TETO_FGC, 25_000_000);
});

// ---------- cotações em tempo real ----------
await t("cotação real de PETR4 chega com preço válido", async () => {
  const c = await cotar("PETR4");
  if (!c) {
    console.warn("    (fonte indisponível no momento; asserções de conteúdo puladas)");
    return;
  }
  assert.ok(Number.isFinite(c.preco) && c.preco > 0, `preço=${c.preco}`);
  assert.equal(c.ticker, "PETR4");
  assert.equal(c.moeda, "BRL");
  assert.equal(c.classe, "acao");
  assert.ok(c.nome.length > 0, "sem nome");
  assert.ok(c.fonte.length > 0, "sem fonte");
});

await t("cotação real de FII é classificada", async () => {
  const c = await cotar("MXRF11");
  // Rede é dependência externa: indisponibilidade não é falha de código.
  // O que não pode é retornar dado inválido.
  if (!c) {
    console.warn("    (fonte indisponível no momento; asserções de conteúdo puladas)");
    return;
  }
  assert.ok(["fii", "etf"].includes(c.classe), `classe=${c.classe}`);
  assert.ok(c.preco > 0, `preço=${c.preco}`);
  assert.ok(c.nome.length > 0, "sem nome");
});

await t("ticker inexistente devolve null", async () => {
  assert.equal(await cotar("ZZZZ99"), null);
});

await t("ticker malformado devolve null sem chamar a rede", async () => {
  for (const t of ["", "XX", "'; DROP TABLE--", "../etc/passwd", "http://x"]) {
    assert.equal(await cotar(t), null, `aceitou "${t}"`);
  }
});

await t("cache evita segunda chamada de rede", async () => {
  const primeira = await cotar("PETR4");
  if (!primeira) return;
  const inicio = Date.now();
  await cotar("PETR4");
  const decorrido = Date.now() - inicio;
  assert.ok(decorrido < 300, `demorou ${decorrido}ms, cache não funcionou`);
});

await t("nenhum campo numérico da cotação é NaN", async () => {
  const c = await cotar("ITUB4");
  if (!c) {
    console.warn("    (fonte indisponível no momento)");
    return;
  }
  for (const campo of ["preco", "variacaoPct", "fechamentoAnterior", "minimo52s", "maximo52s"] as const) {
    const v = c[campo];
    if (v !== null) assert.ok(Number.isFinite(v), `${campo}=${v}`);
  }
});

// ---------- indicadores do Banco Central ----------
const vivos = await indicadoresAoVivo();

await t("Banco Central responde com Selic plausível", () => {
  assert.ok(vivos.selicAnual > 0 && vivos.selicAnual < 0.5, `selic=${vivos.selicAnual}`);
});

await t("CDI fica próximo da Selic", () => {
  assert.ok(
    Math.abs(vivos.cdiAnual - vivos.selicAnual) < 0.03,
    `cdi=${vivos.cdiAnual} selic=${vivos.selicAnual}`,
  );
});

await t("IPCA plausível", () => {
  assert.ok(vivos.ipcaAnual >= 0 && vivos.ipcaAnual < 0.5, `ipca=${vivos.ipcaAnual}`);
});

await t("indicadores ao vivo não têm NaN", () => {
  for (const k of ["selicAnual", "cdiAnual", "ipcaAnual"] as const) {
    assert.ok(Number.isFinite(vivos[k]), `${k}=${vivos[k]}`);
  }
});

// ---------- carteira dos perfis demo ----------
for (const d of demos) {
  const p = d.payload as PerfilLocal;
  if (p.posicoes.length === 0) continue;

  await t(`[${d.nome}] posições têm ticker, classe e valor íntegros`, () => {
    for (const pos of p.posicoes) {
      assert.ok(pos.ticker.length > 0, "ticker vazio");
      assert.ok(Number.isInteger(pos.valor) && pos.valor > 0, `${pos.ticker} valor=${pos.valor}`);
      assert.ok(pos.classe, `${pos.ticker} sem classe`);
      if (pos.quantidade !== undefined) {
        assert.ok(pos.quantidade > 0, `${pos.ticker} qtd=${pos.quantidade}`);
      }
      if (pos.precoMedio !== undefined) {
        assert.ok(pos.precoMedio > 0, `${pos.ticker} pm=${pos.precoMedio}`);
      }
    }
  });

  await t(`[${d.nome}] valor da posição bate com quantidade x preço médio`, () => {
    for (const pos of p.posicoes) {
      if (!pos.quantidade || !pos.precoMedio) continue;
      const investido = pos.quantidade * pos.precoMedio * 100;
      // Valor de mercado difere do investido, mas deve estar na mesma ordem.
      assert.ok(
        pos.valor > investido * 0.2 && pos.valor < investido * 5,
        `${pos.ticker}: valor=${pos.valor} investido=${investido}`,
      );
    }
  });

  await t(`[${d.nome}] avaliação de cada ativo não quebra`, () => {
    const g = avaliarGates(usuarioDe(p), p.situacao, p.dividas, p.perfil, ind.cdiAnual);
    for (const pos of p.posicoes) {
      const a = avaliarAtivo(
        (pos.classe as ClasseTicker) ?? "desconhecida",
        p.perfil,
        g.liberado,
        p.perfil.horizonte_meses,
      );
      assert.ok(a.pontos.length > 0, `${pos.ticker} sem pontos`);
      const txt = [...a.pontos, ...a.alertas, ...a.bloqueios].join(" ");
      assert.ok(!/NaN|Infinity|undefined/.test(txt), `${pos.ticker}: "${txt}"`);
    }
  });

  await t(`[${d.nome}] dicas de economia são íntegras`, () => {
    for (const dica of dicasEconomia(p)) {
      assert.ok(dica.titulo.length > 0 && dica.texto.length > 0, `${dica.chave} incompleta`);
      assert.ok(dica.base.length > 0, `${dica.chave} sem base`);
      assert.ok(
        !/NaN|Infinity|undefined/.test(dica.texto + dica.base),
        `${dica.chave} com valor inválido`,
      );
    }
  });
}

// ---------- títulos públicos no Neon ----------
const snapTesouro = await tesouro();

await t("Neon: títulos públicos carregam", () => {
  assert.ok(snapTesouro, "nada retornado");
  assert.ok(snapTesouro!.titulos.length >= 20, `${snapTesouro!.titulos.length} títulos`);
});

await t("Neon: datas em ISO, não no formato do objeto Date", () => {
  if (!snapTesouro) return;
  // Regressão: `String(date)` produzia "Tue Oct 27 2026", quebrando a busca.
  assert.ok(
    /^\d{4}-\d{2}-\d{2}$/.test(snapTesouro.dataBase),
    `dataBase fora do padrão ISO: "${snapTesouro.dataBase}"`,
  );
  for (const t2 of snapTesouro.titulos) {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(t2.vencimento), `vencimento: "${t2.vencimento}"`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(t2.dataBase), `dataBase: "${t2.dataBase}"`);
  }
});

await t("Neon: curva tem vértices nos dois lados", () => {
  if (!snapTesouro) return;
  assert.ok(snapTesouro.curva.nominal.length >= 3, `nominal=${snapTesouro.curva.nominal.length}`);
  assert.ok(snapTesouro.curva.real.length >= 3, `real=${snapTesouro.curva.real.length}`);
});

await t("Neon: taxas plausíveis e sem NaN", () => {
  if (!snapTesouro) return;
  for (const v of [...snapTesouro.curva.nominal, ...snapTesouro.curva.real]) {
    assert.ok(Number.isFinite(v.taxa) && v.taxa > 0 && v.taxa < 0.5, `taxa=${v.taxa}`);
    assert.ok(Number.isFinite(v.prazoAnos) && v.prazoAnos > 0, `prazo=${v.prazoAnos}`);
  }
});

await t("Neon: busca por título funciona", () => {
  if (!snapTesouro) return;
  for (const q of ["ipca+ 2035", "prefixado 2028", "tesouro selic 2029"]) {
    const r = procurarTitulo(snapTesouro.titulos, q);
    assert.ok(r.length > 0, `"${q}" não encontrou nada`);
  }
});

await t("Neon: PU em centavos inteiros e positivos", () => {
  if (!snapTesouro) return;
  for (const t2 of snapTesouro.titulos) {
    assert.ok(Number.isInteger(t2.puCompra) && t2.puCompra > 0, `${t2.nome}: PU=${t2.puCompra}`);
    assert.ok(t2.taxaCompra >= 0 && t2.taxaCompra < 0.5, `${t2.nome}: taxa=${t2.taxaCompra}`);
  }
});

await t("Bruno tem carteira detalhada por ativo", async () => {
  const d = await perfilDemo("bruno");
  const p = d!.payload as PerfilLocal;
  assert.ok(p.posicoes.length >= 5, `${p.posicoes.length} posições`);
  assert.ok(p.posicoes.every((x) => x.quantidade && x.precoMedio), "faltam detalhes");
  const classes = new Set(p.posicoes.map((x) => x.classe));
  assert.ok(classes.size >= 2, `só ${classes.size} classe(s)`);
});

console.log(`\nsmoke Neon: ${ok} passaram, ${falhas.length} falharam`);
if (falhas.length) {
  for (const f of falhas) console.error(`  FALHA  ${f}`);
  process.exit(1);
}
}

main().catch((e) => {
  console.error("smoke falhou:", (e as Error).message);
  process.exit(1);
});
