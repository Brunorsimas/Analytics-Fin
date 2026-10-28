import { NextResponse } from "next/server";
import { indicadoresAoVivo } from "@/lib/cotacao";

export const dynamic = "force-dynamic";

/** GET /api/mercado — Selic, CDI e IPCA do Banco Central. */
export async function GET() {
  const ind = await indicadoresAoVivo();
  return NextResponse.json(ind, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
