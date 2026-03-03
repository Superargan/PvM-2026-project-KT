import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Niet geautoriseerd");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Niet geautoriseerd");

    const { template_id, client_id } = await req.json();
    if (!template_id || !client_id) throw new Error("template_id en client_id zijn verplicht");

    // Fetch template metadata
    const { data: template, error: tplErr } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", template_id)
      .single();
    if (tplErr || !template) throw new Error("Template niet gevonden");

    // Fetch client data with relations
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("*, schools(name), referrers(name)")
      .eq("id", client_id)
      .single();
    if (clientErr || !client) throw new Error("Cliënt niet gevonden");

    // Fetch programs for client
    const { data: programClients } = await supabase
      .from("program_clients")
      .select("programs(name, start_date, end_date, program_staff(staff(user_id, profiles:staff_user_id_fkey(full_name))))")
      .eq("client_id", client_id)
      .limit(1);

    const program = (programClients as any)?.[0]?.programs;

    // Fetch trainer name
    let trainerName = "";
    if (program?.program_staff?.length) {
      // Use service role to get profile
      const serviceSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      for (const ps of program.program_staff) {
        if (ps.staff?.user_id) {
          const { data: profile } = await serviceSupabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", ps.staff.user_id)
            .single();
          if (profile?.full_name) {
            trainerName = profile.full_name;
            break;
          }
        }
      }
    }

    // Calculate age
    let age = "";
    if (client.date_of_birth) {
      const birth = new Date(client.date_of_birth);
      const today = new Date();
      let a = today.getFullYear() - birth.getFullYear();
      if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) a--;
      age = String(a);
    }

    // Build replacements map
    const today = new Date();
    const replacements: Record<string, string> = {
      "{{client_voornaam}}": client.first_name ?? "",
      "{{client_achternaam}}": client.last_name ?? "",
      "{{client_geboortedatum}}": client.date_of_birth ?? "",
      "{{client_leeftijd}}": age,
      "{{client_school}}": (client as any).schools?.name ?? "",
      "{{client_klas}}": client.class_group ?? "",
      "{{ouder_naam}}": client.guardian_name ?? "",
      "{{ouder_telefoon}}": client.guardian_phone ?? "",
      "{{ouder_email}}": client.guardian_email ?? "",
      "{{trainer_naam}}": trainerName,
      "{{programma_naam}}": program?.name ?? "",
      "{{programma_start}}": program?.start_date ?? "",
      "{{programma_eind}}": program?.end_date ?? "",
      "{{doelen}}": client.goals ?? "",
      "{{intake_notities}}": client.intake_notes ?? "",
      "{{datum_vandaag}}": `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`,
    };

    // Download template from storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("document-templates")
      .download(template.file_path);
    if (dlErr || !fileData) throw new Error("Template bestand niet gevonden");

    // Process DOCX (ZIP with XML)
    const zip = await JSZip.loadAsync(await fileData.arrayBuffer());
    
    // Replace placeholders in all XML parts
    const xmlParts = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml", "word/footer1.xml", "word/footer2.xml", "word/footer3.xml"];
    
    for (const partName of xmlParts) {
      const file = zip.file(partName);
      if (!file) continue;
      
      let xml = await file.async("string");
      
      // DOCX splits placeholders across XML tags, so we need to handle that
      // First, do simple replacement
      for (const [placeholder, value] of Object.entries(replacements)) {
        xml = xml.split(placeholder).join(escapeXml(value));
      }
      
      // Also try replacing placeholders that may be split across <w:r> runs
      for (const [placeholder, value] of Object.entries(replacements)) {
        xml = replaceSplitPlaceholder(xml, placeholder, escapeXml(value));
      }
      
      zip.file(partName, xml);
    }

    // Generate output
    const outputBuffer = await zip.generateAsync({ type: "uint8array" });
    
    // Save to storage
    const outputFileName = `${client.first_name}_${client.last_name}_${template.name}.docx`
      .replace(/\s+/g, "_");
    const outputPath = `${client_id}/${crypto.randomUUID()}_${outputFileName}`;
    
    const serviceSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    const { error: uploadErr } = await serviceSupabase.storage
      .from("generated-documents")
      .upload(outputPath, outputBuffer, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    if (uploadErr) throw new Error("Opslaan mislukt: " + uploadErr.message);

    // Record in DB
    await serviceSupabase.from("generated_documents").insert({
      client_id,
      template_id,
      file_path: outputPath,
      file_name: outputFileName,
      generated_by: user.id,
    });

    return new Response(
      JSON.stringify({ success: true, file_path: outputPath, file_name: outputFileName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Handle placeholders that Word may split across multiple <w:r> runs */
function replaceSplitPlaceholder(xml: string, placeholder: string, replacement: string): string {
  // Build a regex that matches the placeholder characters with optional XML tags between them
  const chars = placeholder.split("");
  let pattern = "";
  for (let i = 0; i < chars.length; i++) {
    pattern += escapeRegex(chars[i]);
    if (i < chars.length - 1) {
      pattern += "(?:</w:t></w:r><w:r[^>]*><w:rPr>[^<]*</w:rPr><w:t[^>]*>|</w:t></w:r><w:r[^>]*><w:t[^>]*>|</w:t><w:t[^>]*>)?";
    }
  }
  
  try {
    const regex = new RegExp(pattern, "g");
    return xml.replace(regex, replacement);
  } catch {
    return xml;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
