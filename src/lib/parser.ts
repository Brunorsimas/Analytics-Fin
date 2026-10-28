/**
 * Extração determinística de valores a partir de texto livre.
 * Nenhum modelo de linguagem envolvido: o chat entende números, não intenções
 * abertas. Isso mantém RN10 — nenhum número exibido vem de LLM.
 */

/**
 * Interpreta valor monetário em português e devolve CENTAVOS.
 * Aceita: "3500", "3.500,00", "R$ 3.500", "3,5 mil", "1.2k", "2 milhões".
 * Devolve null quando não há número reconhecível.
 */
export function parseDinheiro(texto: string): number | null {
  const t = texto
    .toLowerCase()
    .replace(/r\$/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const m = t.match(/(-?\d[\d.,]*)\s*(mil|milh(?:ão|ões|ao|oes)|k|kk|m)?\b/);
  if (!m) return null;

  const bruto = m[1];
  const sufixo = m[2];

  // pt-BR: vírgula é decimal, ponto é milhar.
  // "1.234,56" -> 1234.56 | "1.234" -> 1234 | "3,5" -> 3.5
  let normalizado: string;
  if (bruto.includes(",")) {
    normalizado = bruto.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(bruto)) {
    normalizado = bruto.replace(/\./g, "");
  } else {
    normalizado = bruto;
  }

  let n = Number(normalizado);
  if (!Number.isFinite(n)) return null;

  if (sufixo === "mil" || sufixo === "k") n *= 1_000;
  else if (sufixo === "kk" || sufixo === "m" || /milh/.test(sufixo ?? "")) n *= 1_000_000;

  const centavos = Math.round(n * 100);
  if (!Number.isFinite(centavos) || Math.abs(centavos) > 1e15) return null;
  return centavos;
}

/** Número puro (sem conversão monetária): "2", "nenhum", "dois". */
export function parseInteiro(texto: string): number | null {
  const t = texto.toLowerCase().trim();
  const palavras: Record<string, number> = {
    nenhum: 0, nenhuma: 0, zero: 0, "não": 0, nao: 0, sozinho: 0, sozinha: 0,
    um: 1, uma: 1, "só eu": 0, "so eu": 0,
    dois: 2, duas: 2, "três": 3, tres: 3, quatro: 4, cinco: 5,
    seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  };
  for (const [k, v] of Object.entries(palavras)) {
    if (new RegExp(`\\b${k}\\b`).test(t)) return v;
  }
  const m = t.match(/-?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isInteger(n) ? n : null;
}

/** Percentual: "20%", "20 por cento", "uns 15". */
export function parsePercentual(texto: string): number | null {
  const t = texto.toLowerCase().replace(/por cento/g, "%");
  const m = t.match(/(-?\d+(?:[.,]\d+)?)\s*%?/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/** Prazo em MESES: "5 anos", "18 meses", "ano que vem", "longo prazo". */
export function parsePrazoMeses(texto: string): number | null {
  const t = texto.toLowerCase().trim();

  if (/\b(longo prazo|aposentadoria|bem longe)\b/.test(t)) return 240;
  if (/\b(m[eé]dio prazo)\b/.test(t)) return 60;
  if (/\b(curto prazo|logo|breve)\b/.test(t)) return 12;
  if (/\bano que vem\b/.test(t)) return 12;

  const anos = t.match(/(\d+(?:[.,]\d+)?)\s*anos?\b/);
  if (anos) {
    const n = Number(anos[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 12);
  }
  const meses = t.match(/(\d+)\s*(?:meses|m[êe]s)\b/);
  if (meses) {
    const n = Number(meses[1]);
    if (Number.isInteger(n) && n > 0) return n;
  }
  const solto = t.match(/^\s*(\d+)\s*$/);
  if (solto) {
    const n = Number(solto[1]);
    // Número isolado pequeno costuma ser anos; grande, meses.
    if (n > 0 && n <= 50) return n * 12;
    if (n > 50) return n;
  }
  return null;
}

/**
 * Casa um radical no início de uma palavra, permitindo qualquer sufixo.
 * `\b` não serve aqui: "consignad" + "o" não tem boundary, e `\b` é ASCII,
 * logo falha com acento ("é" não é word char).
 */
function temRadical(texto: string, ...radicais: string[]): boolean {
  return new RegExp(`(?<![\\p{L}])(?:${radicais.join("|")})`, "u").test(texto);
}

export type Estabilidade = "clt" | "autonomo" | "variavel" | "aposentado" | "desempregado";

export function parseEstabilidade(texto: string): Estabilidade | null {
  const t = texto.toLowerCase();
  if (temRadical(t, "clt", "carteira assinada", "assalariad", "funcion[áa]ri", "servidor", "concursad", "est[áa]vel"))
    return "clt";
  if (temRadical(t, "aut[ôo]nom", "pj", "freelanc", "free lanc", "conta pr[óo]pria", "empreended", "liberal"))
    return "autonomo";
  if (temRadical(t, "vari[áa]vel", "comiss", "vendedor", "inst[áa]vel", "varia muito")) return "variavel";
  if (temRadical(t, "aposentad", "pensionista", "inss")) return "aposentado";
  if (temRadical(t, "desempregad", "sem renda", "sem emprego", "parad")) return "desempregado";
  return null;
}

export function parseSimNao(texto: string): boolean | null {
  const t = texto.toLowerCase().trim();
  // Negativa primeiro: "ainda não tenho" contém "tenho".
  if (temRadical(t, "n[ãa]o", "nao", "nenhum", "negativ", "nunca", "jamais")) return false;
  if (/^n$/.test(t)) return false;
  if (temRadical(t, "sim", "tenho", "possuo", "claro", "tem", "uhum", "isso", "positiv"))
    return true;
  if (/^s$/.test(t)) return true;
  return null;
}

export function parseDeclaracaoIR(texto: string): "completa" | "simplificada" | "isento" | null {
  const t = texto.toLowerCase();
  if (temRadical(t, "isent", "n[ãa]o declaro", "nao declaro", "n[ãa]o fa[çc]o")) return "isento";
  if (temRadical(t, "completa", "deduç", "deduc", "modelo completo")) return "completa";
  if (temRadical(t, "simplificad", "simples", "desconto padr")) return "simplificada";
  return null;
}

const SAUDACOES =
  "ol[áa]|oi|e a[íi]|bom dia|boa tarde|boa noite|meu nome [ée]|me chamo|pode me chamar de|eu sou|sou o|sou a|sou|chamo";

/** Nome próprio: primeira palavra capitalizável, limpa de saudações. */
export function parseNome(texto: string): string | null {
  // Delimitadores explícitos em vez de \b, que não casa com acento.
  const re = new RegExp(`(^|[\\s,.;:!?-])(?:${SAUDACOES})(?=[\\s,.;:!?-]|$)`, "giu");
  let limpo = texto.toLowerCase();
  // Duas passadas: o delimitador consumido pode esconder o match seguinte.
  limpo = limpo.replace(re, " ").replace(re, " ");
  limpo = limpo
    .replace(/[^\p{L}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpo) return null;
  const primeiro = limpo.split(" ")[0];
  if (primeiro.length < 2 || primeiro.length > 30) return null;
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1);
}

export type TipoDivida =
  | "cartao" | "cheque_especial" | "consignado" | "pessoal"
  | "financiamento_imovel" | "financiamento_veiculo" | "estudantil" | "outro";

export function parseTipoDivida(texto: string): TipoDivida | null {
  const t = texto.toLowerCase();
  if (temRadical(t, "cart[ãa]o", "cartao", "rotativ", "fatura")) return "cartao";
  if (temRadical(t, "cheque especial", "limite da conta")) return "cheque_especial";
  if (temRadical(t, "consignad")) return "consignado";
  if (/financ.*(casa|im[óo]vel|apartamento)|(casa|im[óo]vel|apartamento).*financ/u.test(t))
    return "financiamento_imovel";
  if (/financ.*(carro|ve[íi]culo|moto)|(carro|ve[íi]culo|moto).*financ/u.test(t))
    return "financiamento_veiculo";
  if (temRadical(t, "fies", "estudantil", "faculdade", "curso")) return "estudantil";
  if (temRadical(t, "empr[ée]stimo", "cr[ée]dito pessoal")) return "pessoal";
  if (temRadical(t, "d[íi]vida", "devo", "dever")) return "outro";
  return null;
}

/** Taxa de juros MENSAL em decimal: "12% ao mês", "2,5 a.m.", "150% ao ano". */
export function parseTaxaMensal(texto: string): number | null {
  const t = texto.toLowerCase().replace(/por cento/g, "%");
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*%?/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;

  const aoAno = /\b(ao ano|a\.?a\.?|anual|por ano)\b/.test(t);
  if (aoAno) {
    if (n > 1000) return null;
    return (1 + n / 100) ** (1 / 12) - 1;
  }
  if (n > 100) return null;
  return n / 100;
}

export function parseClassificacao(texto: string): "conservador" | "moderado" | "arrojado" | null {
  const t = texto.toLowerCase();
  if (temRadical(t, "conservador", "seguran", "cauteloso", "baixo risco", "n[ãa]o gosto de risco"))
    return "conservador";
  if (temRadical(t, "arrojad", "agressiv", "alto risco", "ousad", "aceito risco")) return "arrojado";
  if (temRadical(t, "moderad", "equilibr", "m[ée]di")) return "moderado";
  return null;
}

/**
 * Deriva a classificação de risco a partir de respostas objetivas,
 * em vez de pedir que o usuário se autoclassifique.
 */
export function derivarPerfil(toleranciaPct: number, horizonteMeses: number) {
  let score = 0;
  score += Math.min(50, toleranciaPct * 1.6);
  score += horizonteMeses >= 120 ? 35 : horizonteMeses >= 60 ? 25 : horizonteMeses >= 24 ? 12 : 0;
  score = Math.round(Math.max(0, Math.min(100, score)));
  const classificacao: "conservador" | "moderado" | "arrojado" =
    score >= 65 ? "arrojado" : score >= 35 ? "moderado" : "conservador";
  return { score, classificacao };
}
