const DEFAULT_SUPABASE_URL = "https://dazersdzhicgltdvqyzv.supabase.co";

export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

export function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function assertSupabasePublicConfig() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseAnonKey) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY. Copia .env.example a .env.local y pega la anon key del proyecto Supabase."
    );
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  };
}

export function assertSupabaseAdminConfig() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseServiceRoleKey = getSupabaseServiceRoleKey();

  if (!supabaseServiceRoleKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY. Agrega la service role key en .env.local solo para uso backend."
    );
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
  };
}
