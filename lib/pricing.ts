// Precios publicados por los proveedores, en USD. Sirven solo para la estimación de /doc.
// "verified" = comprobado en la página oficial de precios en la fecha indicada;
// si es false, es un precio de referencia sin confirmar y conviene revisarlo.

export const PRICES_CHECKED = "24 nov 2026";

/** Transcripción: USD por minuto de audio. */
export const STT_PRICES: Record<string, { perMinute: number; verified: boolean }> = {
  "whisper-1": { perMinute: 0.006, verified: true },
  "whisper-large-v3-turbo": { perMinute: 0.04 / 60, verified: false },
};

/** Chat: USD por millón de tokens de entrada y de salida. */
export const LLM_PRICES: Record<string, { input: number; output: number; verified: boolean }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6, verified: true },
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08, verified: false },
};

// Supuestos de una frase típica.
export const ASSUMED = {
  seconds: 5, // duración media del audio
  inputTokens: 420, // instrucciones (~320) + categorías existentes + la frase
  outputTokens: 25, // el JSON de respuesta
};

export function sttCost(model: string) {
  const p = STT_PRICES[model];
  return p ? { usd: (ASSUMED.seconds / 60) * p.perMinute, verified: p.verified } : null;
}

export function llmCost(model: string) {
  const p = LLM_PRICES[model];
  return p
    ? { usd: (ASSUMED.inputTokens * p.input + ASSUMED.outputTokens * p.output) / 1e6, verified: p.verified }
    : null;
}
