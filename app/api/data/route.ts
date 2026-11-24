import { fakeMentions } from "@/lib/fake";
import { addMentions, bubbleKey, clearAll, DAY_MS, readAll, toBubbles, type Bubble, type Sentiment } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lo que dibuja la página: círculos (categoría + sentimiento) y menciones de las últimas 24 h.
export async function GET() {
  const now = Date.now();
  const { data, settings } = await readAll();
  const bubbles = new Map<string, Bubble>(toBubbles(data).map((b) => [bubbleKey(b.category, b.sentiment), b]));
  let recent = data.recent.filter((m) => m[2] > now - DAY_MS);

  if (settings.fake) {
    const fake = fakeMentions(now);
    for (const [category, sentiment, at] of fake) {
      const key = bubbleKey(category, sentiment);
      const b = bubbles.get(key) ?? { category, sentiment, count: 0, times: [] };
      bubbles.set(key, { ...b, count: b.count + 1, times: [...b.times, at] });
    }
    recent = [...recent, ...fake];
  }

  return Response.json(
    {
      bubbles: [...bubbles.values()].map((b) => ({ ...b, times: [...b.times].sort((x, y) => y - x).slice(0, 40) })),
      recent: recent.sort((a, b) => b[2] - a[2]),
      listening: settings.listening,
      fake: settings.fake,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE() {
  await clearAll();
  return Response.json({ ok: true });
}

// Solo en desarrollo: suma una mención sin pasar por el dispositivo ni por los modelos.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "no disponible" }, { status: 404 });
  const { categories, sentiment } = (await req.json()) as { categories: string[]; sentiment: Sentiment };
  const { data } = await readAll();
  await addMentions(data, categories, sentiment, Date.now());
  return Response.json({ ok: true });
}
