"use client";

import { useMemo } from "react";
import { Aviso, Barra, Card, Metrica, Pct, Selo, Valor } from "@/components/ui";
import { aporteNecessario, mesesAte, monteCarlo, valorFuturo } from "@/lib/calc";
import { prazoAteHoje } from "@/lib/curva";
import {
  ALGORITMO_VERSAO,
  CLASSE_LABEL,
  alocacaoAlvo,
  avaliarGates,
  gerarRecomendacoes,
  mesesReservaExigidos,
  metaRetornoMensal,
  rebalancear,
  type Classe,
  type Fator,
  type PosicaoClasse,
  type Recomendacao,
} from "@/lib/engine";
import { usuarioDe, type PerfilLocal } from "@/lib/perfilLocal";
import { AVISO_DECISAO, avaliarAtivo, dicasEconomia } from "@/lib/dicas";
import type { Classe as ClasseAtivo } from "@/lib/ticker";

const TOM: Record<Recomendacao["tipo"], "erro" | "info" | "atencao" | "neutro"> = {
  gate: "erro",
  alocacao: "info",
  rebalanceamento: "info",
  alerta: "atencao",
  objetivo: "neutro",
  fiscal: "neutro",
};

const PESO_LABEL: Record<Fator["peso"], string> = {
  alto: "peso alto",
  medio: "peso médio",
  baixo: "peso baixo",
};

const VOL_CLASSE: Record<string, number> = {
  rf_pos: 0.01, rf_ipca: 0.08, rf_pre: 0.05, acao: 0.26, fii: 0.15, exterior: 0.2,
};

export type Mercado = {
  cdiAnual: number;
  selicAnual: number;
  ipcaAnual: number;
  atualizadoEm: string;
  /** Data de referência vinda do servidor: mantém o render puro. */
  hoje: string;
};

