/**
 * Teste end-to-end real: navegador, chat, localStorage, recálculo.
 * Uso: node scripts/e2e.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3100";

let ok = 0;
const falhas = [];
async function t(nome, fn) {
  try {
    await fn();
    ok++;
    console.log(`  PASS  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e.message}`);
    console.error(`  FALHA ${nome}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ locale: "pt-BR" });
const pagina = await contexto.newPage();

let tesouroDisponivel = true;
const errosConsole = [];
pagina.on("console", (m) => {
  if (m.type() === "error") errosConsole.push(m.text());
});
pagina.on("pageerror", (e) => errosConsole.push(`pageerror: ${e.message}`));

/**
 * `esperar` é casado contra o ÚLTIMO balão, não contra o histórico inteiro:
 * a mesma pergunta pode já ter aparecido antes e passar o wait de imediato.
 */
async function responder(texto, esperar) {
  await enviarTexto(texto);
  await pagina
    .waitForFunction(
      (re) => {
        const ps = document.querySelectorAll('[role="log"] p');
        if (!ps.length) return false;
        const ultima = ps[ps.length - 1].textContent ?? "";
        return re ? new RegExp(re, "i").test(ultima) : !ultima.includes("…");
      },
      esperar ?? null,
      { timeout: 30000 },
    )
    .catch(() => {});
  await pagina.waitForTimeout(100);
}

async function conversa() {
  return pagina.locator('[role="log"]').innerText();
}

/**
 * Digita e envia garantindo que o React registrou o valor.
 * `fill` sozinho pode perder a corrida com o re-render que limpa o campo.
 */
async function enviarTexto(texto) {
  await pagina.waitForFunction(
    () => {
      const el = document.querySelector("#resposta");
      return el instanceof HTMLInputElement && !el.disabled;
    },
    { timeout: 25000 },
  );
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    await pagina.click("#resposta");
    await pagina.fill("#resposta", "");
    await pagina.type("#resposta", texto, { delay: 15 });
    const valor = await pagina.inputValue("#resposta");
    if (valor === texto) break;
    await pagina.waitForTimeout(200);
  }
  await pagina.click('button[type="submit"]');
}

console.log(`\ne2e em ${BASE}\n`);

await pagina.goto(BASE, { waitUntil: "networkidle" });

await t("página carrega com o assistente", async () => {
  await pagina.waitForSelector("#resposta", { timeout: 15000 });
  const txt = await conversa();
  assert(/como posso te chamar/i.test(txt), "primeira pergunta ausente");
});

await t("campo começa vazio e botão desabilitado", async () => {
  assert((await pagina.inputValue("#resposta")) === "", "campo não está vazio");
  assert(await pagina.isDisabled('button[type="submit"]'), "botão deveria estar desabilitado");
});

await t("entrada inválida mostra erro e não avança", async () => {
  await responder("12345");
  const txt = await conversa();
  assert(/não consegui identificar/i.test(txt), "mensagem de erro ausente");
  assert(/como posso te chamar/i.test(txt), "deveria repetir a pergunta");
});

await t("nome aceito avança para renda", async () => {
  await responder("Carla");
  const txt = await conversa();
  assert(/carla/i.test(txt), "nome não ecoou");
  assert(/quanto você recebe/i.test(txt), "não avançou para renda");
});

await t("renda formatada em reais", async () => {
  await responder("7.500");
  const txt = await conversa();
  assert(/7\.500,00/.test(txt), `valor não formatado: ${txt.slice(-200)}`);
});

await t("sobra mensal calculada corretamente", async () => {
  await responder("4800");
  const txt = await conversa();
  assert(/2\.700,00/.test(txt), `sobra errada (esperado 2.700,00): ${txt.slice(-200)}`);
});

await t("essencial maior que despesa é rejeitado", async () => {
  await responder("9000");
  const txt = await conversa();
  assert(/não pode passar/i.test(txt), "validação não disparou");
});

await t("fluxo continua após correção", async () => {
  await responder("3200");
  const txt = await conversa();
  assert(/clt|autônoma|variável/i.test(txt), "não avançou para estabilidade");
});

await t("cobertura da reserva em meses", async () => {
  await responder("CLT");
  await responder("nenhuma");
  await responder("16000");
  const txt = await conversa();
  assert(/5\.0 meses/i.test(txt), `cobertura errada (esperado 5.0): ${txt.slice(-250)}`);
});

