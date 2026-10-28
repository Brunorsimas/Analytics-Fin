"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  aplicarCotacao,
  estadoInicial,
  iniciarConsulta,
  perguntaDe,
  progresso,
  responder,
  tipoDeBusca,
  type CotacaoLeve,
  type Estado,
  type Resposta,
} from "@/lib/conversa";
import {
  apagar,
  inscrever,
  salvar,
  snapshot,
  snapshotServidor,
  versao,
  type PerfilLocal,
} from "@/lib/perfilLocal";

type Balao = { autor: "bot" | "voce"; texto: string; erro?: boolean };

const INICIAL = estadoInicial();
const PRIMEIRO_BALAO: Balao = { autor: "bot", texto: perguntaDe(INICIAL) };

type RespostaTesouro = {
  rotulo: string;
  nome: string;
  indexador: string;
  vencimento: string;
  taxaCompra: number;
  puCompra: number;
  prazoAnos: number;
  taxaCurva: number | null;
  inflacaoImplicita: number | null;
  dataBase: string;
  fonte: string;
};

/** Roteia para a B3 ou para o Tesouro, conforme o que o usuário digitou. */
async function buscarCotacao(alvo: string): Promise<CotacaoLeve | null> {
  const tipo = tipoDeBusca(alvo);
  if (!tipo) return null;

  try {
    if (tipo === "ticker") {
      const resp = await fetch(`/api/cotacao?ticker=${encodeURIComponent(alvo)}`, {
        cache: "no-store",
      });
      if (!resp.ok) return null;
      const c = (await resp.json()) as CotacaoLeve;
      return typeof c?.preco === "number" && c.preco > 0 ? c : null;
    }

    const resp = await fetch(`/api/tesouro?q=${encodeURIComponent(alvo)}`, {
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const t = (await resp.json()) as RespostaTesouro;
    if (typeof t?.puCompra !== "number" || t.puCompra <= 0) return null;

    return {
      ticker: t.rotulo,
      nome: t.rotulo,
      preco: t.puCompra / 100,
      variacaoPct: null,
      minimo52s: null,
      maximo52s: null,
      classe: "tesouro",
      fonte: t.fonte,
      atualizadoEm: t.dataBase,
      indexador: t.indexador,
      vencimento: t.vencimento,
      taxaCompra: t.taxaCompra,
      taxaCurva: t.taxaCurva,
      prazoAnos: t.prazoAnos,
      inflacaoImplicita: t.inflacaoImplicita,
    };
  } catch {
    return null;
  }
}

export function Chat({ onPerfil }: { onPerfil: (p: PerfilLocal | null) => void }) {
  // localStorage lido como store externo: o servidor vê null, o cliente vê o
  // valor real já no primeiro commit. Sem divergência de HTML (React #418).
  const salvo = useSyncExternalStore(inscrever, snapshot, snapshotServidor);
  const retomado = salvo !== null && salvo.nome !== "";

  // `null` enquanto o usuário não interage: a sessão recuperada manda.
  // A sessão registra a versão do storage em que nasceu.
  const [sessao, setSessao] = useState<{
    estado: Estado;
    baloes: Balao[];
    pronto: boolean;
    versao: number;
  } | null>(null);
  const [entrada, setEntrada] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  // A sessão guarda a versão do storage em que nasceu. Se o storage mudar
  // por fora (carregar um exemplo), a versão avança e a sessão é descartada.
  const versaoStorage = versao();
  const sessaoValida = sessao !== null && sessao.versao === versaoStorage ? sessao : null;

  const estado = useMemo(
    () =>
      sessaoValida?.estado ??
      (retomado ? { ...estadoInicial(salvo), passo: "fim" as const } : INICIAL),
    [sessaoValida, retomado, salvo],
  );
  const pronto = sessaoValida?.pronto ?? retomado;
  const baloes = useMemo<Balao[]>(
    () =>
      sessaoValida?.baloes ??
      (retomado
        ? [
            {
              autor: "bot",
              texto: `Bem-vindo de volta, ${salvo.nome}. Recuperei seus dados deste navegador. O diagnóstico está abaixo.`,
            },
          ]
        : [PRIMEIRO_BALAO]),
    [sessaoValida, retomado, salvo],
  );

  // Sincroniza o perfil com o componente pai.
  const ultimoPublicado = useRef<PerfilLocal | null | undefined>(undefined);
  useEffect(() => {
    const atual = pronto ? (sessaoValida?.estado.perfil ?? salvo) : null;
    if (ultimoPublicado.current === atual) return;
    ultimoPublicado.current = atual;
    onPerfil(atual);
  }, [pronto, sessaoValida, salvo, onPerfil]);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [baloes]);

  const [buscando, setBuscando] = useState(false);

  /** Aplica uma Resposta à tela e, se houver, dispara a busca de cotação. */
  const aplicar = useCallback(
    (res: Resposta, baloesBase: Balao[], textoUsuario?: string) => {
      const novos: Balao[] = [...baloesBase];
      if (textoUsuario) novos.push({ autor: "voce", texto: textoUsuario });
      for (const m of res.mensagens) novos.push({ autor: "bot", texto: m, erro: res.erro });

      setEntrada("");
      // Salva antes de registrar a versão: `salvar` incrementa o contador,
      // e a sessão precisa nascer já alinhada com o storage novo.
      if (res.concluido || !res.erro) salvar(res.estado.perfil);
      setSessao({
        estado: res.estado,
        baloes: novos,
        pronto: Boolean(res.concluido),
        versao: versao(),
      });

      if (res.buscarCotacao) {
        const ticker = res.buscarCotacao;
        setBuscando(true);
        void buscarCotacao(ticker).then((cot) => {
          const depois = aplicarCotacao(res.estado, ticker, cot);
          setBuscando(false);
          if (cot) salvar(depois.estado.perfil);
          setSessao({
            estado: depois.estado,
            baloes: [
              ...novos,
              ...depois.mensagens.map((m) => ({
                autor: "bot" as const,
                texto: m,
                erro: depois.erro,
              })),
            ],
            pronto: Boolean(depois.concluido),
            versao: versao(),
          });
          campo.current?.focus();
        });
      } else {
        campo.current?.focus();
      }
    },
    [],
  );

  const enviar = useCallback(
    (texto: string) => {
      if (!texto.trim() || buscando) return;

      // Depois de concluído, o chat vira consulta de cotação.
      if (pronto) {
        if (!tipoDeBusca(texto)) {
          setSessao({
            estado,
            baloes: [
              ...baloes,
              { autor: "voce", texto },
              {
                autor: "bot",
                texto:
                  "Para consultar, digite o código da B3 (PETR4, MXRF11) ou um título público (Tesouro Selic 2029, IPCA+ 2035).",
                erro: true,
              },
            ],
            pronto: true,
            versao: versaoStorage,
          });
          setEntrada("");
          return;
        }
        aplicar(iniciarConsulta(estado, texto.trim()), baloes, texto);
        return;
      }

      aplicar(responder(estado, texto), baloes, texto);
    },
    [estado, baloes, pronto, buscando, aplicar, versaoStorage],
  );

  const recomecar = useCallback(() => {
    apagar();
    const inicial = estadoInicial();
    setSessao({
      estado: inicial,
      baloes: [{ autor: "bot", texto: perguntaDe(inicial) }],
      pronto: false,
      versao: versao(),
    });
    setEntrada("");
    campo.current?.focus();
  }, []);

  const pct = pronto ? 100 : progresso(estado.passo);

  return (
    <section className="rounded-xl border border-borda bg-card" aria-label="Assistente">
      <header className="border-b border-borda px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Assistente</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-muted">{pct}%</span>
            {(baloes.length > 1 || pronto) && (
              <button
                type="button"
                onClick={recomecar}
                className="rounded-full border border-borda px-3 py-1 text-xs text-muted hover:text-foreground"
              >
                Recomeçar
              </button>
            )}
          </div>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progresso do questionário: ${pct}%`}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-borda"
        >
          <div className="h-full bg-acento transition-all" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <div
        className="max-h-[26rem] space-y-3 overflow-y-auto px-5 py-4"
        role="log"
        aria-live="polite"
        aria-label="Conversa"
      >
        {baloes.map((b, i) => (
          <div key={i} className={b.autor === "voce" ? "flex justify-end" : "flex justify-start"}>
            <p
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                b.autor === "voce"
                  ? "bg-acento/10 text-foreground"
                  : b.erro
                    ? "border border-atencao/40 bg-atencao/5 text-atencao"
                    : "border border-borda"
              }`}
            >
              <span className="sr-only">{b.autor === "voce" ? "Você: " : "Assistente: "}</span>
              {b.texto}
            </p>
          </div>
        ))}
        <div ref={fim} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(entrada);
        }}
        className="flex gap-2 border-t border-borda px-5 py-3"
      >
        <label htmlFor="resposta" className="sr-only">
          {pronto ? "Consultar cotação de um ativo" : "Sua resposta"}
        </label>
        <input
          id="resposta"
          ref={campo}
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          autoComplete="off"
          disabled={buscando}
          placeholder={
            buscando
              ? "Buscando cotação…"
              : pronto
                ? "Consulte: PETR4, MXRF11, IPCA+ 2035…"
                : "Digite sua resposta…"
          }
          className="flex-1 rounded-lg border border-borda bg-background px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!entrada.trim() || buscando}
          className="rounded-lg bg-acento px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {buscando ? "…" : "Enviar"}
        </button>
      </form>

      <footer className="space-y-1 border-t border-borda px-5 py-3">
        <p className="text-xs leading-relaxed text-muted">
          Seus dados ficam salvos apenas neste navegador (localStorage). Só o código do ativo é
          enviado ao servidor, para buscar a cotação.
        </p>
        <p className="text-xs leading-relaxed text-muted">
          Ações e fundos via Yahoo Finance; títulos públicos via Tesouro Transparente;
          indicadores via Banco Central. Nenhuma informação aqui é indicação de compra ou
          venda — a decisão é sua.
        </p>
      </footer>
    </section>
  );
}
