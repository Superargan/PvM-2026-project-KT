import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Updates paragraph text content while preserving all XML formatting.
 * Strategy: For each paragraph, replace the text in the FIRST <w:t> node
 * with the new text, and clear subsequent <w:t> nodes (to handle split runs).
 */
function updateParagraphTexts(xml: string, updates: Record<number, string>): string {
  let paragraphIndex = 0;
  
  // Match <w:p>...</w:p> blocks
  return xml.replace(/<w:p\b[^/]*?>([\s\S]*?)<\/w:p>|<w:p\/>/g, (fullMatch, inner) => {
    const idx = paragraphIndex++;
    
    if (!(idx in updates)) return fullMatch;
    if (!inner) return fullMatch; // self-closing <w:p/>
    
    const newText = updates[idx];
    
    // Find all <w:t> nodes within this paragraph
    let firstFound = false;
    const updatedInner = inner.replace(
      /<w:t([^>]*)>([^<]*)<\/w:t>/g,
      (tMatch: string, attrs: string, _oldText: string) => {
        if (!firstFound) {
          firstFound = true;
          // Ensure xml:space="preserve" for whitespace
          const hasPreserve = attrs.includes('xml:space="preserve"');
          const newAttrs = hasPreserve ? attrs : ` xml:space="preserve"`;
          return `<w:t${newAttrs}>${escapeXml(newText)}</w:t>`;
        }
        // Clear subsequent text nodes (they were part of split runs)
        return `<w:t${attrs}></w:t>`;
      }
    );
    
    return fullMatch.replace(inner, updatedInner);
  });
}

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
    const serviceSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Niet geautoriseerd");

    const { template_id, updates } = await req.json();
    // updates: { document?: Record<number, string>, header1?: ..., footer1?: ... }
    if (!template_id) throw new Error("template_id is verplicht");
    if (!updates || Object.keys(updates).length === 0) throw new Error("Geen wijzigingen meegegeven");

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

    const partMapping: Record<string, string> = {
      document: "word/document.xml",
      header1: "word/header1.xml",
      header2: "word/header2.xml",
      footer1: "word/footer1.xml",
      footer2: "word/footer2.xml",
    };

    for (const [section, paragraphUpdates] of Object.entries(updates)) {
      const partName = partMapping[section];
      if (!partName) continue;
      
      const file = zip.file(partName);
      if (!file) continue;
      
      let xml = await file.async("string");
      xml = updateParagraphTexts(xml, paragraphUpdates as Record<number, string>);
      zip.file(partName, xml);
    }

    // Re-detect placeholders
    const allPlaceholders: string[] = [];
    for (const partName of Object.values(partMapping)) {
      const file = zip.file(partName);
      if (!file) continue;
      const xml = await file.async("string");
      const matches = xml.matchAll(/\{\{([a-z_]+)\}\}/g);
      for (const m of matches) {
        const ph = `{{${m[1]}}}`;
        if (!allPlaceholders.includes(ph)) allPlaceholders.push(ph);
      }
    }

    // Upload updated file (overwrite)
    const outputBuffer = await zip.generateAsync({ type: "uint8array" });
    const { error: uploadErr } = await serviceSupabase.storage
      .from("document-templates")
      .upload(template.file_path, outputBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (uploadErr) throw new Error("Upload mislukt: " + uploadErr.message);

    // Update placeholder_fields
    await serviceSupabase
      .from("document_templates")
      .update({ placeholder_fields: allPlaceholders, updated_at: new Date().toISOString() })
      .eq("id", template_id);

    return new Response(
      JSON.stringify({ success: true, placeholders: allPlaceholders }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