await t("API de cotação responde com preço real", async () => {
  const r = await pagina.evaluate(async (base) => {
    const resp = await fetch(`${base}/api/cotacao?ticker=PETR4`);
    return { status: resp.status, body: await resp.json() };
  }, BASE);
  assert(r.status === 200, `status ${r.status}`);
  assert(typeof r.body.preco === "number" && r.body.preco > 0, `preço=${r.body.preco}`);
  assert(r.body.ticker === "PETR4", `ticker=${r.body.ticker}`);
  assert(r.body.classe === "acao", `classe=${r.body.classe}`);
});

await t("API rejeita ticker malformado com 400", async () => {
  const r = await pagina.evaluate(async (base) => {
    const resp = await fetch(`${base}/api/cotacao?ticker=../etc/passwd`);
    return resp.status;
  }, BASE);
  assert(r === 400, `status ${r}`);
});

await t("API devolve 404 para ticker inexistente", async () => {
  const r = await pagina.evaluate(async (base) => {
    const resp = await fetch(`${base}/api/cotacao?ticker=ZZZZ99`);
    return resp.status;
  }, BASE);
  assert(r === 404, `status ${r}`);
});

await t("API de mercado traz indicadores do Banco Central", async () => {
  const r = await pagina.evaluate(async (base) => {
    const resp = await fetch(`${base}/api/mercado`);
    return { status: resp.status, body: await resp.json() };
  }, BASE);
  assert(r.status === 200, `status ${r.status}`);
  assert(r.body.selicAnual > 0 && r.body.selicAnual < 0.5, `selic=${r.body.selicAnual}`);
  assert(r.body.ipcaAnual >= 0, `ipca=${r.body.ipcaAnual}`);
});

await t("API do Tesouro devolve a curva de juros", async () => {
  const r = await pagina.evaluate(async (base) => {
    const resp = await fetch(`${base}/api/tesouro`);
    return { status: resp.status, body: await resp.json() };
  }, BASE);
  if (r.status === 503) {
    console.log("    (Tesouro Transparente indisponível; asserções puladas)");
    return;
  }
  assert(r.status === 200, `status ${r.status}`);
  assert(Array.isArray(r.body.curva.nominal) && r.body.curva.nominal.length >= 3, "curva nominal curta");
  assert(Array.isArray(r.body.curva.real) && r.body.curva.real.length >= 3, "curva real curta");
  assert(r.body.titulos.length >= 20, `${r.body.titulos.length} títulos`);
  for (const v of [...r.body.curva.nominal, ...r.body.curva.real]) {
    assert(Number.isFinite(v.taxa) && v.taxa > 0 && v.taxa < 0.5, `taxa=${v.taxa}`);
    assert(Number.isFinite(v.prazoAnos) && v.prazoAnos > 0, `prazo=${v.prazoAnos}`);
  }
});

await t("curva nominal fica acima da real", async () => {
  const r = await pagina.evaluate(async (base) => {
    const resp = await fetch(`${base}/api/tesouro`);
    return resp.ok ? await resp.json() : null;
  }, BASE);
  if (!r) return;
  const medNom = r.curva.nominal.reduce((a, b) => a + b.taxa, 0) / r.curva.nominal.length;
  const medReal = r.curva.real.reduce((a, b) => a + b.taxa, 0) / r.curva.real.length;
  assert(medNom > medReal, `nominal=${medNom} real=${medReal}`);
});

await t("API do Tesouro busca título específico", async () => {
  const r = await pagina.evaluate(async (base) => {
    const resp = await fetch(`${base}/api/tesouro?q=${encodeURIComponent("ipca+ 2035")}`);
    return { status: resp.status, body: resp.ok ? await resp.json() : null };
  }, BASE);
  if (r.status === 503) return;
  assert(r.status === 200, `status ${r.status}`);
  assert(r.body.indexador === "IPCA", `indexador=${r.body.indexador}`);
  assert(r.body.vencimento.startsWith("2035"), `vencimento=${r.body.vencimento}`);
  assert(r.body.taxaCompra > 0 && r.body.taxaCompra < 0.3, `taxa=${r.body.taxaCompra}`);
  assert(r.body.puCompra > 0, `PU=${r.body.puCompra}`);
  assert(r.body.inflacaoImplicita > 0, `implícita=${r.body.inflacaoImplicita}`);
});

