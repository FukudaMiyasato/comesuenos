import { getSettings, updateSettings, type Settings } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

// El ESP32 consulta aquí si hay que escuchar; /admin lee y cambia los ajustes.
export async function GET() {
  return Response.json(await getSettings(), noStore);
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Partial<Settings> = {};
  if (typeof body?.listening === "boolean") patch.listening = body.listening;
  if (typeof body?.fake === "boolean") patch.fake = body.fake;
  if (!Object.keys(patch).length) {
    return Response.json({ error: "se espera { listening?: boolean, fake?: boolean }" }, { status: 400 });
  }
  return Response.json(await updateSettings(patch), noStore);
}
