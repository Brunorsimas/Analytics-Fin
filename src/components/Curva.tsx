import { Card, Metrica } from "@/components/ui";

export type PontoCurva = { prazoAnos: number; taxa: number };

export type DadosCurva = {
  nominal: PontoCurva[];
  real: PontoCurva[];
  dataBase: string;
  fonte: string;
};

const pct = (v: number, casas = 2) =>
  `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

function interpolar(v: PontoCurva[], prazo: number): number | null {
  if (v.length === 0) return null;
  if (prazo <= v[0].prazoAnos) return v[0].taxa;
  const ultimo = v[v.length - 1];
  if (prazo >= ultimo.prazoAnos) return ultimo.taxa;
  for (let i = 0; i < v.length - 1; i++) {
    const a = v[i];
    const b = v[i + 1];
    if (prazo >= a.prazoAnos && prazo <= b.prazoAnos) {
      const span = b.prazoAnos - a.prazoAnos;
      if (span === 0) return a.taxa;
      return a.taxa + (b.taxa - a.taxa) * ((prazo - a.prazoAnos) / span);
    }
  }
  return ultimo.taxa;
}

/** Traçado SVG + tabela equivalente, para não depender só do visual. */
function Tracado({ pontos, cor, rotulo }: { pontos: PontoCurva[]; cor: string; rotulo: string }) {
  if (pontos.length < 2) return null;
  const W = 600;
  const H = 150;
  const prazos = pontos.map((p) => p.prazoAnos);
  const taxas = pontos.map((p) => p.taxa);
  const xMin = Math.min(...prazos);
  const xMax = Math.max(...prazos);
  const yMin = Math.min(...taxas);
  const yMax = Math.max(...taxas);
  const spanX = xMax - xMin || 1;
  const spanY = yMax - yMin || 0.01;

  const d = pontos
    .map((p, i) => {
      const x = ((p.prazoAnos - xMin) / spanX) * W;
      const y = H - ((p.taxa - yMin) / spanY) * (H - 20) - 10;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-32 w-full"
      role="img"
      aria-label={`${rotulo}: de ${pct(taxas[0])} em ${prazos[0].toFixed(1)} ano a ${pct(taxas[taxas.length - 1])} em ${prazos[prazos.length - 1].toFixed(0)} anos.`}
    >
      <path d={d} fill="none" stroke={cor} strokeWidth="2" />
      {pontos.map((p) => {
        const x = ((p.prazoAnos - xMin) / spanX) * W;
        const y = H - ((p.taxa - yMin) / spanY) * (H - 20) - 10;
        return <circle key={p.prazoAnos} cx={x} cy={y} r="2.5" fill={cor} />;
      })}
    </svg>
  );
}

export function Curva({ dados }: { dados: DadosCurva | null }) {
  if (!dados || (dados.nominal.length === 0 && dados.real.length === 0)) {
    return (
      <Card titulo="Curva de juros">
        <p className="text-sm text-muted">
          Fonte do Tesouro indisponível no momento. Os cálculos de renda fixa seguem com os
          indicadores do Banco Central.
        </p>
      </Card>
    );
  }

  const prazos = [1, 2, 3, 5, 10, 20, 30];
  const linhas = prazos
    .map((p) => {
      const nominal = interpolar(dados.nominal, p);
      const real = interpolar(dados.real, p);
      const implicita = nominal !== null && real !== null ? (1 + nominal) / (1 + real) - 1 : null;
      return { prazo: p, nominal, real, implicita };
    })
    .filter((l) => l.nominal !== null || l.real !== null);

  const n5 = interpolar(dados.nominal, 5);
  const r5 = interpolar(dados.real, 5);
  const i5 = n5 !== null && r5 !== null ? (1 + n5) / (1 + r5) - 1 : null;

  return (
    <Card titulo="Curva de juros">
      <p className="mb-4 text-sm text-muted">
        Quanto o mercado paga hoje para cada prazo. É o que define o preço de qualquer título de
        renda fixa — e a referência para julgar se uma taxa oferecida está boa.
      </p>

      <dl className="mb-5 grid grid-cols-3 gap-4">
        <Metrica rotulo="Juro nominal 5 anos" ajuda="Prefixado: taxa travada">
          {n5 !== null ? pct(n5) : "—"}
        </Metrica>
        <Metrica rotulo="Juro real 5 anos" ajuda="IPCA+: acima da inflação">
          {r5 !== null ? pct(r5) : "—"}
        </Metrica>
        <Metrica rotulo="Inflação implícita" ajuda="IPCA que faria os dois empatarem">
          {i5 !== null ? pct(i5) : "—"}
        </Metrica>
      </dl>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Nominal (prefixado)
          </p>
          <Tracado pontos={dados.nominal} cor="var(--acento)" rotulo="Curva nominal" />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Real (IPCA+)
          </p>
          <Tracado pontos={dados.real} cor="var(--positivo)" rotulo="Curva real" />
        </div>
      </div>

      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">Taxas por prazo</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2">Prazo</th>
            <th scope="col" className="py-2 text-right">Nominal</th>
            <th scope="col" className="py-2 text-right">Real</th>
            <th scope="col" className="py-2 text-right">Inflação implícita</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.prazo} className="border-t border-borda">
              <th scope="row" className="py-2 text-left font-normal">
                {l.prazo} {l.prazo === 1 ? "ano" : "anos"}
              </th>
              <td className="py-2 text-right tabular-nums">
                {l.nominal !== null ? pct(l.nominal) : "—"}
              </td>
              <td className="py-2 text-right tabular-nums">
                {l.real !== null ? pct(l.real) : "—"}
              </td>
              <td className="py-2 text-right tabular-nums text-muted">
                {l.implicita !== null ? pct(l.implicita) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 text-xs text-muted">
        Construída a partir das taxas negociadas de todos os títulos públicos, com interpolação
        entre os vencimentos. Fonte: {dados.fonte}, posição de{" "}
        {dados.dataBase.split("-").reverse().join("/")}.
      </p>
    </Card>
  );
}
