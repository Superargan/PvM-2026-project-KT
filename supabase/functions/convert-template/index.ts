import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Mapping from Word MERGEFIELD names to our placeholder format
const MERGEFIELD_MAP: Record<string, string> = {
  "Naam_trainer": "{{trainer_naam}}",
  "Naam": "{{trainer_naam}}",
  "handelsnaam_": "{{trainer_handelsnaam}}",
  "Handelsnaam": "{{trainer_handelsnaam}}",
  "kvk_nummer": "{{trainer_kvk}}",
  "KVK_nummer": "{{trainer_kvk}}",
  "Training_nummer": "{{programma_naam}}",
  "Training_naam": "{{programma_naam}}",
  "Startdatum_train_ing_": "{{programma_start}}",
  "Startdatum_training": "{{programma_start}}",
  "Einddatum_training": "{{programma_eind}}",
  "Locatie_training": "{{programma_school}}",
  "Plaats": "{{trainer_plaats}}",
  "Adres": "{{trainer_adres}}",
  "Postcode": "{{trainer_postcode}}",
  "Email": "{{trainer_email}}",
  "Telefoon": "{{trainer_telefoon}}",
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
    const serviceSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

    // Download template
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("document-templates")
      .download(template.file_path);
    if (dlErr || !fileData) throw new Error("Bestand niet gevonden");

    const zip = await JSZip.loadAsync(await fileData.arrayBuffer());
    const xmlParts = [
      "word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml",
      "word/footer1.xml", "word/footer2.xml", "word/footer3.xml",
    ];

    const foundFields: string[] = [];
    const replacedFields: string[] = [];

    for (const partName of xmlParts) {
      const file = zip.file(partName);
      if (!file) continue;
      let xml = await file.async("string");

      // Replace simple MERGEFIELD: <w:fldSimple w:instr=" MERGEFIELD FieldName ...">...<w:t>«FieldName»</w:t>...</w:fldSimple>
      xml = xml.replace(
        /<w:fldSimple\s+w:instr="\s*MERGEFIELD\s+(\S+)[^"]*"[^>]*>([\s\S]*?)<\/w:fldSimple>/g,
        (_match, fieldName, innerContent) => {
          foundFields.push(fieldName);
          const placeholder = MERGEFIELD_MAP[fieldName];
          if (placeholder) {
            replacedFields.push(`${fieldName} → ${placeholder}`);
            // Keep the run formatting but replace the text
            return innerContent.replace(
              /<w:t[^>]*>[^<]*<\/w:t>/g,
              `<w:t>${placeholder}</w:t>`
            );
          }
          return innerContent.replace(
            /<w:t[^>]*>[^<]*<\/w:t>/g,
            `<w:t>{{${fieldName}}}</w:t>`
          );
        }
      );

      // Replace complex MERGEFIELD (begin/separate/end pattern)
      // This handles: fldChar begin → instrText MERGEFIELD → fldChar separate → display text → fldChar end
      xml = xml.replace(
        /(<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:fldChar\s+w:fldCharType="begin"[^/]*\/>[\s\S]*?)<w:instrText[^>]*>\s*MERGEFIELD\s+(\S+)[^<]*<\/w:instrText>([\s\S]*?<w:fldChar\s+w:fldCharType="separate"[^/]*\/>)([\s\S]*?)(<w:fldChar\s+w:fldCharType="end"[^/]*\/>)/g,
        (_match, before, fieldName, middle, displayContent, end) => {
          if (!foundFields.includes(fieldName)) foundFields.push(fieldName);
          const placeholder = MERGEFIELD_MAP[fieldName] || `{{${fieldName}}}`;
          if (MERGEFIELD_MAP[fieldName] && !replacedFields.includes(`${fieldName} → ${placeholder}`)) {
            replacedFields.push(`${fieldName} → ${placeholder}`);
          }
          // Replace display text runs with placeholder
          const cleanedDisplay = displayContent.replace(
            /<w:t[^>]*>[^<]*<\/w:t>/g,
            `<w:t>${placeholder}</w:t>`
          );
          return `${before}<w:instrText> </w:instrText>${middle}${cleanedDisplay}${end}`;
        }
      );

      // Also replace «FieldName» patterns that might appear as plain text
      for (const [fieldName, placeholder] of Object.entries(MERGEFIELD_MAP)) {
        const pattern = new RegExp(`«${fieldName}»`, "g");
        if (pattern.test(xml)) {
          xml = xml.replace(pattern, placeholder);
          if (!replacedFields.includes(`${fieldName} → ${placeholder}`)) {
            replacedFields.push(`${fieldName} → ${placeholder}`);
          }
        }
      }

      // Replace TIME fields with {{datum_vandaag}}
      xml = xml.replace(
        /<w:fldSimple\s+w:instr="\s*TIME[^"]*"[^>]*>([\s\S]*?)<\/w:fldSimple>/g,
        (_match, innerContent) => {
          return innerContent.replace(
            /<w:t[^>]*>[^<]*<\/w:t>/g,
            `<w:t>{{datum_vandaag}}</w:t>`
          );
        }
      );

      zip.file(partName, xml);
    }

    // Upload converted template (overwrite)
    const outputBuffer = await zip.generateAsync({ type: "uint8array" });
    const { error: uploadErr } = await serviceSupabase.storage
      .from("document-templates")
      .upload(template.file_path, outputBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (uploadErr) throw new Error("Upload mislukt: " + uploadErr.message);

    // Update placeholder_fields in DB
    const allPlaceholders = replacedFields.map(r => r.split(" → ")[1]);
    if (allPlaceholders.length > 0) {
      await serviceSupabase
        .from("document_templates")
        .update({ placeholder_fields: allPlaceholders })
        .eq("id", template_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        name: template.name,
        found_fields: foundFields,
        replaced: replacedFields,
        placeholders: allPlaceholders,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
