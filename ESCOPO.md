# Escopo — Plataforma de Acompanhamento Financeiro e Recomendação de Investimentos

**Versão:** 1.0
**Status:** Escopo inicial aprovado para refinamento técnico

---

## 1. Visão Geral

Plataforma web para pessoa física que unifica três domínios:

1. **Finanças pessoais** — receitas, despesas, orçamento, fluxo de caixa, dívidas.
2. **Carteira de investimentos** — posições, aportes, proventos, rentabilidade, consolidação multi-corretora.
3. **Recomendação personalizada** — sugestões de alocação e ativos derivadas do perfil, objetivos e situação real do usuário.

### 1.1 Problema

O usuário tem dados espalhados (extratos bancários, notas de corretagem, planilhas) e recebe recomendações genéricas que ignoram sua reserva de emergência, dívidas caras, horizonte e tolerância a risco.

### 1.2 Proposta de valor

Recomendação só é útil se for **personalizada e rastreável**. Toda sugestão gerada pela plataforma deve responder: *por que isso, para mim, agora?* — com os dados do usuário citados explicitamente.

### 1.3 Público-alvo

- Primário: investidor pessoa física, patrimônio de R$ 5 mil a R$ 2 milhões, mercado brasileiro.
- Secundário: usuário em organização financeira inicial (sem investimentos ainda).

### 1.4 Fora de escopo (v1)

- Execução de ordens / corretora integrada.
- Pessoa jurídica, holdings, consolidação familiar multi-titular.
- Mercado internacional além de BDRs, ETFs e ações US via conta global.
- Consultoria humana (chat com assessor).
- App mobile nativo (PWA responsivo cobre v1).

---

## 2. Requisitos Regulatórios e Legais (bloqueantes)

> Esta seção condiciona o produto. Nenhuma feature de recomendação vai a produção sem ela resolvida.

### 2.1 Enquadramento CVM

| Modelo | Regra | Implicação |
|---|---|---|
| **Conteúdo educacional / ferramenta** | Sem registro | Só análise descritiva, sem indicar ativo específico |
| **Analista de valores mobiliários** | CVM 20/2021 (Res. 20) | Permite recomendar ativo específico; exige profissional/empresa credenciada e relatório formal |
| **Consultor de valores mobiliários** | CVM 19/2021 (Res. 19) | Permite orientação personalizada; exige registro e contrato |
| **Robô-advisor** | Res. 19 + Ofício Circular CVM/SIN | Consultoria automatizada; exige registro, descrição do algoritmo, suitability |

**Decisão necessária antes do desenvolvimento do módulo de recomendação.** Modelo recomendado para v1: operar como **ferramenta de análise e alocação por classe de ativo** (sem indicar emissor/ticker específico) até obter registro de consultoria.

### 2.2 Suitability — obrigatório

Resolução CVM 30/2021. A plataforma deve:

- Aplicar questionário de perfil de investidor (API).
- Reaplicar a cada 24 meses ou quando houver mudança relevante declarada.
- Bloquear/alertar recomendação incompatível com o perfil.
- Registrar em log imutável: perfil vigente, recomendação emitida, data, versão do algoritmo.

### 2.3 LGPD

- Dado financeiro é **dado pessoal sensível por contexto** — tratamento com base legal explícita (consentimento + execução de contrato).
- Consentimento granular e revogável por finalidade (Open Finance, marketing, analytics).
- Direitos do titular: acesso, portabilidade (export JSON/CSV), correção, eliminação.
- Prazo de eliminação após encerramento de conta: 30 dias, exceto retenção legal (5 anos para registros fiscais).
- Nomear encarregado (DPO) e publicar canal de contato.
- Registro de operações de tratamento (ROPA).
- Relatório de impacto (RIPD) para o módulo de recomendação automatizada.
- Direito à revisão humana de decisão automatizada (art. 20).

### 2.4 Disclaimers obrigatórios

Exibidos em toda tela de recomendação, não ocultáveis:

- Rentabilidade passada não garante rentabilidade futura.
- Investimentos envolvem risco de perda do capital.
- Qual a natureza da recomendação (automatizada / informativa / consultoria registrada).
- Conflitos de interesse e forma de remuneração da plataforma.

### 2.5 Open Finance

- Integração via instituição autorizada (agregador regulado) ou credenciamento próprio.
- Escopo de consentimento com prazo máximo de 12 meses, renovável com ação do usuário.
- Revogação de consentimento disponível em 1 clique.

---

## 3. Domínio de Dados

> Dados que a recomendação **precisa** para ser personalizada. Campos marcados `obrigatório` bloqueiam a geração de recomendação.

### 3.1 Perfil do Usuário

```
Usuario
  id, email, telefone
  nome_completo, cpf (criptografado)
  data_nascimento            obrigatório  -> idade, horizonte, previdência
  estado_civil
  dependentes: int           obrigatório  -> necessidade de seguro/reserva
  profissao
  estabilidade_renda: enum(estavel|variavel|autonomo|aposentado|desempregado)  obrigatório
  escolaridade_financeira: enum(iniciante|intermediario|avancado)
  uf_residencia                           -> aspectos tributários/previdência
  criado_em, atualizado_em
```

### 3.2 Situação Financeira

```
SituacaoFinanceira
  renda_mensal_liquida           obrigatório
  renda_variavel_media
  despesa_mensal_media           obrigatório  (derivável de transações)
  custo_fixo_essencial           obrigatório  -> base da reserva de emergência
  capacidade_aporte_mensal       obrigatório
  patrimonio_liquido_total
  imoveis: [{tipo, valor, financiado, saldo_devedor, parcela}]
  reserva_emergencia_atual       obrigatório
  possui_seguro_vida: bool
  possui_plano_saude: bool
  fgts_saldo
  previdencia_privada: [{tipo PGBL|VGBL, saldo, aporte_mensal, tributacao}]
  declaracao_ir: enum(completa|simplificada|isento)   -> relevante para PGBL
```

