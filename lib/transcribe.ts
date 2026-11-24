type Provider = { name: string; url: string; key: string; model: string };

function provider(): Provider | null {
  if (process.env.GROQ_API_KEY) {
    return {
      name: "groq",
      url: "https://api.groq.com/openai/v1/audio/transcriptions",
      key: process.env.GROQ_API_KEY,
      model: process.env.STT_MODEL || "whisper-large-v3-turbo",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: "openai",
      url: "https://api.openai.com/v1/audio/transcriptions",
      key: process.env.OPENAI_API_KEY,
      model: process.env.STT_MODEL || "whisper-1",
    };
  }
  return null;
}

/** Qué servicio y modelo transcribe con la configuración actual (para la documentación). */
export function transcriptionInfo(): { provider: string; model: string } | null {
  const p = provider();
  return p && { provider: p.name === "groq" ? "Groq" : "OpenAI", model: p.model };
}

export class NoProviderError extends Error {}

export async function transcribe(wav: ArrayBuffer): Promise<string> {
  const p = provider();
  if (!p) throw new NoProviderError("Falta GROQ_API_KEY u OPENAI_API_KEY");

  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "audio.wav");
  form.append("model", p.model);
  form.append("response_format", "json");
  form.append("temperature", "0");
  const lang = process.env.STT_LANGUAGE ?? "es";
  if (lang) form.append("language", lang);

  const res = await fetch(p.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`${p.name} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
