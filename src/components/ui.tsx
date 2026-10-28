import type { ReactNode } from "react";

export function Card({
  titulo,
  children,
  acao,
  className = "",
}: {
  titulo?: string;
  children: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-borda bg-card p-5 ${className}`}
      aria-label={titulo}
    >
      {titulo && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{titulo}</h2>
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}

/** Acessibilidade: sinal textual + cor, nunca cor sozinha (escopo 5.5). */
export function Valor({
  centavos,
  sinal = false,
  className = "",
}: {
  centavos: number;
  sinal?: boolean;
  className?: string;
}) {
  const fmt = (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  if (!sinal) return <span className={`tabular-nums ${className}`}>{fmt}</span>;
  const pos = centavos >= 0;
  return (
    <span
      className={`tabular-nums font-semibold ${pos ? "text-positivo" : "text-negativo"} ${className}`}
    >
      <span aria-hidden="true">{pos ? "▲ " : "▼ "}</span>
      <span className="sr-only">{pos ? "ganho de " : "perda de "}</span>
      {fmt}
    </span>
  );
}

export function Pct({
  valor,
  sinal = true,
  casas = 2,
  className = "",
}: {
  valor: number;
  sinal?: boolean;
  casas?: number;
  className?: string;
}) {
  const fmt = `${(valor * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;
  if (!sinal) return <span className={`tabular-nums ${className}`}>{fmt}</span>;
  const pos = valor >= 0;
  return (
    <span className={`tabular-nums ${pos ? "text-positivo" : "text-negativo"} ${className}`}>
      <span aria-hidden="true">{pos ? "▲ " : "▼ "}</span>
      <span className="sr-only">{pos ? "alta de " : "queda de "}</span>
      {fmt}
    </span>
  );
}

export function Metrica({
  rotulo,
  children,
  ajuda,
}: {
  rotulo: string;
  children: ReactNode;
  ajuda?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted" title={ajuda}>
        {rotulo}
      </dt>
      <dd className="mt-1 text-xl font-semibold">{children}</dd>
      {ajuda && <p className="mt-1 text-xs text-muted">{ajuda}</p>}
    </div>
  );
}

export function Selo({
  children,
  tom = "neutro",
}: {
  children: ReactNode;
  tom?: "ok" | "erro" | "atencao" | "neutro" | "info";
}) {
  const cls = {
    ok: "border-positivo/40 text-positivo",
    erro: "border-negativo/40 text-negativo",
    atencao: "border-atencao/40 text-atencao",
    info: "border-acento/40 text-acento",
    neutro: "border-borda text-muted",
  }[tom];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

/** Barra com rótulo textual — informação não depende só do comprimento visual. */
export function Barra({
  pct,
  rotulo,
  tom = "acento",
}: {
  pct: number;
  rotulo?: string;
  tom?: "acento" | "positivo" | "negativo" | "atencao";
}) {
  const w = Math.max(0, Math.min(100, pct));
  const cor = {
    acento: "bg-acento",
    positivo: "bg-positivo",
    negativo: "bg-negativo",
    atencao: "bg-atencao",
  }[tom];
  return (
    <div
      role="meter"
      aria-valuenow={Math.round(w)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={rotulo ?? `${w.toFixed(1)}%`}
      className="h-2 w-full overflow-hidden rounded-full bg-borda"
    >
      <div className={`h-full ${cor}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  return (
    <p
      role="note"
      className="rounded-lg border border-atencao/40 bg-atencao/5 p-3 text-xs leading-relaxed text-atencao"
    >
      {children}
    </p>
  );
}

/** Gráfico de linha em SVG + tabela equivalente (escopo 5.5: alternativa tabular). */
export function Linha({
  pontos,
  rotulo,
}: {
  pontos: Array<{ data: string; valor: number }>;
  rotulo: string;
}) {
  if (pontos.length < 2) return <p className="text-sm text-muted">Dados insuficientes.</p>;
  const vals = pontos.map((p) => p.valor);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const W = 600;
  const H = 160;
  const d = pontos
    .map((p, i) => {
      const x = (i / (pontos.length - 1)) * W;
      const y = H - ((p.valor - min) / span) * (H - 10) - 5;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const subiu = vals[vals.length - 1] >= vals[0];

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full"
        role="img"
        aria-label={`${rotulo}. De ${(vals[0] / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} a ${(vals[vals.length - 1] / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`}
      >
        <path
          d={`${d} L${W},${H} L0,${H} Z`}
          fill={subiu ? "var(--positivo)" : "var(--negativo)"}
          opacity="0.1"
        />
        <path
          d={d}
          fill="none"
          stroke={subiu ? "var(--positivo)" : "var(--negativo)"}
          strokeWidth="2"
        />
      </svg>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted">Ver dados em tabela</summary>
        <table className="mt-2 w-full text-xs">
          <caption className="sr-only">{rotulo}</caption>
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="py-1">
                Mês
              </th>
              <th scope="col" className="py-1 text-right">
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.data} className="border-t border-borda">
                <td className="py-1">{p.data}</td>
                <td className="py-1 text-right tabular-nums">
                  {(p.valor / 100).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