### 3.3 Dívidas

```
Divida
  tipo: enum(cartao|cheque_especial|consignado|pessoal|financiamento_imovel|financiamento_veiculo|estudantil|outro)
  saldo_devedor         obrigatório
  taxa_juros_mensal     obrigatório   -> regra: dívida cara vence qualquer investimento
  parcela_mensal
  parcelas_restantes
  em_atraso: bool
  garantia: bool
```

### 3.4 Objetivos

```
Objetivo
  nome
  tipo: enum(reserva_emergencia|aposentadoria|imovel|veiculo|educacao|viagem|independencia_financeira|outro)
  valor_alvo              obrigatório
  data_alvo               obrigatório  -> horizonte define a classe de ativo
  valor_atual
  aporte_mensal_dedicado
  prioridade: 1..5        obrigatório
  flexivel: bool                        -> data pode ser adiada?
  status: enum(ativo|atingido|pausado|cancelado)
```

### 3.5 Perfil de Risco (suitability)

```
PerfilRisco
  classificacao: enum(conservador|moderado|arrojado)   obrigatório
  score: 0..100
  respostas_questionario: jsonb         obrigatório  (auditoria)
  tolerancia_perda_declarada_pct        obrigatório  -> "quanto você aceita cair em 1 ano"
  horizonte_principal_meses             obrigatório
  experiencia_produtos: [renda_fixa, fundos, acoes, fiis, derivativos, cripto, exterior]
  restricoes: [sem_cripto, sem_derivativos, apenas_esg, sem_setor_X, ...]
  liquidez_minima_exigida_pct
  data_aplicacao, data_validade (24 meses)  obrigatório
  versao_questionario
```

### 3.6 Contas e Transações

```
ContaFinanceira
  tipo: enum(corrente|poupanca|corretora|carteira_digital|cartao_credito)
  instituicao, apelido
  saldo_atual
  origem: enum(manual|open_finance|importacao_ofx|importacao_csv)
  consentimento_id (se open finance)
  ultima_sincronizacao

Transacao
  conta_id, data, descricao
  valor (sinalizado)
  categoria_id              obrigatório para orçamento
  tipo: enum(receita|despesa|transferencia|investimento)
  recorrente: bool
  tag[]
  hash_deduplicacao         -> evitar duplicidade entre importação e Open Finance
  origem, conciliada: bool

Categoria
  nome, categoria_pai_id, tipo, essencial: bool, icone, cor
  (seed padrão + customizável pelo usuário)
```

### 3.7 Investimentos

```
Ativo
  ticker, nome, classe: enum(renda_fixa_pos|renda_fixa_pre|renda_fixa_ipca|acao|fii|etf|bdr|fundo|cripto|exterior|previdencia|tesouro)
  subclasse, setor, emissor
  moeda, pais
  indexador: enum(CDI|IPCA|SELIC|PRE|nenhum)
  taxa_contratada
  vencimento
  liquidez_dias
  possui_fgc: bool
  risco_credito_rating
  tributacao: enum(tabela_regressiva|15pct|isento|come_cotas|20pct_daytrade)

Posicao
  conta_id, ativo_id
  quantidade, preco_medio
  valor_investido, valor_atual
  data_primeira_compra

Operacao
  conta_id, ativo_id
  tipo: enum(compra|venda|aporte|resgate|bonificacao|desdobramento|grupamento|subscricao|amortizacao|vencimento)
  data, quantidade, preco_unitario, taxas, impostos
  origem

Provento
  ativo_id, tipo: enum(dividendo|jcp|rendimento|aluguel|cupom|juros)
  data_com, data_pagamento, valor_por_cota, valor_total, ir_retido
```

### 3.8 Dados de Mercado (externos)

```
CotacaoDiaria      ativo_id, data, abertura, fechamento, min, max, volume
Indicador          codigo(CDI|SELIC|IPCA|IBOV|IFIX|IGPM|USD|PTAX), data, valor
Fundamentos        ativo_id, data, pl, pvp, dy, roe, divida_liquida_ebitda, patrimonio, vacancia(FII)
CurvaJuros         data, vertice, taxa     -> precificação de renda fixa e marcação a mercado
```

---

## 4. Módulos Funcionais

### 4.1 Onboarding e Cadastro

- Cadastro email/senha + OAuth (Google, Apple).
- MFA obrigatório (TOTP) — dado financeiro exige.
- Verificação de email e telefone.
- Aceite versionado de Termos, Política de Privacidade e consentimentos granulares.
- Wizard de onboarding (ordem importa — cada etapa alimenta a seguinte):
  1. Dados pessoais e renda
  2. Despesas e custo fixo essencial
  3. Dívidas
  4. Patrimônio e investimentos atuais
  5. Objetivos
  6. Questionário de suitability
  7. Primeiro diagnóstico
- Salvamento parcial e retomada; indicador de completude do perfil (%).

### 4.2 Finanças Pessoais

- **Lançamentos:** manual, importação OFX/CSV/QIF, Open Finance, recorrentes.
- **Categorização:** regras do usuário + sugestão automática por descrição; aprendizado por confirmação.
- **Orçamento:** limite por categoria, acompanhamento no mês, alerta de estouro.
- **Fluxo de caixa:** projeção de 12 meses com base em recorrentes e média móvel.
- **Dívidas:** simulador de quitação (bola de neve vs avalanche), comparativo quitar vs investir.
- **Conciliação:** deduplicação entre fontes.
- **Indicadores:** taxa de poupança, meses de reserva, comprometimento de renda, patrimônio líquido ao longo do tempo.

