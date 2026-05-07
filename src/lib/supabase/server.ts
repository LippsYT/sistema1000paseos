import { createClient } from "@supabase/supabase-js";
import { assertSupabaseAdminConfig, assertSupabasePublicConfig } from "./config";

export function createSupabaseServerClient() {
  const { supabaseUrl, supabaseAnonKey } = assertSupabasePublicConfig();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSupabaseAdminClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = assertSupabaseAdminConfig();

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
