// Shared helpers for edge functions: CORS + backoffice auth check.
// Keeping this in one place makes it impossible to forget the role gate.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE_ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

/**
 * Build CORS headers for the current request.
 * If ALLOWED_ORIGINS env is set (comma-separated), only listed origins are echoed back.
 * Otherwise falls back to `*` for local/dev convenience.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const allowlist = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";

  let allowOrigin = "*";
  if (allowlist.length > 0) {
    allowOrigin = allowlist.includes(origin) ? origin : allowlist[0];
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": BASE_ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; cors: Record<string, string> },
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...init.cors, "Content-Type": "application/json" },
  });
}

export interface AuthedContext {
  userId: string;
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
  supabaseUrl: string;
}

/**
 * Verifies the JWT and asserts the caller has the backoffice role.
 * Throws an Error with a Dutch message on failure — call sites should
 * translate the thrown error to a 401/403 response.
 */
export async function assertBackoffice(req: Request): Promise<AuthedContext> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Niet geautoriseerd");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData?.user) throw new Error("Niet geautoriseerd");
  const userId = userData.user.id;

  const { data: roleCheck } = await serviceClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "backoffice")
    .maybeSingle();
  if (!roleCheck) throw new Error("Geen toegang: alleen backoffice mag deze functie gebruiken");

  return { userId, userClient, serviceClient, supabaseUrl };
}

/**
 * Lighter variant: verifies JWT but does not require the backoffice role.
 * Used for functions that only need "any signed-in user".
 */
export async function assertAuthed(req: Request): Promise<AuthedContext> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Niet geautoriseerd");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData?.user) throw new Error("Niet geautoriseerd");

  return { userId: userData.user.id, userClient, serviceClient, supabaseUrl };
}