### 4.3 Acompanhamento de Investimentos

- Consolidação multi-conta e multi-corretora.
- Entrada: manual, importação de nota de corretagem (PDF/CSV), extrato B3 (CEI), Open Finance investimentos.
- **Rentabilidade:**
  - TWR (time-weighted) — avalia o ativo/carteira isolando aportes.
  - MWR / XIRR (money-weighted) — avalia o resultado do investidor.
  - Nominal e real (descontado IPCA).
  - Bruta e líquida (IR + taxas).
- **Benchmarks:** CDI, IBOV, IFIX, IPCA+, IVVB11/S&P500, carteira-alvo.
- **Risco:** volatilidade anualizada, drawdown máximo, Sharpe, beta vs IBOV, VaR histórico.
- **Composição:** por classe, setor, emissor, indexador, moeda, liquidez, vencimento.
- **Concentração:** alerta de emissor acima do limite, posição acima de X% da carteira, teto do FGC (R$ 250 mil/emissor, R$ 1 milhão/CPF a cada 4 anos).
- **Proventos:** calendário, histórico, yield on cost, projeção.
- **Renda fixa:** marcação a mercado, fluxo de vencimentos, duration.
- **Impostos:** apuração mensal de ações/FIIs, isenção de R$ 20 mil em ações, prejuízo acumulado compensável, come-cotas, geração de dados para DARF e para a declaração anual.

### 4.4 Motor de Recomendação

> Núcleo do produto. Arquitetura em camadas — **regras determinísticas primeiro**, modelo estatístico depois, LLM apenas para explicação em linguagem natural.

#### Camada 1 — Gates de Saúde Financeira (ordem fixa, bloqueantes)

Nenhuma recomendação de investimento de risco é emitida enquanto um gate anterior estiver aberto.

| # | Gate | Condição de aprovação | Ação se reprovado |
|---|---|---|---|
| 1 | Fluxo de caixa | Receita > despesa | Plano de corte de despesa |
| 2 | Dívida cara | Nenhuma dívida com taxa > meta de retorno realista | Quitar dívida é a "melhor aplicação" |
| 3 | Reserva de emergência | ≥ 3 meses (CLT) / 6 meses (autônomo) / 12 meses (renda instável + dependentes) de custo essencial, em liquidez diária | Direcionar 100% do aporte à reserva |
| 4 | Proteção | Seguro de vida se houver dependentes; plano de saúde | Alerta, não bloqueia |
| 5 | Suitability vigente | Questionário aplicado e válido (< 24 meses) | Reaplicar questionário |

#### Camada 2 — Alocação Estratégica (classe de ativo)

Entrada: perfil de risco, horizonte por objetivo, capacidade de aporte, restrições, cenário macro (Selic, IPCA, curva de juros).

Saída: carteira-alvo por classe, com faixas (mín/alvo/máx), por objetivo e consolidada.

Método:
- Base: matriz perfil × horizonte (determinística, auditável, documentada).
- Refinamento: otimização com restrições (Black-Litterman ou média-variância com limites), ajuste por capacidade de perda declarada.
- Ajuste tático limitado (±5 p.p.) por indicador macro — com justificativa registrada.

#### Camada 3 — Seleção de Produtos

> Só habilitada no modelo regulatório que permite indicar ativo específico (seção 2.1).

Filtros e score por classe:
- **Renda fixa:** taxa vs curva de juros, risco de crédito, FGC, liquidez vs horizonte do objetivo, tributação.
- **Ações:** fundamentos, liquidez média diária, setor (limite de concentração), governança.
- **FIIs:** P/VP, DY sustentável, vacância, tipo (tijolo/papel/híbrido), liquidez, concentração de inquilino.
- **Fundos/ETFs:** taxa de administração, taxa de performance, tracking error, patrimônio mínimo, histórico, gestora.
- **Previdência:** PGBL só se declaração completa e aporte ≤ 12% da renda bruta; comparar taxas.

Hard filters sempre aplicados: restrições do usuário, produto acima do perfil, liquidez incompatível com a data do objetivo, aporte mínimo acima da capacidade.

#### Camada 4 — Rebalanceamento

- Gatilhos: desvio de banda (ex.: ±5 p.p. da classe), calendário (trimestral/semestral), evento (aporte, resgate, mudança de perfil/objetivo).
- Estratégia preferencial: **rebalancear por aporte novo**, evitando venda e fato gerador de IR.
- Simulação obrigatória antes da sugestão: custo de IR, taxas e impacto na rentabilidade líquida.

#### Camada 5 — Explicação

Toda recomendação carrega:

```
Recomendacao
  id, usuario_id, data
  tipo: enum(gate|alocacao|produto|rebalanceamento|alerta)
  titulo, acao_sugerida, valor_sugerido
  prioridade
  justificativa_estruturada: [
    {fator, dado_do_usuario, peso, direcao}
  ]
  explicacao_texto           (gerada a partir da justificativa estruturada)
  riscos_associados[]
  alternativas[]
  cenario_se_nao_seguir
  perfil_risco_versao, algoritmo_versao, dados_mercado_data
  status: enum(pendente|aceita|rejeitada|expirada)
  feedback_usuario
```

**Regra inegociável:** o texto da explicação é derivado de `justificativa_estruturada`. LLM redige, nunca decide. Nenhum número na explicação pode ser inventado pelo modelo.

#### Camada 6 — Simulador

