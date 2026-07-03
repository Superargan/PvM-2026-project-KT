import { assertBackoffice, getCorsHeaders, jsonResponse } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { serviceClient } = await assertBackoffice(req);

    const { email, full_name, role } = await req.json();

    if (!email || !full_name || !role) {
      return jsonResponse({ error: "Email, naam en rol zijn verplicht" }, { status: 400, cors: corsHeaders });
    }
    if (!["backoffice", "trainer"].includes(role)) {
      return jsonResponse({ error: "Ongeldige rol" }, { status: 400, cors: corsHeaders });
    }

    const { data: inviteData, error: inviteError } =
      await serviceClient.auth.admin.inviteUserByEmail(email, { data: { full_name } });
    if (inviteError) {
      return jsonResponse({ error: inviteError.message }, { status: 400, cors: corsHeaders });
    }

    const newUserId = inviteData.user.id;
    await serviceClient.from("user_roles").insert({ user_id: newUserId, role });
    if (role === "trainer") {
      await serviceClient.from("staff").insert({ user_id: newUserId });
    }

    return jsonResponse({ success: true, user_id: newUserId }, { cors: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout";
    const status = msg === "Niet geautoriseerd" ? 401 : msg.startsWith("Geen toegang") ? 403 : 500;
    return jsonResponse({ error: msg }, { status, cors: corsHeaders });
  }
});