await t("API do Tesouro devolve 404 para título inexistente", async () => {
  const r = await pagina.evaluate(async (base) => {
    const resp = await fetch(`${base}/api/tesouro?q=selic%202099`);
    return resp.status;
  }, BASE);
  assert(r === 404 || r === 503, `status ${r}`);
});

await t("painel da curva de juros aparece na tela", async () => {
  const corpo = await pagina.locator("main").innerText();
  if (!/curva de juros/i.test(corpo)) {
    console.log("    (curva indisponível nesta execução)");
    return;
  }
  assert(/juro nominal/i.test(corpo), "juro nominal ausente");
  assert(/juro real/i.test(corpo), "juro real ausente");
  assert(/inflação implícita/i.test(corpo), "inflação implícita ausente");
  assert(/tesouro transparente/i.test(corpo), "fonte ausente");
});

await t("dívida: taxa mensal convertida para anual", async () => {
  await responder("não");
  await responder("sim");
  await responder("simplificada");
  await responder("sim");
  await responder("cartão de crédito");
  await responder("5000");
  await responder("12% ao mês");
  const txt = await conversa();
  assert(/289,6%|289\.6%/.test(txt), `conversão anual errada: ${txt.slice(-250)}`);
});

await t("dívida registrada com valor e taxa", async () => {
  await responder("800");
  const txt = await conversa();
  assert(/Dívida registrada/.test(txt), `confirmação ausente: ${txt.slice(-250)}`);
  assert(/5\.000,00/.test(txt), `valor errado: ${txt.slice(-250)}`);
  assert(/12[.,]00% ao mês/.test(txt), `taxa errada: ${txt.slice(-250)}`);
});

await t("ativo inválido é recusado antes da rede", async () => {
  await responder("não"); // sem outra dívida
  await responder("sim"); // tem investimentos
  await responder("xyz");
  const txt = await conversa();
  assert(/não reconheci/i.test(txt), `validação ausente: ${txt.slice(-250)}`);
  assert(/código da B3/i.test(txt), "não orienta o formato aceito");
});

await t("cotação real aparece no chat", async () => {
  await pagina.fill("#resposta", "PETR4");
  await pagina.click('button[type="submit"]');
  await pagina.waitForFunction(
    () => /Preço agora/i.test(document.querySelector('[role="log"]')?.textContent ?? ""),
    { timeout: 20000 },
  );
  const txt = await conversa();
  assert(/PETR4/.test(txt), "ticker ausente");
  assert(/R\$\s?\d/.test(txt), `preço ausente: ${txt.slice(-300)}`);
  assert(/Faixa de 12 meses/i.test(txt), "faixa de 52 semanas ausente");
  assert(/Yahoo Finance/.test(txt), "fonte ausente");
});

await t("ativo entra na carteira com resultado calculado", async () => {
  await responder("100", "Por quanto você comprou");
  await responder("30", "Quer cadastrar outro ativo");
  const txt = await conversa();
  assert(/PETR4 registrado/i.test(txt), `registro ausente: ${txt.slice(-300)}`);
  assert(/Você investiu/i.test(txt), "valor investido ausente");
  assert(/Resultado:/i.test(txt), "resultado ausente");
  assert(!/NaN|Infinity|undefined/.test(txt), "valor inválido na mensagem");
});

await t("título público é reconhecido no chat", async () => {
  const marcador = (await conversa()).length;
  await responder("sim", "Qual o ativo");
  await enviarTexto("Tesouro IPCA+ 2035");
  // O CSV do Tesouro tem 15 MB: a primeira chamada pode demorar.
  await pagina.waitForFunction(
    () => {
      const ps = document.querySelectorAll('[role="log"] p');
      if (!ps.length) return false;
      const ultima = ps[ps.length - 1].textContent ?? "";
      return /Quantos títulos|Não encontrei|não reconheci|indisponível/i.test(ultima);
    },
    { timeout: 90000 },
  );
  // Só o trecho novo: o histórico anterior não deve satisfazer a asserção.
  const txt = (await conversa()).slice(marcador);
  if (/não encontrei|não reconheci/i.test(txt)) {
    console.log("    (Tesouro indisponível; cadastro de título pulado)");
    tesouroDisponivel = false;
    return;
  }
  assert(/Tesouro IPCA\+ 2035/i.test(txt), `título ausente: ${txt.slice(0, 300)}`);
  assert(/Taxa contratada agora/i.test(txt), `taxa ausente: ${txt.slice(0, 400)}`);
  assert(/IPCA/.test(txt), "indexador ausente");
  assert(/Inflação implícita/i.test(txt), "inflação implícita ausente");
  assert(/Tesouro Transparente/i.test(txt), "fonte ausente");
});