- Projeção de patrimônio (determinística + Monte Carlo com percentis 10/50/90).
- "E se": aumentar aporte, adiar objetivo, mudar perfil, cenário de crise.
- Probabilidade de atingir cada objetivo na data-alvo.
- Independência financeira: patrimônio necessário, data estimada, taxa de retirada segura.

### 4.5 Consultas e Assistente

Consultas obrigatórias que o sistema deve responder com dados do usuário:

- "Como está minha carteira?" — composição, rentabilidade, risco, desvio da meta.
- "Quanto rendi no período X?" — TWR, MWR, vs benchmarks, líquido de IR.
- "Onde invisto meus próximos R$ X?" — aplica gates → alocação → produto.
- "Devo quitar a dívida Y ou investir?" — comparativo quantitativo.
- "Estou no caminho do objetivo Z?" — gap, aporte necessário, probabilidade.
- "Qual meu risco de concentração?" — emissor, setor, ativo, FGC.
- "Quanto vou pagar de IR este mês?" — apuração.
- "O que mudou desde o último acesso?" — delta de patrimônio, proventos, alertas.

Assistente em linguagem natural:
- Acesso somente leitura aos dados do próprio usuário (isolamento rígido por `usuario_id`).
- Cálculos executados por funções determinísticas; o LLM apenas orquestra e redige.
- Recusa explícita para: garantia de retorno, previsão de preço, dica de day trade, pedido fora do perfil.
- Log completo de pergunta/resposta para auditoria.

### 4.6 Alertas e Notificações

| Categoria | Exemplos |
|---|---|
| Saúde financeira | Estouro de orçamento, saldo projetado negativo, reserva abaixo do mínimo |
| Carteira | Desvio de alocação, concentração excedida, vencimento de renda fixa, FGC estourado |
| Proventos | Data-com próxima, provento creditado |
| Fiscal | DARF a pagar no mês, prazo (último dia útil do mês seguinte), prejuízo a compensar |
| Objetivos | Objetivo atingido, atraso em relação à meta |
| Conformidade | Suitability vencendo, consentimento Open Finance expirando |

Canais: in-app, email, push (PWA). Preferências e frequência configuráveis.

### 4.7 Relatórios

- Mensal: patrimônio, fluxo, rentabilidade, proventos, movimentações.
- Anual: consolidado para declaração de IR (posição em 31/12, custo de aquisição, proventos, ganhos/perdas).
- Export: PDF, CSV, JSON (portabilidade LGPD).

---

## 5. Arquitetura Técnica

### 5.1 Stack sugerida

| Camada | Escolha | Motivo |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | SSR para dashboards, PWA |
| Backend | API em TypeScript (mesma base) ou Python (FastAPI) para o motor quantitativo | reaproveitamento de tipos / ecossistema numérico |
| Banco | PostgreSQL | transacional + extensões; séries temporais em tabela particionada |
| Cache/fila | Redis | sessão, rate limit, jobs |
| Jobs | Worker agendado | sync Open Finance, cotações, recálculo de carteira, alertas |
| Auth | Provedor com MFA | não reimplementar autenticação |
| Observabilidade | Logs estruturados + APM + alertas | obrigatório para auditoria |

> Decisão pendente: linguagem do motor quantitativo. Se o cálculo de otimização exigir `numpy/scipy/pandas`, separar em serviço Python; caso contrário manter monolito TS.

### 5.2 Princípios de modelagem

- **Toda operação é imutável e append-only.** Posição é projeção derivada de operações, nunca editada diretamente.
- **Valores monetários em inteiro (centavos)** ou `numeric`, nunca float.
- **Quantidade de ativo:** `numeric` com 8 casas decimais (cripto, frações).
- **Fuso horário:** armazenar UTC, exibir America/Sao_Paulo.
- Timeline de patrimônio materializada e recalculada em job.
- Versionamento de: questionário de suitability, algoritmo de recomendação, termos aceitos.

### 5.3 Integrações

| Integração | Uso | Criticidade |
|---|---|---|
| Open Finance (agregador regulado) | contas, transações, investimentos | alta |
| Provedor de cotações (B3, fundos, cripto) | preços, histórico | alta |
| Banco Central (SGS) | CDI, Selic, IPCA, câmbio | alta |
| ANBIMA | curva de juros, índices, dados de fundos | média |
| CVM (dados abertos de fundos) | fundamentos de fundos | média |
| Parser de nota de corretagem | importação manual | média |
| Email/Push | notificações | média |

Toda integração externa precisa de: timeout, retry com backoff, circuit breaker, cache e **fallback para entrada manual**. O produto deve funcionar 100% com dados manuais.

### 5.4 Segurança

- TLS 1.3; HSTS.
- Criptografia em repouso; campos sensíveis (CPF, token de consentimento, credenciais) com criptografia a nível de coluna.
- Segredos em cofre, nunca em repositório.
- MFA obrigatório; sessões com expiração e revogação.
- Rate limiting por IP e por usuário.
- Isolamento de dados por `usuario_id` em **toda** query (RLS no Postgres como rede de segurança).
- Log de auditoria imutável: acesso a dado financeiro, alteração de perfil, emissão de recomendação, consentimentos.
- Backup diário com teste de restauração; RPO 24h, RTO 4h.
- Plano de resposta a incidente com notificação à ANPD em caso de vazamento.

### 5.5 Acessibilidade

- WCAG 2.1 nível AA.
- Navegação completa por teclado; foco visível.
- Contraste mínimo 4.5:1.
- Gráficos com alternativa tabular e rótulos textuais — informação **nunca** transmitida só por cor (perda/ganho precisa de sinal ou ícone, não apenas vermelho/verde).
- Leitor de tela: valores monetários e percentuais com rótulo semântico.

---

## 6. Regras de Negócio Críticas

