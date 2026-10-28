import { App, type PerfilDemoCliente } from "@/components/App";
import { Curva } from "@/components/Curva";
import { indicadoresAoVivo } from "@/lib/cotacao";
import { indicadores, perfisDemo } from "@/lib/neon";
import { tesouro } from "@/lib/tesouro";
import type { PerfilLocal } from "@/lib/perfilLocal";

export const dynamic = "force-dynamic";

/**
 * Nenhuma fonte externa pode derrubar a página: o assistente e o motor
 * funcionam só com o que o usuário informa. Falha de rede degrada o que
 * depende dela, não o produto inteiro.
 */
async function tolerante<T>(promessa: Promise<T>, padrao: T): Promise<T> {
  try {
    return await promessa;
  } catch {
    return padrao;
  }
}

const INDICADORES_PADRAO = {
  cdiAnual: 0.1465,
  selicAnual: 0.1475,
  ipcaAnual: 0.0462,
  atualizadoEm: "",
};

export default async function Home() {
  // Banco Central é a fonte primária dos indicadores; o Neon é o fallback.
  const [vivo, base, demosRaw, snapTesouro] = await Promise.all([
    tolerante(indicadoresAoVivo(), {
      ...INDICADORES_PADRAO,
      fonte: "valor de referência",
      aoVivo: false,
    }),
    tolerante(indicadores(), INDICADORES_PADRAO),
    tolerante(perfisDemo(), []),
    tolerante(tesouro(), null),
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
    : {
        cdiAnual: base.cdiAnual || INDICADORES_PADRAO.cdiAnual,
        selicAnual: base.selicAnual || INDICADORES_PADRAO.selicAnual,
        ipcaAnual: base.ipcaAnual || INDICADORES_PADRAO.ipcaAnual,
        atualizadoEm: base.atualizadoEm
          ? `${base.atualizadoEm} — referência`
          : "valor de referência",
        hoje,
      };

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
