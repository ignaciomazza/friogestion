import { NextResponse } from "next/server";
import { fetchDolarBlue, fetchDolarOfficial } from "@/lib/market/dolar-hoy";

export const runtime = "nodejs";

export async function GET() {
  const [blue, official] = await Promise.all([
    fetchDolarBlue(),
    fetchDolarOfficial(),
  ]);

  if (!blue && !official) {
    return NextResponse.json(
      { error: "No se pudo obtener la cotizacion" },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { blue, official },
    {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