| ID | Regra |
|---|---|
| RN01 | Recomendação de investimento de risco bloqueada enquanto houver dívida com taxa superior à meta de retorno realista da carteira |
| RN02 | Reserva de emergência tem prioridade absoluta sobre qualquer outro objetivo |
| RN03 | Reserva de emergência só em ativo de liquidez D+0/D+1 e risco baixo |
| RN04 | Horizonte < 2 anos → sem renda variável para aquele objetivo |
| RN05 | Produto acima do perfil de risco exige aceite explícito de termo de ciência, registrado |
| RN06 | Suitability vencido (> 24 meses) suspende a emissão de novas recomendações |
| RN07 | Concentração máxima por emissor de renda fixa respeita o teto do FGC quando o FGC for a premissa de segurança |
| RN08 | Rebalanceamento prefere aporte novo a venda, salvo desvio acima do limite crítico |
| RN09 | Toda recomendação exibe explicação com os dados do usuário que a originaram |
| RN10 | Nenhum número exibido ao usuário pode ser gerado por LLM — apenas por função determinística |
| RN11 | Rentabilidade exibida é sempre líquida de taxas; a versão bruta é opcional e rotulada |
| RN12 | Dado de mercado desatualizado além do limite (ex.: 24h) exibe aviso e desabilita recomendação de produto |
| RN13 | Perfil incompleto (campos obrigatórios da seção 3) bloqueia recomendação e indica o que falta |
| RN14 | PGBL só é recomendado se declaração completa, respeitando o limite de 12% da renda bruta |
| RN15 | Revogação de consentimento Open Finance interrompe a sincronização imediatamente e preserva dados já importados conforme escolha do usuário |

---

## 7. Métricas de Sucesso

| Métrica | Alvo v1 |
|---|---|
| Conclusão do onboarding | > 60% |
| Perfil completo (campos obrigatórios) | > 70% dos ativos |
| Recomendações aceitas | > 30% |
| Usuários com reserva de emergência completa após 6 meses | +25 p.p. |
| Retenção em 90 dias | > 40% |
| Acurácia da categorização automática | > 85% |
| Latência P95 do dashboard | < 1,5 s |
| Disponibilidade | 99,5% |

---

## 8. Roadmap

### Fase 0 — Fundação
Decisão regulatória (seção 2.1), modelagem de dados, auth + MFA, LGPD operacional.

### Fase 1 — MVP
Onboarding, lançamentos manuais e importação OFX/CSV, categorização, orçamento, dívidas, carteira manual, rentabilidade TWR/XIRR, benchmarks, objetivos, suitability, **Camadas 1 e 2 do motor** (gates + alocação por classe), dashboard, alertas básicos.

### Fase 2 — Automação
Open Finance, importação de nota de corretagem e extrato B3, proventos automáticos, rebalanceamento, simulador Monte Carlo, apuração de IR.

### Fase 3 — Recomendação de produto
Camada 3 (sujeita ao registro regulatório), assistente em linguagem natural, relatório anual de IR, PWA offline.

### Fase 4 — Expansão
Exterior, cripto, previdência comparativa, tributação avançada, relatórios compartilháveis.

---

## 9. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Não obter registro CVM | Bloqueia Camada 3 | Produto viável nas Camadas 1–2; arquitetura permite ligar/desligar a Camada 3 |
| Qualidade do dado de mercado | Recomendação errada | Múltiplas fontes, validação de sanidade, bloqueio por dado velho (RN12) |
| Custo de Open Finance | Inviabiliza unit economics | Entrada manual e importação como caminho completo e gratuito |
| LLM alucinando número | Dano direto ao usuário e risco legal | RN10 — cálculo determinístico, LLM só redige |
| Vazamento de dado financeiro | Existencial | Seção 5.4 integral, pentest antes do lançamento |
| Recomendação enviesada por produto remunerado | Conflito de interesse | Divulgação obrigatória de remuneração; separar score de qualidade de score comercial |

---

## 10. Checklist de Completude do Escopo

- [x] Visão, público, proposta de valor
- [x] Fora de escopo explícito
- [x] Enquadramento regulatório (CVM 19/20/30)
- [x] Suitability e validade
- [x] LGPD: bases legais, direitos, RIPD, decisão automatizada
- [x] Disclaimers obrigatórios
- [x] Modelo de dados completo com campos obrigatórios marcados
- [x] Dívidas e proteção (seguro) modelados
- [x] Objetivos com horizonte e prioridade
- [x] Finanças pessoais: lançamento, categorização, orçamento, fluxo, conciliação
- [x] Investimentos: consolidação, TWR/MWR, risco, benchmark, proventos, renda fixa, IR
- [x] Motor de recomendação em camadas com gates bloqueantes
- [x] Rebalanceamento com custo tributário
- [x] Explicabilidade estruturada e versionamento de algoritmo
- [x] Simulador e Monte Carlo
- [x] Consultas obrigatórias definidas
- [x] Alertas e relatórios
- [x] Arquitetura, integrações com fallback manual
- [x] Segurança, backup, auditoria
- [x] Acessibilidade WCAG AA
- [x] Regras de negócio numeradas (RN01–RN15)
- [x] Métricas, roadmap faseado, riscos

### Pendências que travam o início do desenvolvimento

1. **Decisão de enquadramento CVM** — define se a Camada 3 existe na v1.
2. **Modelo de receita** — assinatura, freemium ou comissão; comissão exige tratamento explícito de conflito de interesse.
3. **Escolha do agregador de Open Finance e do provedor de cotações** — custo define o preço do plano.
4. **Linguagem do motor quantitativo** (seção 5.1).
5. **Fonte oficial da curva de juros** para marcação a mercado (ANBIMA é paga).

