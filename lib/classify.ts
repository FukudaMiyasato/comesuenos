import type { Sentiment } from "./store";
import { localAI } from "./transcribe";

export type Classification = { sentiment: Sentiment; categories: string[]; model: string };

type Provider = { name: string; url: string; key: string; models: string[] };

// Se usa el modelo de chat más barato disponible. CLASSIFY_MODEL permite forzar otro.
function provider(): Provider | null {
  const forced = process.env.CLASSIFY_MODEL ? [process.env.CLASSIFY_MODEL] : [];
  if (localAI()) {
    return {
      name: "Local (llama.cpp u Ollama)",
      url: process.env.LOCAL_LLM_URL || "http://127.0.0.1:11434/v1/chat/completions",
      key: "",
      models: [...forced, "qwen2.5:3b"],
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: "OpenAI",
      url: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      // gpt-4.1-nano ya no está disponible en esta cuenta: se comprobó que siempre respondía el de reserva.
      models: [...forced, "gpt-4o-mini"],
    };
  }
  if (process.env.GROQ_API_KEY) {
    return {
      name: "Groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      models: [...forced, "llama-3.1-8b-instant"],
    };
  }
  return null;
}

/** Qué servicio y modelos clasifican con la configuración actual (para la documentación). */
export function classificationInfo(): { provider: string; model: string; fallbacks: string[] } | null {
  const p = provider();
  if (!p) return null;
  return {
    provider: p.name,
    model: p.models[0],
    fallbacks: p.models.slice(1),
  };
}

/** Frases de partida para un local de comida rápida. Siempre se ofrecen al modelo, aunque aún no tengan datos. */
export const BASE_CATEGORIES = [
  "le gusta la comida",
  "no le gusta la comida",
  "la atención es buena",
  "la atención es lenta",
  "el local está sucio",
  "le gusta el local",
  "no le gusta el local",
  "le molesta el ruido",
  "hay poca variedad",
  "los precios son altos",
];

const SYSTEM = `Resumes en una frase corta lo que dice una persona. Recibes una FRASE en español, transcrita de voz, y una lista de categorías EXISTENTES. Responde solo JSON:
{"sentimiento":"positivo"|"neutral"|"negativo","categoria":"..."}
Reglas:
- "categoria": frase corta (3 a 6 palabras, minúsculas, sin punto) que diga qué opina o de qué habla la persona, en tercera persona.
- Si una de las EXISTENTES significa lo mismo, cópiala exacta. Si ninguna encaja de verdad, crea una nueva: general y reutilizable, sin nombres propios ni detalles concretos.
- La frase puede tratar de cualquier tema (el local, la comida, el trabajo, la familia, deportes...): siempre se resume, nunca se rechaza.
- Nunca respondas una sola palabra ni etiquetas vagas como "otros", "random", "varios" o "general".
- "sentimiento": tono de la frase; "neutral" si no está claro.`;

// Ejemplos resueltos: a un modelo pequeño le ayudan más que cualquier explicación.
const EXAMPLES: [string, Sentiment, string][] = [
  ["El pollo está riquísimo", "positivo", "le gusta la comida"],
  ["Qué lentos son para atender, llevo media hora", "negativo", "la atención es lenta"],
  ["Mañana tengo reunión con mi jefe a las ocho", "neutral", "habla de su trabajo"],
  ["Ganó mi equipo anoche, qué partidazo", "positivo", "comenta un partido de fútbol"],
  ["Esa música está demasiado fuerte", "negativo", "le molesta el ruido"],
];

const ask = (existing: string[], text: string) => `EXISTENTES: ${existing.join(", ")}\nFRASE: ${text}`;

// Muletillas y saludos: una frase hecha solo de esto no dice nada.
const FILLER = new Set(
  "eh em mmm mm ah oh aja aha hola alo si no ok okay bueno ya pues a ver este esto o y uno dos tres probando prueba gracias chao adios".split(" "),
);
// Frases que Whisper inventa cuando solo oye ruido o música.
const HALLUCINATED = /subtitul|amara\.org|gracias por ver|suscrib|nos vemos en el proximo|musica de fondo|\[.*\]|♪/;

/** Ruido o texto ininteligible: muy corto, solo muletillas, o una invención típica de la transcripción. */
export function isNoise(text: string): boolean {
  const flat = fold(text);
  if (HALLUCINATED.test(flat)) return true;
  const words = flat.replace(/[^a-zñ ]/g, " ").split(" ").filter(Boolean);
  return words.length < 3 || words.every((w) => FILLER.has(w));
}

// Etiquetas comodín: no dicen nada, así que nunca se guardan.
export const DISCARDED = new Set([
  "otros", "otro", "otras", "general", "varios", "ninguna", "ninguno", "n/a", "random", "aleatorio",
  "desconocido", "sin categoria", "ruido", "ininteligible", "conversacion", "conversacion general",
]);

const SENTIMENTS: Sentiment[] = ["positivo", "neutral", "negativo"];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Devuelve sentimiento y categorías, o null si no se pudo clasificar. */
export async function classify(text: string, existing: string[]): Promise<Classification | null> {
  const p = provider();
  if (!p || isNoise(text)) return null;

  // Las de partida van primero; después, las que se hayan ido creando.
  // Solo frases: las categorías de una palabra de versiones anteriores no se ofrecen para reutilizar.
  existing = [...new Set([...BASE_CATEGORIES, ...existing])].filter((c) => c.includes(" ") && !DISCARDED.has(fold(c)));
  const messages = [
    { role: "system", content: SYSTEM },
    ...EXAMPLES.flatMap(([phrase, sentimiento, categoria]) => [
      { role: "user", content: ask(BASE_CATEGORIES, phrase) },
      { role: "assistant", content: JSON.stringify({ sentimiento, categoria }) },
    ]),
    { role: "user", content: ask(existing, text.slice(0, 1200)) },
  ];

  for (const model of p.models) {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { ...(p.key && { Authorization: `Bearer ${p.key}` }), "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 60,
        response_format: { type: "json_object" },
        messages,
      }),
    });
    if (!res.ok) {
      console.error(`clasificación con ${model} falló: ${res.status} ${(await res.text()).slice(0, 200)}`);
      continue; // prueba el siguiente modelo
    }
    try {
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const raw = JSON.parse(data.choices[0].message.content) as { sentimiento?: string; categoria?: unknown; categorias?: unknown };
      const sentiment = SENTIMENTS.find((s) => s === fold(String(raw.sentimiento ?? ""))) ?? "neutral";

      // Normaliza y, si coincide con una existente (sin tildes ni mayúsculas), usa la existente.
      const byFold = new Map(existing.map((c) => [fold(c), c]));
      const categories: string[] = [];
      for (const c of [raw.categoria, ...(Array.isArray(raw.categorias) ? raw.categorias : [])]) {
        if (typeof c !== "string") continue;
        const name = String(c).toLowerCase().trim().replace(/\s+/g, " ").replace(/[.!¡¿?]+$/, "").slice(0, 48);
        // Una sola palabra o una etiqueta comodín no sirve como categoría.
        if (!name.includes(" ") || DISCARDED.has(fold(name))) continue;
        const final = byFold.get(fold(name)) ?? name;
        if (!categories.includes(final)) categories.push(final);
        if (categories.length === 2) break;
      }
      return categories.length ? { sentiment, categories, model } : null;
    } catch (err) {
      console.error(`respuesta de ${model} no válida:`, err);
    }
  }
  return null;
}
