# Analytics Fin

Diagnóstico financeiro, acompanhamento de carteira e recomendação de investimentos com justificativa rastreável.

**Os dados financeiros do usuário ficam no navegador dele.** Não há cadastro, login nem banco de perfis. O servidor entrega apenas dados públicos de mercado.

---

## O que faz

**Assistente conversacional** — coleta renda, despesas, dívidas, objetivos e perfil de risco em português. Entende `3,5 mil`, `12% ao mês`, `5 anos`, `autônoma`, `ainda não`.

**Motor de recomendação em camadas** — gates de saúde financeira bloqueantes, alocação por classe de ativo, rebalanceamento por aporte novo. Toda recomendação exibe os dados do usuário que a originaram.

**Carteira em tempo real** — ações, FIIs, ETFs e BDRs da B3; títulos públicos com marcação a mercado, curva de juros e inflação implícita.

**Dicas de economia** — derivadas dos números do próprio usuário, com impacto mensal em reais e a base do cálculo declarada.

---

## Limites deliberados

Recomenda **classe de ativo**, nunca emissor ou ticker específico. Indicar ativo individual exige registro de consultoria na CVM (Resolução 19) — ver `ESCOPO.md`, seção 11.1.

Nenhuma saída diz "compre" ou "venda". Um teste varre todas as combinações procurando verbos de indicação e termos de garantia; falha se encontrar.

Nenhum número exibido vem de modelo de linguagem. O assistente é uma máquina de estados com parsers determinísticos — não há caminho pelo qual um LLM produza um valor na tela.

---

## Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Estilo | Tailwind CSS 4 |
| Banco | Lakebase Postgres no Neon — dados de referência apenas |
| Perfil do usuário | `localStorage` do navegador |
| Testes | `node:assert` + Playwright, sem framework |

## Fontes de dados

| Dado | Fonte | Licença |
|---|---|---|
| Ações, FIIs, ETFs, BDRs | Yahoo Finance | Não contratual |
| Títulos públicos (taxa e PU) | Tesouro Transparente | Dados abertos |
| Selic, CDI, IPCA | Banco Central — SGS (432, 4389, 13522) | Pública |

---

## Rodando localmente

```bash
npm install
neon link --project-id <seu-projeto>   # grava DATABASE_URL em .env.local
npm run migrar                          # cria schema e popula referência
npm run sync:tesouro                    # baixa o snapshot do Tesouro
npm run dev
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run verify` | Lint + 5 suítes de teste + build |
| `npm run e2e` | 54 testes no navegador (exige servidor rodando) |
| `npm run sync:tesouro` | Atualiza o snapshot dos títulos públicos |
| `npm run migrar` | Recria o schema de referência no Neon |

### Cobertura

| Suíte | Testes |
|---|---|
| Cálculo e motor | 56 |
| Parser e conversa | 108 |
| Ativos, dicas e cotação | 59 |
| Curva e renda fixa | 85 |
| Integração Neon e rede | 59 |
| End-to-end no navegador | 54 |

Invariantes verificados por teste, não por convenção: nenhuma requisição de escrita sai do navegador; a rota de cotação recebe só o ticker; nenhum `NaN` chega à tela; a curva nominal fica acima da real.

---

## Manutenção

`npm run sync:tesouro` precisa rodar diariamente para a curva refletir o mercado. O CSV oficial tem ~15 MB — pesado para cada requisição, leve para um job agendado.

---

## Aviso

Ferramenta de análise e organização financeira. Não constitui consultoria ou recomendação de valor mobiliário nos termos das Resoluções CVM 19 e 20.

Rentabilidade passada não garante rentabilidade futura. Todo investimento envolve risco de perda do capital.