await t("título público entra na carteira com marcação a mercado", async () => {
  if (!tesouroDisponivel) return;
  const marcador = (await conversa()).length;
  await responder("10", "Por quanto comprou");
  await responder("2100", "Quer cadastrar outro ativo");
  const txt = (await conversa()).slice(marcador);
  assert(/registrado/i.test(txt), `registro ausente: ${txt.slice(0, 300)}`);
  assert(/marcado a mercado/i.test(txt), `marcação não mencionada: ${txt.slice(0, 300)}`);
  assert(/Você investiu/i.test(txt), "valor investido ausente");
  assert(!/NaN|Infinity|undefined/.test(txt), "valor inválido");
});

await t("perfil derivado da tolerância e horizonte", async () => {
  await responder("não", "separar por mês"); // sem outro ativo
  await responder("1200", "deixar esse dinheiro rendendo");
  await responder("10 anos", "queda você aguentaria");
  await responder("30%", "score");
  const txt = await conversa();
  assert(/arrojado|moderado/i.test(txt), `perfil não derivado: ${txt.slice(-250)}`);
  assert(/score \d+/.test(txt), "score ausente");
});

await t("conversa conclui e mostra o diagnóstico", async () => {
  await responder("não");
  await pagina.waitForSelector("text=Gates de saúde financeira", { timeout: 15000 });
});

await t("gate 2 bloqueia por dívida cara (RN01)", async () => {
  const corpo = await pagina.locator("main").innerText();
  assert(/bloqueado no gate 2/i.test(corpo), "deveria bloquear no gate 2");
  assert(/rende mais que investir/i.test(corpo), "recomendação de quitar ausente");
});

await t("alocação suspensa com gate aberto", async () => {
  const corpo = await pagina.locator("main").innerText();
  assert(!/carteira-alvo por classe/i.test(corpo), "não deveria mostrar carteira-alvo");
});

await t("justificativa presente (RN09)", async () => {
  const corpo = await pagina.locator("main").innerText();
  assert(/por que isso, para você, agora/i.test(corpo), "justificativa ausente");
  assert(/peso alto/i.test(corpo), "pesos ausentes");
});

await t("carteira detalhada aparece com o ativo cotado", async () => {
  const corpo = await pagina.locator("main").innerText();
  assert(/sua carteira/i.test(corpo), "seção da carteira ausente");
  assert(/PETR4/.test(corpo), "ativo ausente");
  assert(/valor de mercado/i.test(corpo), "valor de mercado ausente");
  assert(/preço médio/i.test(corpo), "preço médio ausente");
});

await t("avaliação do ativo cita tributação e responsabilidade", async () => {
  await pagina.evaluate(() => {
    document.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
  });
  await pagina.waitForTimeout(250);
  const corpo = await pagina.locator("main").innerText();
  assert(/15%|20 mil/.test(corpo), "tributação ausente");
  assert(/a decisão é sua/i.test(corpo), "aviso de responsabilidade ausente");
  assert(/não é indicação de compra/i.test(corpo), "ressalva de indicação ausente");
});

await t("avaliação nunca manda comprar ou vender", async () => {
  const corpo = (await pagina.locator("main").innerText()).toLowerCase();
  for (const p of ["compre ", "venda agora", "recomendo comprar", "lucro garantido", "retorno garantido"]) {
    assert(!corpo.includes(p), `"${p}" apareceu na tela`);
  }
});

await t("dicas de economia citam a base do cálculo", async () => {
  const corpo = await pagina.locator("main").innerText();
  assert(/onde dá para economizar/i.test(corpo), "seção de dicas ausente");
  assert(/base:/i.test(corpo), "base do cálculo ausente");
});

await t("sem NaN, Infinity ou undefined na tela", async () => {
  const corpo = await pagina.locator("body").innerText();
  for (const mau of ["NaN", "Infinity", "undefined", "[object Object]"]) {
    assert(!corpo.includes(mau), `"${mau}" apareceu na tela`);
  }
});

