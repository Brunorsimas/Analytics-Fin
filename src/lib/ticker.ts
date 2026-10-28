/**
 * Validação e classificação de tickers da B3.
 * Puro e sem I/O: roda no cliente e no servidor.
 */

export type Classe = "acao" | "fii" | "etf" | "bdr" | "tesouro" | "desconhecida";

export function normalizarTicker(bruto: string): string | null {
  const t = bruto
    .trim()
    .toUpperCase()
    .replace(/\.SA$/, "")
    .replace(/[^A-Z0-9]/g, "");
  // Padrão B3: 4 letras + 1 ou 2 dígitos (PETR4, MXRF11, BBDC3).
  if (!/^[A-Z]{4}\d{1,2}$/.test(t)) return null;
  return t;
}

/** Classifica pelo sufixo numérico do ticker na B3. */
export function classificarTicker(ticker: string): Classe {
  const sufixo = ticker.replace(/^[A-Z]{4}/, "");
  if (sufixo === "11") return "fii"; // pode ser ETF; refinado pelo nome
  if (["3", "4", "5", "6", "7", "8"].includes(sufixo)) return "acao";
  if (["31", "32", "33", "34", "35", "39"].includes(sufixo)) return "bdr";
  return "desconhecida";
}
