import type { Divida, Objetivo, Perfil, Situacao, Usuario } from "./engine";

export const STORAGE_KEY = "analyticsfin.perfil.v1";

export type PosicaoLocal = {
  ticker: string;
  valor: number;
  /** Preenchidos quando o ativo foi cotado em tempo real. */
  nome?: string;
  quantidade?: number;
  precoMedio?: number;
  classe?: string;
  /** Apenas para títulos públicos. */
  indexador?: string;
  vencimento?: string;
  taxaContratada?: number;
};

export type PerfilLocal = {
  nome: string;
  dependentes: number;
  estabilidade_renda: string;
  declaracao_ir: string;
  data_nascimento: string;
  situacao: Situacao;
  dividas: Divida[];
  objetivos: Objetivo[];
  perfil: Perfil;
  posicoes: PosicaoLocal[];
};

export function perfilVazio(nome = ""): PerfilLocal {
  return {
    nome,
    dependentes: 0,
    estabilidade_renda: "",
    declaracao_ir: "",
    data_nascimento: "",
    situacao: {
      renda_mensal: 0,
      despesa_mensal: 0,
      custo_essencial: 0,
      capacidade_aporte: 0,
      reserva_atual: 0,
      possui_seguro_vida: 0,
      possui_plano_saude: 0,
    },
    dividas: [],
    objetivos: [],
    perfil: {
      classificacao: "moderado",
      score: 0,
      tolerancia_perda_pct: 0,
      horizonte_meses: 0,
      restricoes: "[]",
      data_aplicacao: "",
    },
    posicoes: [],
  };
}

export function usuarioDe(p: PerfilLocal): Usuario {
  return {
    id: 0,
    nome: p.nome,
    dependentes: p.dependentes,
    estabilidade_renda: p.estabilidade_renda,
    declaracao_ir: p.declaracao_ir,
  };
}

/** Campos que o motor exige para emitir recomendação (RN13). */
export type Pendencia = { campo: string; pergunta: string };

export function pendencias(p: PerfilLocal): Pendencia[] {
  const out: Pendencia[] = [];
  const s = p.situacao;
  if (!p.nome) out.push({ campo: "nome", pergunta: "Como posso te chamar?" });
  if (s.renda_mensal <= 0)
    out.push({ campo: "renda", pergunta: "Quanto você recebe por mês, já líquido?" });
  if (s.despesa_mensal <= 0)
    out.push({ campo: "despesa", pergunta: "Quanto você gasta por mês, no total?" });
  if (s.custo_essencial <= 0)
    out.push({
      campo: "essencial",
      pergunta:
        "Desse gasto, quanto é essencial — moradia, comida, saúde, transporte? É a base da sua reserva de emergência.",
    });
  if (!p.estabilidade_renda)
    out.push({
      campo: "estabilidade",
      pergunta: "Sua renda é CLT, autônoma, variável ou aposentadoria?",
    });
  if (p.dependentes < 0 || !Number.isFinite(p.dependentes))
    out.push({ campo: "dependentes", pergunta: "Quantas pessoas dependem da sua renda?" });
  if (s.reserva_atual < 0)
    out.push({ campo: "reserva", pergunta: "Quanto você tem guardado para emergências?" });
  if (p.perfil.horizonte_meses <= 0)
    out.push({
      campo: "horizonte",
      pergunta: "Por quanto tempo pretende deixar o dinheiro investido?",
    });
  if (p.perfil.tolerancia_perda_pct <= 0)
    out.push({
      campo: "tolerancia",
      pergunta: "Se a carteira caísse, qual queda você aguentaria em um ano sem vender?",
    });
  return out;
}

export function completo(p: PerfilLocal): boolean {
  return pendencias(p).length === 0;
}

export function carregar(): PerfilLocal | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PerfilLocal;
    if (!p || typeof p !== "object" || !p.situacao || !p.perfil) return null;
    return { ...perfilVazio(), ...p };
  } catch {
    return null;
  }
}

export function salvar(p: PerfilLocal) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    notificar();
  } catch {
    /* quota cheia ou modo privado: segue sem persistir */
  }
}

export function apagar() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    notificar();
  } catch {
    /* ignora */
  }
}

/**
 * localStorage como store externo, consumível por useSyncExternalStore.
 * Resolve hidratação sem setState em effect: o servidor usa o snapshot do
 * servidor (null) e o cliente lê o valor real já no primeiro commit.
 */
const ouvintes = new Set<() => void>();

/**
 * Incrementa a cada escrita ou remoção. Permite distinguir "o storage não
 * mudou" de "mudou e voltou a ficar vazio" — comparar os valores não basta,
 * porque dois `null` são indistinguíveis.
 */
let versaoAtual = 0;

export function versao(): number {
  return versaoAtual;
}

function notificar() {
  versaoAtual++;
  for (const fn of ouvintes) fn();
}

export function inscrever(fn: () => void): () => void {
  ouvintes.add(fn);
  if (typeof window !== "undefined") window.addEventListener("storage", fn);
  return () => {
    ouvintes.delete(fn);
    if (typeof window !== "undefined") window.removeEventListener("storage", fn);
  };
}

// Cache do snapshot: useSyncExternalStore exige identidade estável entre
// chamadas enquanto o valor não muda, senão entra em laço infinito.
let brutoCache: string | null = null;
let parseadoCache: PerfilLocal | null = null;

export function snapshot(): PerfilLocal | null {
  if (typeof window === "undefined") return null;
  let bruto: string | null = null;
  try {
    bruto = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (bruto === brutoCache) return parseadoCache;
  brutoCache = bruto;
  parseadoCache = carregar();
  return parseadoCache;
}

export function snapshotServidor(): PerfilLocal | null {
  return null;
}