---

## 11. Detalhamento das Pendências

### 11.1 Enquadramento CVM

**Decisão:** a plataforma indica ativo específico (ticker/emissor) ou para na classe de ativo?

| Opção | Permite | Exige |
|---|---|---|
| Ferramenta/educacional | Alocação por classe, diagnóstico, simulação, consolidação | Nada — só disclaimer |
| Consultor (Res. CVM 19) | Recomendação personalizada de ativo específico | Registro CVM, diretor responsável certificado, formulário de referência anual, código de conduta, controles internos, taxa de fiscalização trimestral, vedação de custódia e execução |
| Analista (Res. CVM 20) | Relatório de análise público, não personalizado | Credenciamento em entidade autorizada; não serve a recomendação 1:1 |

Robô-advisor = consultoria automatizada sob Res. 19. Exige descrever o algoritmo no formulário de referência e manter responsável humano identificado.

**Critério:** Camadas 1–2 do motor (gates + alocação por classe) cabem no modelo ferramenta. Camada 3 não.

**Recomendado:** lançar como ferramenta, arquitetar Camada 3 atrás de feature flag, iniciar registro em paralelo.

**Destrava:** escopo da Fase 1 e Fase 3; textos de disclaimer; se o módulo de suitability é obrigatório legal ou boa prática.

> Esta análise não substitui parecer jurídico. Validar enquadramento com advogado especializado em mercado de capitais antes de qualquer lançamento — operar como consultor sem registro é infração administrativa sujeita a multa e termo de impedimento.

### 11.2 Modelo de receita

| Modelo | Prós | Contra |
|---|---|---|
| Assinatura | Sem conflito de interesse, receita previsível, alinhada ao usuário | Conversão difícil, exige valor alto no free |
| Freemium | Topo de funil, consolidação grátis / recomendação paga | Custo de Open Finance no usuário gratuito sangra margem |
| Comissão / rebate de distribuidor | Gratuito ao usuário | Conflito direto com RN09; sob Res. 19 exige divulgação de toda remuneração de terceiro ligada ao produto recomendado |

**Problema estrutural da comissão:** o score de recomendação passa a ter incentivo comercial. Se adotada, separar fisicamente `score_qualidade` de `score_comercial`, exibir ambos, e nunca ordenar por comercial.

**Recomendado:** assinatura, com free limitado a entrada manual (custo marginal ≈ 0) e Open Finance só no pago.

**Destrava:** preço do plano, orçamento de integração (11.3), decisão de feature flag no free.

### 11.3 Agregador Open Finance + provedor de cotações

**Open Finance (BR):** Pluggy, Belvo, Klavi. Avaliar por: cobertura de **investimentos** (não só conta corrente), preço por consentimento ativo/mês, qualidade do dado de posição e operação, sandbox.

**Cotações e indicadores:**

| Dado | Fonte gratuita | Fonte paga |
|---|---|---|
| Ações, FIIs, ETFs BR | brapi.dev | B3 UP2DATA |
| CDI, Selic, IPCA, PTAX | BCB SGS (API aberta) | — |
| Tesouro Direto (preço/taxa diária, histórico) | Tesouro Transparente (CSV) | — |
| Fundos (cota, patrimônio, taxa) | CVM dados abertos | ANBIMA |
| Cripto | CoinGecko | — |
| Exterior | Twelve Data / Alpha Vantage (free tier) | — |

**Critério:** teto de custo por usuário/mês ≤ 15% da mensalidade.

**Recomendado:** Fase 1 só com fontes gratuitas + entrada manual. Contratar agregador só na Fase 2, com preço já validado.

**Destrava:** preço do plano, roadmap da Fase 2, SLA de atualização (RN12).

### 11.4 Linguagem do motor quantitativo

| Cálculo | Precisa de lib numérica? |
|---|---|
| TWR, XIRR, volatilidade, drawdown, Sharpe, beta | Não — aritmética + Newton-Raphson |
| Monte Carlo 10k caminhos × 480 meses | Não — loop puro, < 1s em TS |
| Matriz perfil × horizonte | Não — tabela |
| Otimização com restrições (Black-Litterman, média-variância) | **Sim** — QP solver, `cvxpy`/`scipy` |

Só a otimização justifica Python, e ela não está no MVP.

**Recomendado:** monolito TypeScript. Extrair serviço Python apenas quando a otimização com restrições entrar.

**Destrava:** estrutura do repositório, pipeline de deploy, contratação.

### 11.5 Fonte da curva de juros

| Fonte | Custo | Qualidade |
|---|---|---|
| ANBIMA ETTJ | Pago | Padrão de mercado, Nelson-Siegel-Svensson pronta |
| Tesouro Transparente | Grátis | Preço e taxa diários de todos os títulos públicos, com histórico |
| DI futuro B3 | Grátis | Curva pré de mercado, vértices líquidos |

**Recomendado:** curva a partir de Tesouro Transparente + DI futuro, interpolação por spline cúbica. Precisão suficiente para marcação a mercado exibida ao usuário. Assinar ANBIMA só se precificar crédito privado com spread.

**Destrava:** marcação a mercado da Fase 2, duration, alerta de vencimento.

**Ordem de resolução:** 11.1 → 11.2 → 11.3. Itens 11.4 e 11.5 já têm recomendação executável.

---

## 12. Decisões de Implementação

### 12.1 Autenticação — adiada (decisão consciente)

A v0 opera **sem cadastro, sem login e sem sessão**. Qualquer pessoa com o link informa um nome e seus dados; tudo fica no armazenamento local do próprio navegador.

