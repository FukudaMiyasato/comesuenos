import { getListening, setListening } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

// La página y el ESP32 consultan aquí si hay que escuchar.
export async function GET() {
  return Response.json({ listening: await getListening() }, noStore);
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as { listening?: unknown } | null;
  if (typeof body?.listening !== "boolean") {
    return Response.json({ error: "se espera { listening: boolean }" }, { status: 400 });
  }
  await setListening(body.listening);
  return Response.json({ listening: body.listening }, noStore);
}
