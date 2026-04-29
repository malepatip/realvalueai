import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function createServerClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createBrowserClient(
  supabaseUrl: string,
  anonKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });
}