**Motivo:** o valor do produto está no motor de recomendação, não na tela de login. Além disso, sem conta não há banco de dados pessoais para vazar — o risco de privacidade da demonstração é estruturalmente baixo.

**O que já está preparado para quando entrar:**

| Item | Estado |
|---|---|
| Formato do perfil | `PerfilLocal` já é o shape que a tabela vai guardar |
| Ponto único de troca | `carregar()` / `salvar()` em `src/lib/perfilLocal.ts` |
| Motor desacoplado | `gerarRecomendacoes()` recebe dados puros, não conhece origem |
| Valores em centavos inteiros | Migra para Postgres sem conversão |

**Quando implementar:** antes de qualquer dado real precisar sobreviver à troca de dispositivo ou à limpeza do navegador.

**O que entra junto, obrigatoriamente:** MFA (TOTP), Postgres com RLS, criptografia de CPF em nível de coluna, consentimento LGPD versionado, log de auditoria imutável. Nenhum deles é opcional — ver seções 2.3 e 5.4.

### 12.2 Persistência — separação por sensibilidade do dado

Dois armazenamentos, divididos por quem é dono do dado:

| Onde | O que | Por quê |
|---|---|---|
| **Neon (Lakebase Postgres)** | Ativos, cotações, indicadores de mercado, perfis de demonstração | Dado público, igual para todos, precisa de atualização central |
| **localStorage do navegador** | Tudo que o usuário informa: renda, despesas, dívidas, objetivos, perfil de risco | Dado financeiro pessoal nunca trafega para o servidor |

Projeto Neon: `damp-frog-41254058`, região `aws-us-east-2`.

Schema de referência: `ativo`, `cotacao`, `indicador`, `perfil_demo`. Nenhuma tabela guarda dado de usuário final.

**Consequência arquitetural:** o motor de recomendação roda **no cliente**. O servidor entrega apenas os indicadores de mercado e o bundle. Isso é verificado por teste: o e2e falha se houver qualquer requisição POST/PUT/PATCH durante o uso.

**Teto:** sem sincronização entre dispositivos; limpar os dados do site apaga tudo; sem histórico de longo prazo.

**Upgrade quando houver conta:** mover o perfil para Postgres com Row Level Security por `usuario_id`, criptografia de CPF em nível de coluna e MFA. Valores já estão em centavos inteiros e o schema é agnóstico.

### 12.2.1 Assistente de entrada de dados

Chat em máquina de estados determinística (`src/lib/conversa.ts`) com parsers em português (`src/lib/parser.ts`).

**Nenhum modelo de linguagem é usado.** O assistente reconhece números, prazos, taxas e respostas objetivas por expressão regular. Isso mantém RN10 de forma estrutural: não existe caminho pelo qual um número exibido tenha vindo de um LLM.

Cobertura de entrada em português: `3.500,00`, `3,5 mil`, `5k`, `2 milhões`, `12% ao mês`, `150% ao ano`, `5 anos`, `18 meses`, `longo prazo`, `CLT`, `autônoma`, `aposentado`, `ainda não`, `me chamo Ana`.

Validação cruzada no próprio fluxo: gasto essencial não pode exceder o gasto total; parcela que não cobre os juros limita o prazo estimado; entrada inválida nunca avança o passo nem corrompe o perfil parcial.

O perfil de risco é **derivado** de tolerância a perda e horizonte, em vez de pedir autoclassificação — o usuário não precisa saber o que significa "moderado".

### 12.3 Dados de mercado — tempo real

| Dado | Fonte | Licença | Cache |
|---|---|---|---|
| Ações, FIIs, ETFs e BDRs da B3 | Yahoo Finance (`query2`, sufixo `.SA`) | Não contratual | 60s encontrado, 5s ausente |
| Títulos públicos: taxa e PU diários | Tesouro Transparente (CSV) | Dados abertos | 6h |
| Selic, CDI, IPCA | Banco Central — SGS, séries 432, **4389** e 13522 | Pública | 6h |
| Séries históricas de demonstração | Neon (sintéticas, seed fixa) | — | — |

Acesso por três rotas: `GET /api/cotacao?ticker=XXXX0`, `GET /api/tesouro?q=<busca>` e `GET /api/mercado`.

> A série **4389** entrega o CDI já anualizado pelo próprio BCB. A versão anterior elevava a taxa diária (série 12) a 252, introduzindo erro de arredondamento desnecessário.

**Fontes avaliadas e descartadas:**

| Fonte | Motivo |
|---|---|
| brapi.dev | Free tier devolve `401` a partir da segunda chamada |
| B3 UP2DATA | Endpoint público responde `404`; exige contrato comercial |
| ANBIMA Feed | `401` sem credencial; necessária só para crédito privado com spread |
| BrasilAPI | Funciona, mas é agregador de terceiros — o BCB direto é a fonte primária |

**Privacidade preservada:** a rota de cotação aceita **apenas** o ticker, validado contra o padrão da B3 (4 letras + 1 ou 2 dígitos) antes de qualquer chamada externa. Um teste e2e inspeciona as requisições e falha se qualquer outro parâmetro aparecer.

**Resiliência:** timeout de 8s, duas tentativas com espera, e `404` tratado como resposta definitiva (não adianta repetir). Falha de rede devolve indicadores de referência com `aoVivo: false`, e a interface rotula a origem.

**Upgrade:** Tesouro Transparente para curva de juros e marcação a mercado de renda fixa (seção 11.5).

### 12.3.1 Carteira por ativo

O assistente aceita código da B3 **ou** nome de título público, busca o valor e pede quantidade e preço médio. Mapeia para a classe do motor:

