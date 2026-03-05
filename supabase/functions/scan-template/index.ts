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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Niet geautoriseerd");

    const { template_id } = await req.json();
    if (!template_id) throw new Error("template_id is verplicht");

    const { data: template, error: tplErr } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", template_id)
      .single();
    if (tplErr || !template) throw new Error("Template niet gevonden");

    const { data: fileData, error: dlErr } = await supabase.storage
      .from("document-templates")
      .download(template.file_path);
    if (dlErr || !fileData) throw new Error("Bestand niet gevonden");

    const zip = await JSZip.loadAsync(await fileData.arrayBuffer());
    const xmlParts = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml", "word/footer1.xml", "word/footer2.xml", "word/footer3.xml"];

    let fullText = "";
    for (const partName of xmlParts) {
      const file = zip.file(partName);
      if (!file) continue;
      const xml = await file.async("string");
      // Strip XML tags to get plain text
      const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      fullText += `\n--- ${partName} ---\n${text}`;
    }

    return new Response(
      JSON.stringify({ success: true, name: template.name, text: fullText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