await t("dados persistem no localStorage", async () => {
  const bruto = await pagina.evaluate(() => localStorage.getItem("analyticsfin.perfil.v1"));
  assert(bruto, "nada salvo");
  const p = JSON.parse(bruto);
  assert(p.nome === "Carla", `nome=${p.nome}`);
  assert(p.situacao.renda_mensal === 750000, `renda=${p.situacao.renda_mensal}`);
  assert(p.situacao.despesa_mensal === 480000, `despesa=${p.situacao.despesa_mensal}`);
  assert(p.situacao.custo_essencial === 320000, `essencial=${p.situacao.custo_essencial}`);
  assert(p.situacao.reserva_atual === 1600000, `reserva=${p.situacao.reserva_atual}`);
  assert(p.dividas.length === 1, `${p.dividas.length} dívidas`);
  assert(Math.abs(p.dividas[0].taxa_mensal - 0.12) < 1e-9, `taxa=${p.dividas[0].taxa_mensal}`);
  const esperado = tesouroDisponivel ? 2 : 1;
  assert(p.posicoes.length === esperado, `${p.posicoes.length} posições (esperado ${esperado})`);

  const acao = p.posicoes.find((x) => x.ticker === "PETR4");
  assert(acao, "PETR4 ausente");
  assert(acao.quantidade === 100, `qtd=${acao.quantidade}`);
  assert(acao.precoMedio === 30, `pm=${acao.precoMedio}`);
  assert(acao.classe === "acao", `classe=${acao.classe}`);
  assert(acao.valor > 0, `valor=${acao.valor}`);

  if (tesouroDisponivel) {
    const tit = p.posicoes.find((x) => x.classe === "tesouro");
    assert(tit, "título público ausente");
    assert(tit.indexador === "IPCA", `indexador=${tit.indexador}`);
    assert(tit.vencimento?.startsWith("2035"), `vencimento=${tit.vencimento}`);
    assert(tit.taxaContratada > 0, `taxa=${tit.taxaContratada}`);
    assert(tit.quantidade === 10, `qtd=${tit.quantidade}`);
  }
});

await t("renda fixa aparece na carteira com taxa e vencimento", async () => {
  if (!tesouroDisponivel) return;
  const corpo = await pagina.locator("main").innerText();
  assert(/Tesouro IPCA\+ 2035/i.test(corpo), "título ausente da carteira");
  assert(/contratado a/i.test(corpo), "taxa contratada ausente");
  assert(/15\/05\/2035/.test(corpo), "vencimento ausente");
});

await t("avaliação de título público cita o Tesouro Nacional", async () => {
  if (!tesouroDisponivel) return;
  // Abre todos os detalhes via DOM: o clique em <summary> compete com o
  // re-render do React quando uma posição nova acabou de entrar.
  await pagina.evaluate(() => {
    document.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
  });
  await pagina.waitForTimeout(300);
  const corpo = await pagina.locator("main").innerText();
  assert(/Tesouro Nacional/.test(corpo), "garantia do Tesouro ausente");
  assert(/22,5%|regressiva/.test(corpo), "tabela regressiva ausente");
  assert(/marcação a mercado/i.test(corpo), "marcação a mercado ausente");
});

await t("consulta de cotação após concluir o diagnóstico", async () => {
  await pagina.fill("#resposta", "MXRF11");
  await pagina.click('button[type="submit"]');
  await pagina.waitForFunction(
    () => /MXRF11/.test(document.querySelector('[role="log"]')?.textContent ?? ""),
    { timeout: 20000 },
  );
  const txt = await conversa();
  assert(/MXRF11/.test(txt), "ticker ausente");
  assert(/Preço agora/i.test(txt), "preço ausente");
});

await t("consulta avulsa não altera a carteira", async () => {
  const p = JSON.parse(
    await pagina.evaluate(() => localStorage.getItem("analyticsfin.perfil.v1")),
  );
  const esperado = tesouroDisponivel ? 2 : 1;
  assert(p.posicoes.length === esperado, `consulta alterou a carteira: ${p.posicoes.length}`);
  assert(p.posicoes.some((x) => x.ticker === "PETR4"), "PETR4 sumiu");
});

