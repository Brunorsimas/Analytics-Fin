"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Chat } from "./Chat";
import { Resultado, type Mercado } from "./Resultado";
import { salvar, type PerfilLocal } from "@/lib/perfilLocal";

export type PerfilDemoCliente = { slug: string; nome: string; descricao: string; payload: PerfilLocal };

export function App({
  mercado,
  demos,
  curva,
}: {
  mercado: Mercado;
  demos: PerfilDemoCliente[];
  curva: ReactNode;
}) {
  const [perfil, setPerfil] = useState<PerfilLocal | null>(null);

  // `salvar` notifica o store do Chat, que relê o localStorage e se
  // reposiciona sozinho. Remontar o componente aqui criava uma corrida
  // entre o estado novo e a leitura do armazenamento.
  const aplicarDemo = useCallback((d: PerfilDemoCliente) => {
    salvar(d.payload);
    setPerfil(d.payload);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seu diagnóstico financeiro</h1>
        <p className="mt-1 text-sm text-muted">
          Responda ao assistente e o motor calcula seus gates, carteira-alvo e recomendações.
        </p>
      </div>

      <Chat onPerfil={setPerfil} />

      {!perfil && demos.length > 0 && (
        <section className="rounded-xl border border-borda bg-card p-5" aria-label="Exemplos">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Ou carregue um exemplo pronto
          </h2>
          <p className="mt-2 text-sm text-muted">
            Para ver o motor funcionando sem responder tudo. Substitui o que está no navegador.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {demos.map((d) => (
              <button
                key={d.slug}
                type="button"
                onClick={() => aplicarDemo(d)}
                aria-label={`Carregar exemplo ${d.nome}: ${d.descricao}`}
                className="rounded-lg border border-borda p-4 text-left hover:border-acento"
              >
                <span className="font-semibold">{d.nome}</span>
                <span className="mt-1 block text-xs text-muted">{d.descricao}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {perfil && <Resultado perfil={perfil} mercado={mercado} />}

      {curva}
    </div>
  );
}
