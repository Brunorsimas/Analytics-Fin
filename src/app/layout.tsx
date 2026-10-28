import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Analytics Fin — diagnóstico e recomendação de investimentos",
  description:
    "Responda ao assistente e receba diagnóstico financeiro, carteira-alvo e recomendações com justificativa rastreável. Seus dados ficam no seu navegador.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <a href="#conteudo" className="pular-para-conteudo">
          Pular para o conteúdo
        </a>
        <header className="border-b border-borda bg-card">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="text-base font-bold">
              Analytics<span className="text-acento">Fin</span>
            </span>
            <span className="text-xs text-muted">
              Seus dados ficam só no seu navegador
            </span>
          </div>
        </header>
        <main id="conteudo" className="mx-auto max-w-4xl px-4 py-6">
          {children}
        </main>
        <footer className="mx-auto max-w-4xl px-4 pb-10 pt-4">
          <div className="rounded-lg border border-borda bg-card p-4 text-xs leading-relaxed text-muted">
            <p className="mb-1 font-semibold text-foreground">Aviso obrigatório</p>
            <p>
              Ferramenta de análise e organização financeira. Não constitui consultoria ou
              recomendação de valor mobiliário nos termos das Resoluções CVM 19 e 20. As sugestões
              são geradas por regras determinísticas a partir dos dados informados e se limitam a
              classes de ativo — nenhum emissor ou ticker específico é recomendado.
            </p>
            <p className="mt-1">
              Rentabilidade passada não garante rentabilidade futura. Todo investimento envolve
              risco de perda do capital. Dados de mercado desta demonstração são sintéticos.
            </p>
            <p className="mt-1">
              Privacidade: tudo que você informa fica no armazenamento local do seu navegador. Não
              há cadastro, login nem envio ao servidor. Limpar os dados do site apaga tudo.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