await t("consulta de título público após concluir", async () => {
  await pagina.fill("#resposta", "Tesouro Prefixado 2028");
  await pagina.click('button[type="submit"]');
  await pagina.waitForFunction(
    () => {
      const txt = document.querySelector('[role="log"]')?.textContent ?? "";
      return /Prefixado 2028|Não encontrei/i.test(txt);
    },
    { timeout: 25000 },
  );
  const txt = await conversa();
  if (/não encontrei/i.test(txt)) return;
  assert(/Prefixado 2028/i.test(txt), "título ausente");
  assert(/Taxa contratada/i.test(txt), "taxa ausente");
});

await t("recarregar a página recupera os dados", async () => {
  await pagina.reload({ waitUntil: "networkidle" });
  await pagina.waitForSelector("text=Gates de saúde financeira", { timeout: 15000 });
  const corpo = await pagina.locator("main").innerText();
  assert(/bem-vindo de volta, carla/i.test(corpo), "não recuperou a sessão");
  assert(/bloqueado no gate 2/i.test(corpo), "diagnóstico não recalculou");
});

await t("nenhum dado do usuário é enviado ao servidor", async () => {
  const envios = [];
  const comQuery = [];
  pagina.on("request", (r) => {
    if (["POST", "PUT", "PATCH"].includes(r.method())) envios.push(`${r.method()} ${r.url()}`);
    // A rota de cotação só pode carregar o ticker, nada mais.
    if (r.url().includes("/api/cotacao")) {
      const params = [...new URL(r.url()).searchParams.keys()];
      if (params.some((k) => k !== "ticker")) comQuery.push(r.url());
    }
  });
  await pagina.reload({ waitUntil: "networkidle" });
  await pagina.waitForTimeout(1200);
  assert(envios.length === 0, `requisições de escrita detectadas: ${envios.join(", ")}`);
  assert(comQuery.length === 0, `parâmetro extra na rota de cotação: ${comQuery.join(", ")}`);
});

await t("rota de cotação carrega apenas o ticker", async () => {
  const urls = [];
  pagina.on("request", (r) => {
    if (r.url().includes("/api/cotacao")) urls.push(r.url());
  });
  await pagina.fill("#resposta", "WEGE3");
  await pagina.click('button[type="submit"]');
  await pagina.waitForFunction(
    () => /WEGE3/.test(document.querySelector('[role="log"]')?.textContent ?? ""),
    { timeout: 20000 },
  );
  assert(urls.length > 0, "nenhuma chamada capturada");
  for (const u of urls) {
    const q = new URL(u).searchParams;
    assert([...q.keys()].join(",") === "ticker", `parâmetros: ${[...q.keys()]}`);
    assert(q.get("ticker") === "WEGE3", `ticker=${q.get("ticker")}`);
  }
});

await t("botão recomeçar limpa tudo", async () => {
  await pagina.click("text=Recomeçar");
  await pagina.waitForSelector("#resposta", { timeout: 10000 });
  const bruto = await pagina.evaluate(() => localStorage.getItem("analyticsfin.perfil.v1"));
  assert(bruto === null, "localStorage não foi limpo");
  const corpo = await pagina.locator("main").innerText();
  assert(!/gates de saúde/i.test(corpo), "resultado deveria sumir");
  assert(/como posso te chamar/i.test(corpo), "não reiniciou a conversa");
});

await t("exemplo pronto: Ana bloqueia no gate 2", async () => {
  await pagina.click('button[aria-label^="Carregar exemplo Ana"]');
  await pagina.waitForFunction(
    () => /Diagnóstico de Ana/i.test(document.querySelector("main")?.textContent ?? ""),
    { timeout: 15000 },
  );
  const corpo = await pagina.locator("main").innerText();
  assert(/diagnóstico de ana/i.test(corpo), "nome errado");
  assert(/bloqueado no gate 2/i.test(corpo), "Ana deveria bloquear no gate 2");
});

