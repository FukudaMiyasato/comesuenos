import type { Sentiment } from "./store";

export type Classification = { sentiment: Sentiment; categories: string[] };

type Provider = { url: string; key: string; models: string[] };

// Se usa el modelo de chat más barato disponible. CLASSIFY_MODEL permite forzar otro.
function provider(): Provider | null {
  const forced = process.env.CLASSIFY_MODEL ? [process.env.CLASSIFY_MODEL] : [];
  if (process.env.OPENAI_API_KEY) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      models: [...forced, "gpt-4.1-nano", "gpt-4o-mini"],
    };
  }
  if (process.env.GROQ_API_KEY) {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      models: [...forced, "llama-3.1-8b-instant"],
    };
  }
  return null;
}

const SYSTEM = `Clasificas frases cortas en español transcritas de voz. Responde solo JSON:
{"sentimiento":"positivo"|"neutral"|"negativo","categorias":["..."]}
Reglas:
- "sentimiento": tono emocional de la frase. Usa "neutral" si no está claro.
- "categorias": de 1 a 3 temas de los que trata la frase.
- PRIMERO reutiliza categorías de la lista EXISTENTES, copiando su nombre exacto, siempre que encajen razonablemente.
- Solo si ninguna encaja, crea una nueva: general y reutilizable, 1 o 2 palabras, en minúsculas, en español (por ejemplo "trabajo", "familia", "comida").`;

const SENTIMENTS: Sentiment[] = ["positivo", "neutral", "negativo"];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Devuelve sentimiento y categorías, o null si no se pudo clasificar. */
export async function classify(text: string, existing: string[]): Promise<Classification | null> {
  const p = provider();
  if (!p) return null;

  const user = `EXISTENTES: ${existing.length ? existing.join(", ") : "(ninguna todavía)"}\nFRASE: ${text.slice(0, 1200)}`;

  for (const model of p.models) {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 80,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`clasificación con ${model} falló: ${res.status} ${(await res.text()).slice(0, 200)}`);
      continue; // prueba el siguiente modelo
    }
    try {
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const raw = JSON.parse(data.choices[0].message.content) as { sentimiento?: string; categorias?: unknown };
      const sentiment = SENTIMENTS.find((s) => s === fold(String(raw.sentimiento ?? ""))) ?? "neutral";

      // Normaliza y, si coincide con una existente (sin tildes ni mayúsculas), usa la existente.
      const byFold = new Map(existing.map((c) => [fold(c), c]));
      const categories: string[] = [];
      for (const c of Array.isArray(raw.categorias) ? raw.categorias : []) {
        const name = String(c).toLowerCase().trim().replace(/\s+/g, " ").slice(0, 30);
        if (!name) continue;
        const final = byFold.get(fold(name)) ?? name;
        if (!categories.includes(final)) categories.push(final);
        if (categories.length === 3) break;
      }
      if (categories.length) return { sentiment, categories };
    } catch (err) {
      console.error(`respuesta de ${model} no válida:`, err);
    }
  }
  return null;
}
