import { App, type PerfilDemoCliente } from "@/components/App";
import { Curva } from "@/components/Curva";
import { indicadoresAoVivo } from "@/lib/cotacao";
import { indicadores, perfisDemo } from "@/lib/neon";
import { tesouro } from "@/lib/tesouro";
import type { PerfilLocal } from "@/lib/perfilLocal";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Banco Central como fonte primária; Neon é o fallback.
  const [vivo, base, demosRaw, snapTesouro] = await Promise.all([
    indicadoresAoVivo(),
    indicadores(),
    perfisDemo(),
    tesouro(),
  ]);
  const hoje = new Date().toISOString().slice(0, 10);
  const mercado = vivo.aoVivo
    ? {
        cdiAnual: vivo.cdiAnual,
        selicAnual: vivo.selicAnual,
        ipcaAnual: vivo.ipcaAnual,
        atualizadoEm: `${vivo.atualizadoEm.slice(0, 10)} — ${vivo.fonte}`,
        hoje,
      }
    : { ...base, atualizadoEm: `${base.atualizadoEm} — referência`, hoje };
  const demos: PerfilDemoCliente[] = demosRaw.map((d) => ({
    slug: d.slug,
    nome: d.nome,
    descricao: d.descricao,
    payload: d.payload as PerfilLocal,
  }));
  const dadosCurva = snapTesouro
    ? {
        nominal: snapTesouro.curva.nominal,
        real: snapTesouro.curva.real,
        dataBase: snapTesouro.dataBase,
        fonte: snapTesouro.fonte,
      }
    : null;

  return <App mercado={mercado} demos={demos} curva={<Curva dados={dadosCurva} />} />;
}
