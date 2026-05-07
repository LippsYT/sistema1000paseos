import { NextResponse } from "next/server";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!anonKey) {
    return NextResponse.json(
      {
        ok: false,
        projectUrl: supabaseUrl,
        message: "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.",
      },
      { status: 500 }
    );
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        projectUrl: supabaseUrl,
        status: response.status,
        message: "Supabase respondio, pero rechazo las credenciales anon/public.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    projectUrl: supabaseUrl,
    anonKeyLoaded: true,
    serviceRoleKeyLoaded: Boolean(serviceRoleKey),
  });
}
