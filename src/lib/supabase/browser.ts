"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";

let client: SupabaseClient | null = null;

/** Browser client: used only for sign-in and uploading worksheets to private storage. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client) return client;
  const config = getSupabasePublicConfig();
  if (!config) return null;
  client = createBrowserClient(config.url, config.anonKey);
  return client;
}