| Entrada | Classificação | Classe no motor |
|---|---|---|
| Sufixo 3, 4, 5, 6 | ação | `acao` |
| Sufixo 11 | FII ou ETF (refinado pelo nome) | `fii` ou `exterior` |
| Sufixo 31–39 | BDR | `exterior` |
| "Tesouro Selic 2029" | título Selic | `rf_pos` |
| "Prefixado 2028", "LTN" | título prefixado | `rf_pre` |
| "IPCA+ 2035", "Educa+", "Renda+" | título IPCA | `rf_ipca` |

Depois de concluído o diagnóstico, o mesmo campo vira consulta avulsa — sem alterar a carteira, o que é verificado por teste.

### 12.3.2 Curva de juros e marcação a mercado

**Curva.** Construída a partir das taxas negociadas de todos os títulos públicos, agrupando vértices por prazo arredondado a 0,25 ano e interpolando linearmente entre eles. Fora da faixa observada mantém a taxa do vértice extremo: extrapolar curva de juros produz valor sem significado econômico.

Três séries derivadas:

- **Nominal** — dos prefixados. Juro em reais.
- **Real** — dos IPCA+. Juro acima da inflação.
- **Implícita** — `(1 + nominal) / (1 + real) − 1`. Fisher, não subtração. É o IPCA que faria as duas empatarem.

Posição de 27/10/2026, para referência: nominal ~15% a.a., real ~7,7% a.a., implícita 6–7% a.a.

**Marcação a mercado.** Compara a taxa contratada com a taxa de hoje. Taxa acima da contratada derruba o preço; abaixo, valoriza. A `duration` quantifica a sensibilidade — quanto o preço se move a cada ponto percentual de taxa.

A explicação textual trata separadamente os dois efeitos que movem um IPCA+: correção pela inflação acumulada e variação da taxa. Sem isso, um resultado positivo com taxa em alta produziria texto autocontraditório — falha encontrada em teste e corrigida.

**Limite:** ANBIMA ETTJ é a referência oficial de mercado e é paga. A interpolação sobre títulos negociados tem erro de poucos basis points em vértices ilíquidos — irrelevante para marcação exibida ao usuário, insuficiente para precificar crédito privado com spread.

### 12.3.3 Orientação e responsabilidade

Duas camadas, ambas derivadas dos dados do próprio usuário:

**Dicas de economia** (`dicasEconomia`): déficit, gasto não essencial acima de 30%, taxa de poupança abaixo de 10%, comprometimento de renda acima de 30%, juros mensais de dívida cara, reserva excessiva, ausência de proteção. Cada dica declara em `base` o número que a originou e, quando aplicável, o impacto mensal em reais.

**Avaliação de ativo** (`avaliarAtivo`): opera no nível de classe. Informa tributação, liquidez e risco característico; bloqueia quando há gate aberto, horizonte incompatível (RN04) ou restrição declarada; alerta quando a classe excede o perfil.

**Limite explícito:** nenhuma saída diz "compre" ou "venda". Um teste varre todas as combinações de classe e estado procurando verbos de indicação e termos de garantia — falha se encontrar.

O texto de responsabilidade é único e curto, exibido uma vez por avaliação:

> A decisão é sua. Esta análise mostra como o ativo se encaixa no que você informou — não é indicação de compra nem garantia de retorno.

### 12.4 Escopo regulatório da v0

Opera como **ferramenta de análise** (seção 11.1): recomenda apenas classe de ativo, nunca emissor ou ticker. A Camada 3 do motor existe no desenho, mas não no código — depende da decisão 11.1.

### 12.5 Verificação automatizada

| Suíte | Testes | Cobre |
|---|---|---|
| Cálculo e motor | 56 | XIRR, TWR, Sharpe, beta, drawdown, Monte Carlo, gates, alocação, RN01–RN14 |
| Parser e conversa | 108 | Valores em pt-BR, taxas, prazos, fluxo completo, pureza da máquina de estados |
| Ativos, dicas e cotação | 59 | Validação de ticker, avaliação por classe, dicas de economia, fluxo de carteira |
| Curva e renda fixa | 85 | Interpolação, Fisher, marcação a mercado, duration, busca de títulos |
| Integração Neon e rede | 53 | Indicadores, ativos, perfis demo, cotações reais, Banco Central |
| End-to-end no navegador | 54 | Chat, localStorage, três rotas de API, carteira, acessibilidade, console |

`npm run verify` roda lint, as cinco suítes e o build. `npm run e2e` roda o navegador.

**Invariantes verificados por teste, não por convenção:**

- Nenhuma requisição de escrita sai do navegador durante o uso.
- A rota de cotação recebe exclusivamente o parâmetro `ticker`.
- Ticker malformado é rejeitado antes de qualquer chamada externa (`400`), inexistente devolve `404`.
- Nenhuma saída de avaliação contém verbo de indicação de compra ou termo de garantia.
- Nenhum `NaN`, `Infinity`, `undefined` ou `[object Object]` chega à tela.
- Toda recomendação tem justificativa estruturada não vazia (RN09).
- Alocação por classe existe se, e somente se, os gates estão liberados.
- Consulta avulsa de cotação não altera a carteira salva.
- Perfis de demonstração usam apenas o primeiro nome.
- A curva nominal fica acima da real (juro nominal sempre excede o real).
- Interpolação não extrapola além dos vértices observados.
- Inflação implícita usa Fisher, não subtração — verificado contra o valor exato.
- Explicação de marcação a mercado não contradiz o sinal do resultado.
- Números decimais aparecem em formato pt-BR (vírgula), inclusive prazos e duration.

Indisponibilidade de fonte externa é tratada como dependência, não como falha de código: o teste registra o aviso e pula as asserções de conteúdo, mas nunca aceita dado inválido.