export function Resultado({ perfil, mercado }: { perfil: PerfilLocal; mercado: Mercado }) {
  const hojeIso = mercado.hoje;
  const calc = useMemo(() => {
    const usuario = usuarioDe(perfil);
    const { situacao, dividas, objetivos } = perfil;
    const cdi = mercado.cdiAnual;
    const selic = mercado.selicAnual;

    // Mapeia a classe do ativo para a classe do motor.
    const DE_TICKER: Record<string, Classe> = {
      acao: "acao",
      fii: "fii",
      etf: "exterior",
      bdr: "exterior",
    };
    const DE_INDEXADOR: Record<string, Classe> = {
      SELIC: "rf_pos",
      PRE: "rf_pre",
      IPCA: "rf_ipca",
      IGPM: "rf_ipca",
    };
    const porClasse = new Map<Classe, number>();
    for (const pos of perfil.posicoes) {
      const c =
        pos.classe === "tesouro"
          ? (DE_INDEXADOR[pos.indexador ?? ""] ?? "rf_pos")
          : (DE_TICKER[pos.classe ?? ""] ?? "rf_pos");
      porClasse.set(c, (porClasse.get(c) ?? 0) + pos.valor);
    }
    const posicoes: PosicaoClasse[] = [...porClasse].map(([classe, valor]) => ({ classe, valor }));
    const total = perfil.posicoes.reduce((s, p) => s + p.valor, 0);

    const gates = avaliarGates(usuario, situacao, dividas, perfil.perfil, cdi);
    const { recomendacoes, liberado } = gerarRecomendacoes({
      usuario, situacao, dividas, objetivos,
      perfil: perfil.perfil,
      cdiAnual: cdi, selicAnual: selic,
      posicoes, concentracaoEmissor: [],
    });

    const ativos = objetivos.filter((o) => o.status === "ativo");
    const horizonte = Math.max(
      perfil.perfil.horizonte_meses,
      ...ativos.map((o) => mesesAte(o.data_alvo)),
      0,
    );
    const alvo = alocacaoAlvo(perfil.perfil, horizonte, selic);
    const rebal = rebalancear(posicoes, alvo.faixas, situacao.capacidade_aporte);
    const taxaMensal = metaRetornoMensal(perfil.perfil, cdi);
    const taxaAnual = (1 + taxaMensal) ** 12 - 1;

    const projecoes = ativos.map((o) => {
      const meses = mesesAte(o.data_alvo);
      const faixasObj = alocacaoAlvo(perfil.perfil, meses, selic).faixas;
      const vol = Object.entries(faixasObj).reduce(
        (s, [c, f]) => s + (f.alvo / 100) * (VOL_CLASSE[c] ?? 0.1), 0,
      );
      const projetado = valorFuturo(o.valor_atual, o.aporte_mensal, taxaMensal, meses);
      const necessario = aporteNecessario(o.valor_alvo, o.valor_atual, taxaMensal, meses);
      const mc = monteCarlo({
        pv: o.valor_atual, aporte: o.aporte_mensal, retornoAnual: taxaAnual,
        volAnual: vol, meses, alvo: o.valor_alvo, caminhos: 1500,
      });
      return { objetivo: o, meses, projetado, necessario, mc, vol };
    });

    const carteira = perfil.posicoes
      .map((pos) => {
        const investido =
          pos.quantidade && pos.precoMedio
            ? Math.round(pos.quantidade * pos.precoMedio * 100)
            : null;
        const resultado = investido !== null ? pos.valor - investido : null;
        return {
          ...pos,
          investido,
          resultado,
          retornoPct: investido !== null && investido > 0 ? resultado! / investido : null,
          pesoPct: total > 0 ? (pos.valor / total) * 100 : 0,
          avaliacao: avaliarAtivo(
            (pos.classe as ClasseAtivo) ?? "desconhecida",
            perfil.perfil,
            gates.liberado,
            horizonte,
            pos.classe === "tesouro"
              ? {
                  indexador: pos.indexador,
                  vencimento: pos.vencimento,
                  prazoAnos: prazoAteHoje(pos.vencimento, hojeIso),
                }
              : undefined,
          ),
        };
      })
      .sort((a, b) => b.valor - a.valor);

    const investidoTotal = carteira.reduce((s, c) => s + (c.investido ?? 0), 0);
    const resultadoTotal = carteira.reduce((s, c) => s + (c.resultado ?? 0), 0);
    const dicas = dicasEconomia(perfil);

    return {
      gates, recomendacoes, liberado, alvo, rebal, total, taxaAnual,
      projecoes, horizonte, carteira, investidoTotal, resultadoTotal, dicas,
    };
  }, [perfil, mercado, hojeIso]);

  const s = perfil.situacao;
  const sobra = s.renda_mensal - s.despesa_mensal;
  const taxaPoupanca = s.renda_mensal > 0 ? sobra / s.renda_mensal : 0;
  const mesesExig = mesesReservaExigidos(usuarioDe(perfil));
  const mesesReserva = s.custo_essencial > 0 ? s.reserva_atual / s.custo_essencial : 0;
  const totalDivida = perfil.dividas.reduce((a, d) => a + d.saldo, 0);
  const patrimonio = calc.total + s.reserva_atual - totalDivida;
  const classes = (Object.keys(calc.alvo.faixas) as Classe[]).filter(
    (c) => calc.alvo.faixas[c].alvo > 0,
  );

  return (
    <div className="space-y-6">
      <Card titulo={`Diagnóstico de ${perfil.nome}`}>
        <dl className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <Metrica rotulo="Patrimônio líquido" ajuda="Investido + reserva − dívidas">
            <Valor centavos={patrimonio} sinal={patrimonio < 0} />
          </Metrica>
          <Metrica rotulo="Sobra mensal">
            <Valor centavos={sobra} sinal />
          </Metrica>
          <Metrica rotulo="Taxa de poupança">
            <Pct valor={taxaPoupanca} />
          </Metrica>
          <Metrica rotulo="Perfil de risco">
            <span className="capitalize">{perfil.perfil.classificacao}</span>
            <span className="block text-xs font-normal text-muted">
              score {perfil.perfil.score}
            </span>
          </Metrica>
        </dl>
      </Card>

      <Card
        titulo="Gates de saúde financeira"
        acao={
          calc.liberado ? (
            <Selo tom="ok">Liberado para investir</Selo>
          ) : (
            <Selo tom="erro">Bloqueado no gate {calc.gates.primeiroAberto?.n}</Selo>
          )
        }
      >
        <p className="mb-4 text-sm text-muted">
          Ordem fixa. Um gate bloqueante aberto suspende qualquer recomendação de investimento de
          risco.
        </p>
        <ol className="space-y-2">
          {calc.gates.gates.map((g) => (
            <li
              key={g.n}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borda px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm">
                <span aria-hidden="true" className={g.aprovado ? "text-positivo" : "text-negativo"}>
                  {g.aprovado ? "✓" : "✕"}
                </span>
                <span className="font-medium">
                  {g.n}. {g.nome}
                </span>
                <span className="sr-only">{g.aprovado ? "aprovado" : "reprovado"}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {g.detalhe}
                {!g.bloqueante && <Selo tom="neutro">não bloqueia</Selo>}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card titulo="Reserva de emergência">
          <Metrica rotulo="Cobertura atual">
            {mesesReserva.toFixed(1)} de {mesesExig} meses
          </Metrica>
          <div className="mt-3">
            <Barra
              pct={mesesExig > 0 ? (mesesReserva / mesesExig) * 100 : 0}
              rotulo={`Reserva: ${mesesReserva.toFixed(1)} de ${mesesExig} meses`}
              tom={mesesReserva >= mesesExig ? "positivo" : "atencao"}
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            Exigência de {mesesExig} meses: renda {perfil.estabilidade_renda},{" "}
            {perfil.dependentes} dependente(s). Base: <Valor centavos={s.custo_essencial} /> de
            custo essencial.
          </p>
        </Card>

        <Card titulo="Endividamento">
          {perfil.dividas.length === 0 ? (
            <p className="text-sm text-positivo">
              <span aria-hidden="true">✓ </span>Nenhuma dívida cadastrada.
            </p>
          ) : (
            <>
              <Metrica rotulo="Saldo devedor total">
                <Valor centavos={totalDivida} />
              </Metrica>
              <ul className="mt-4 space-y-2 text-sm">
                {perfil.dividas.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="capitalize">{d.tipo.replace(/_/g, " ")}</span>
                    <span className="flex items-center gap-2 text-xs">
                      <span className="tabular-nums text-muted">
                        {(d.taxa_mensal * 100).toFixed(2)}% a.m.
                      </span>
                      <Valor centavos={d.saldo} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {calc.carteira.length > 0 && (
        <Card titulo="Sua carteira">
          <dl className="mb-5 grid grid-cols-2 gap-5 md:grid-cols-4">
            <Metrica rotulo="Valor de mercado">
              <Valor centavos={calc.total} />
            </Metrica>
            {calc.investidoTotal > 0 && (
              <>
                <Metrica rotulo="Investido">
                  <Valor centavos={calc.investidoTotal} />
                </Metrica>
                <Metrica rotulo="Resultado">
                  <Valor centavos={calc.resultadoTotal} sinal />
                </Metrica>
                <Metrica rotulo="Retorno">
                  <Pct valor={calc.resultadoTotal / calc.investidoTotal} />
                </Metrica>
              </>
            )}
          </dl>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Posições da carteira com cotação atual</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="py-2">Ativo</th>
                  <th scope="col" className="py-2 text-right">Cotas</th>
                  <th scope="col" className="py-2 text-right">Preço médio</th>
                  <th scope="col" className="py-2 text-right">Valor hoje</th>
                  <th scope="col" className="py-2 text-right">Resultado</th>
                  <th scope="col" className="py-2 text-right">Peso</th>
                  <th scope="col" className="py-2">Vencimento</th>
                </tr>
              </thead>
              <tbody>
                {calc.carteira.map((pos) => (
                  <tr key={pos.ticker} className="border-t border-borda">
                    <th scope="row" className="py-2 text-left font-medium">
                      {pos.ticker}
                      {pos.nome && pos.nome !== pos.ticker && (
                        <span className="block text-xs font-normal text-muted">{pos.nome}</span>
                      )}
                      {pos.taxaContratada !== undefined && (
                        <span className="block text-xs font-normal text-muted">
                          contratado a {(pos.taxaContratada * 100).toFixed(2).replace(".", ",")}%
                          {pos.indexador === "IPCA" ? " + IPCA" : pos.indexador === "IGPM" ? " + IGP-M" : " a.a."}
                        </span>
                      )}
                    </th>
                    <td className="py-2 text-right tabular-nums">
                      {pos.quantidade?.toLocaleString("pt-BR") ?? "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {pos.precoMedio
                        ? pos.precoMedio.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })
                        : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <Valor centavos={pos.valor} />
                    </td>
                    <td className="py-2 text-right">
                      {pos.retornoPct !== null ? <Pct valor={pos.retornoPct} /> : <span className="text-muted">—</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{pos.pesoPct.toFixed(1)}%</td>
                    <td className="py-2 text-xs text-muted">
                      {pos.vencimento ? pos.vencimento.split("-").reverse().join("/") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 space-y-3">
            {calc.carteira.map((pos) => {
              const a = pos.avaliacao;
              if (a.pontos.length === 0 && a.alertas.length === 0 && a.bloqueios.length === 0)
                return null;
              return (
                <details key={`av-${pos.ticker}`} className="rounded-lg border border-borda p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    {pos.ticker} — como se encaixa no seu perfil
                    {a.bloqueios.length > 0 && (
                      <span className="ml-2">
                        <Selo tom="erro">atenção</Selo>
                      </span>
                    )}
                  </summary>
                  <div className="mt-3 space-y-3 text-sm">
                    {a.bloqueios.length > 0 && (
                      <ul className="list-inside list-disc space-y-1 text-negativo">
                        {a.bloqueios.map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    )}
                    {a.alertas.length > 0 && (
                      <ul className="list-inside list-disc space-y-1 text-atencao">
                        {a.alertas.map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    )}
                    <ul className="list-inside list-disc space-y-1 text-muted">
                      {a.pontos.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                    <p className="text-xs text-muted">{AVISO_DECISAO}</p>
                  </div>
                </details>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-muted">
            Preços obtidos em tempo real no momento do cadastro. Consulte outro ativo pelo
            assistente acima para atualizar.
          </p>
        </Card>
      )}

      {calc.dicas.length > 0 && (
        <Card titulo="Onde dá para economizar">
          <div className="space-y-4">
            {calc.dicas.map((d) => (
              <div key={d.chave} className="rounded-lg border border-borda p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold">{d.titulo}</h3>
                  {d.impactoMensal !== undefined && d.impactoMensal > 0 && (
                    <span className="text-sm">
                      <span className="text-muted">impacto: </span>
                      <Valor centavos={d.impactoMensal} className="font-semibold" />
                      <span className="text-muted">/mês</span>
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{d.texto}</p>
                <p className="mt-2 text-xs text-muted">
                  <span className="font-medium">Base: </span>
                  {d.base}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {calc.liberado && (
        <Card titulo="Carteira-alvo por classe">
          <table className="w-full text-sm">
            <caption className="sr-only">Alocação alvo para o seu perfil</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-2">Classe</th>
                <th scope="col" className="py-2 text-right">Alvo</th>
                <th scope="col" className="py-2 text-right">Faixa</th>
                <th scope="col" className="w-32 py-2"><span className="sr-only">Barra</span></th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => {
                const f = calc.alvo.faixas[c];
                return (
                  <tr key={c} className="border-t border-borda">
                    <td className="py-2 font-medium">{CLASSE_LABEL[c]}</td>
                    <td className="py-2 text-right tabular-nums font-semibold">
                      {f.alvo.toFixed(1)}%
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {f.min.toFixed(1)}–{f.max.toFixed(1)}%
                    </td>
                    <td className="py-2 pl-3">
                      <Barra pct={f.alvo} rotulo={`${CLASSE_LABEL[c]}: alvo ${f.alvo}%`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {calc.alvo.notas.length > 0 && (
            <div className="mt-4 rounded-lg border border-borda p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Ajustes aplicados ao seu caso
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted">
                {calc.alvo.notas.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}

      {calc.projecoes.length > 0 && (
        <Card titulo="Objetivos">
          <div className="space-y-5">
            {calc.projecoes.map(({ objetivo: o, meses, projetado, necessario, mc }) => {
              const atinge = projetado >= o.valor_alvo;
              const gap = Math.round(necessario - o.aporte_mensal);
              return (
                <div key={o.id} className="rounded-lg border border-borda p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{o.nome}</h3>
                    <Selo tom={atinge ? "ok" : "atencao"}>
                      {atinge ? "no caminho" : "abaixo do necessário"}
                    </Selo>
                  </div>
                  <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <Metrica rotulo="Alvo"><Valor centavos={o.valor_alvo} /></Metrica>
                    <Metrica rotulo="Prazo">{meses} meses</Metrica>
                    <Metrica rotulo="Mediana (p50)"><Valor centavos={mc.p50} /></Metrica>
                    <Metrica rotulo="Chance de atingir">
                      <Pct valor={mc.probabilidade ?? 0} sinal={false} casas={0} />
                    </Metrica>
                  </dl>
                  <div className="mt-3">
                    <Barra
                      pct={(mc.probabilidade ?? 0) * 100}
                      rotulo={`Chance de atingir "${o.nome}": ${Math.round((mc.probabilidade ?? 0) * 100)}%`}
                      tom={
                        (mc.probabilidade ?? 0) > 0.7 ? "positivo"
                          : (mc.probabilidade ?? 0) > 0.4 ? "atencao" : "negativo"
                      }
                    />
                  </div>
                  {!atinge && gap > 0 && (
                    <p className="mt-3 text-sm text-muted">
                      Aporte necessário: <Valor centavos={Math.round(necessario)} className="font-semibold" />{" "}
                      por mês — <Valor centavos={gap} className="font-semibold" /> a mais que o atual.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <section aria-label="Recomendações" className="space-y-4">
        <h2 className="text-lg font-semibold">
          Recomendações ({calc.recomendacoes.length})
        </h2>
        <Aviso>
          Recomendações limitadas a classe de ativo. Nenhum emissor ou ticker específico é
          indicado — isso exigiria registro de consultoria na CVM (Resolução 19). Todo número vem
          de função determinística, nunca de modelo de linguagem (RN10). Algoritmo{" "}
          {ALGORITMO_VERSAO}.
        </Aviso>

        {calc.recomendacoes.map((r) => (
          <article
            key={r.chave}
            className={`rounded-xl border bg-card p-5 ${r.bloqueante ? "border-negativo/40" : "border-borda"}`}
          >
            <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">{r.titulo}</h3>
                <p className="mt-1 text-sm text-muted">{r.acao}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {r.bloqueante && <Selo tom="erro">bloqueante</Selo>}
                <Selo tom={TOM[r.tipo]}>{r.tipo}</Selo>
              </div>
            </header>

            {r.valor !== undefined && r.valor > 0 && (
              <p className="mb-3 text-sm">
                Valor envolvido: <Valor centavos={r.valor} className="font-semibold" />
              </p>
            )}

            <details open className="mb-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">
                Por que isso, para você, agora
              </summary>
              <table className="mt-2 w-full text-sm">
                <caption className="sr-only">Fatores que originaram esta recomendação</caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="py-1">Fator</th>
                    <th scope="col" className="py-1">Seu dado</th>
                    <th scope="col" className="py-1">Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {r.justificativa.map((f, i) => (
                    <tr key={i} className="border-t border-borda align-top">
                      <td className="py-2 pr-3 font-medium">{f.fator}</td>
                      <td className="py-2 pr-3 text-muted">{f.dado}</td>
                      <td className="py-2">
                        <span
                          className={
                            f.direcao === "contra" ? "text-negativo"
                              : f.direcao === "favor" ? "text-positivo" : "text-muted"
                          }
                        >
                          <span aria-hidden="true">
                            {f.direcao === "contra" ? "▼ " : f.direcao === "favor" ? "▲ " : "• "}
                          </span>
                          {PESO_LABEL[f.peso]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>

            <dl className="grid gap-3 text-sm md:grid-cols-3">
              {r.riscos.length > 0 && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Riscos</dt>
                  <dd>
                    <ul className="mt-1 list-inside list-disc space-y-1 text-muted">
                      {r.riscos.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  </dd>
                </div>
              )}
              {r.alternativas.length > 0 && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Alternativas</dt>
                  <dd>
                    <ul className="mt-1 list-inside list-disc space-y-1 text-muted">
                      {r.alternativas.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Se não seguir</dt>
                <dd className="mt-1 text-muted">{r.seNaoSeguir}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <Card titulo="Cenário de mercado usado nos cálculos">
        <dl className="grid grid-cols-3 gap-4">
          <Metrica rotulo="Selic"><Pct valor={mercado.selicAnual} sinal={false} /></Metrica>
          <Metrica rotulo="CDI"><Pct valor={mercado.cdiAnual} sinal={false} /></Metrica>
          <Metrica rotulo="IPCA 12m"><Pct valor={mercado.ipcaAnual} sinal={false} /></Metrica>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Indicadores lidos do banco em {mercado.atualizadoEm}. Dados sintéticos de demonstração.
        </p>
      </Card>
    </div>
  );
}