await t("exemplo pronto: Bruno libera e mostra carteira-alvo", async () => {
  await pagina.goto(BASE, { waitUntil: "networkidle" });
  await pagina.evaluate(() => localStorage.clear());
  await pagina.reload({ waitUntil: "networkidle" });
  await pagina.waitForSelector('button[aria-label^="Carregar exemplo Bruno"]', { timeout: 15000 });
  await pagina.click('button[aria-label^="Carregar exemplo Bruno"]');
  await pagina.waitForSelector("text=Gates de saúde financeira", { timeout: 15000 });
  const corpo = await pagina.locator("main").innerText();
  assert(/liberado para investir/i.test(corpo), "Bruno deveria estar liberado");
  assert(/carteira-alvo por classe/i.test(corpo), "carteira-alvo ausente");
  assert(/pgbl/i.test(corpo), "PGBL ausente (declaração completa, RN14)");
});

await t("carteira de Bruno lista vários ativos com peso", async () => {
  const corpo = await pagina.locator("main").innerText();
  assert(/sua carteira/i.test(corpo), "seção ausente");
  for (const tk of ["PETR4", "ITUB4", "MXRF11", "IVVB11"]) {
    assert(corpo.includes(tk), `${tk} ausente`);
  }
  assert(/retorno/i.test(corpo), "coluna de retorno ausente");
  assert(/peso/i.test(corpo), "coluna de peso ausente");
});

await t("pesos da carteira somam 100%", async () => {
  // Lê a coluna de peso pela posição na linha, não pelo último token:
  // a tabela agora tem a coluna de vencimento no fim.
  const pesos = await pagina.evaluate(() => {
    const cabecalhos = [...document.querySelectorAll("table thead th")];
    const idx = cabecalhos.findIndex((th) => /peso/i.test(th.textContent ?? ""));
    if (idx < 0) return [];
    return [...document.querySelectorAll("table tbody tr")]
      .map((tr) => tr.querySelectorAll("td, th")[idx]?.textContent ?? "")
      .map((t) => Number(t.replace("%", "").replace(",", ".").trim()))
      .filter((n) => Number.isFinite(n));
  });
  assert(pesos.length >= 4, `${pesos.length} pesos lidos`);
  const soma = pesos.reduce((a, b) => a + b, 0);
  assert(Math.abs(soma - 100) < 1, `soma dos pesos: ${soma.toFixed(2)}%`);
});

await t("indicadores exibidos vêm do Banco Central", async () => {
  const corpo = await pagina.locator("main").innerText();
  assert(/banco central/i.test(corpo), "fonte dos indicadores ausente");
});

await t("perfis demo usam só o primeiro nome", async () => {
  await pagina.goto(BASE, { waitUntil: "networkidle" });
  await pagina.evaluate(() => localStorage.clear());
  await pagina.reload({ waitUntil: "networkidle" });
  await pagina.waitForSelector('button[aria-label^="Carregar exemplo"]', { timeout: 15000 });
  const botoes = pagina.locator('button[aria-label^="Carregar exemplo"]');
  const n = await botoes.count();
  assert(n >= 2, `${n} exemplos`);
  for (let i = 0; i < n; i++) {
    const texto = await botoes.nth(i).innerText();
    const nome = texto.split("\n")[0].trim();
    assert(nome.length >= 2, `nome vazio: "${nome}"`);
    assert(!nome.includes(" "), `"${nome}" tem mais de um nome`);
  }
});

await t("acessibilidade: campo tem rótulo e barra tem progressbar", async () => {
  const temLabel = await pagina.locator('label[for="resposta"]').count();
  assert(temLabel > 0, "campo sem rótulo");
  const temProgresso = await pagina.locator('[role="progressbar"]').count();
  assert(temProgresso > 0, "progressbar ausente");
  const temLog = await pagina.locator('[role="log"][aria-live]').count();
  assert(temLog > 0, "conversa sem aria-live");
});

await t("navegação por teclado funciona", async () => {
  await pagina.focus("#resposta");
  await pagina.keyboard.type("Teclado");
  await pagina.keyboard.press("Enter");
  await pagina.waitForTimeout(200);
  const txt = await conversa();
  assert(/teclado/i.test(txt), "Enter não enviou");
});

await t("nenhum erro no console do navegador", async () => {
  // 400 e 404 são respostas esperadas dos testes de validação da API acima.
  const reais = errosConsole.filter(
    (e) => !/favicon|status of (400|404)|Failed to load resource/i.test(e),
  );
  assert(reais.length === 0, `erros: ${reais.slice(0, 3).join(" | ")}`);
});

await navegador.close();

console.log(`\ne2e: ${ok} passaram, ${falhas.length} falharam`);
if (falhas.length) process.exit(1);
