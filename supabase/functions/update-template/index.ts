import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { assertBackoffice, getCorsHeaders } from "../_shared/auth.ts";

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
  
  return xml.replace(/<w:p\b[^/]*?>([\s\S]*?)<\/w:p>|<w:p\/>/g, (fullMatch, inner) => {
    const idx = paragraphIndex++;
    
    if (!(idx in updates)) return fullMatch;
    if (!inner) return fullMatch;
    
    const newText = updates[idx];
    
    let firstFound = false;
    const updatedInner = inner.replace(
      /<w:t([^>]*)>([^<]*)<\/w:t>/g,
      (tMatch: string, attrs: string, _oldText: string) => {
        if (!firstFound) {
          firstFound = true;
          const hasPreserve = attrs.includes('xml:space="preserve"');
          const newAttrs = hasPreserve ? attrs : ` xml:space="preserve"`;
          return `<w:t${newAttrs}>${escapeXml(newText)}</w:t>`;
        }
        return `<w:t${attrs}></w:t>`;
      }
    );
    
    return fullMatch.replace(inner, updatedInner);
  });
}

/**
 * Insert new paragraphs into the XML after specified paragraph indices.
 * Creates simple <w:p> elements with a single <w:r><w:t> run.
 */
function insertParagraphs(xml: string, inserts: { afterIndex: number; text: string }[]): string {
  if (!inserts || inserts.length === 0) return xml;
  
  // Group inserts by afterIndex and sort by afterIndex
  const insertMap: Record<number, string[]> = {};
  for (const ins of inserts) {
    if (!insertMap[ins.afterIndex]) insertMap[ins.afterIndex] = [];
    insertMap[ins.afterIndex].push(ins.text);
  }

  // Build a new paragraph XML snippet
  const makeParaXml = (text: string) =>
    `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;

  // Handle inserts at the very beginning (afterIndex === -1)
  if (insertMap[-1]) {
    const newParas = insertMap[-1].map(makeParaXml).join("");
    // Insert after the first <w:body...> tag or first <w:hdr...> / <w:ftr...> tag
    xml = xml.replace(
      /(<w:body[^>]*>|<w:hdr[^>]*>|<w:ftr[^>]*>)/,
      `$1${newParas}`
    );
    delete insertMap[-1];
  }

  if (Object.keys(insertMap).length === 0) return xml;

  // For other indices, insert after the matching paragraph
  let paragraphIndex = 0;
  xml = xml.replace(/<w:p\b[^/]*?>[\s\S]*?<\/w:p>|<w:p\/>/g, (fullMatch) => {
    const idx = paragraphIndex++;
    if (insertMap[idx]) {
      const newParas = insertMap[idx].map(makeParaXml).join("");
      return fullMatch + newParas;
    }
    return fullMatch;
  });

  return xml;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { serviceClient: serviceSupabase } = await assertBackoffice(req);

    const { template_id, updates, inserts } = await req.json();
    // updates: { document?: Record<number, string>, header1?: ..., footer1?: ... }
    // inserts: { document?: [{ afterIndex: number, text: string }], ... }
    if (!template_id) throw new Error("template_id is verplicht");
    
    const hasUpdates = updates && Object.keys(updates).length > 0;
    const hasInserts = inserts && Object.keys(inserts).length > 0;
    if (!hasUpdates && !hasInserts) throw new Error("Geen wijzigingen meegegeven");

    const { data: template, error: tplErr } = await serviceSupabase
      .from("document_templates")
      .select("*")
      .eq("id", template_id)
      .maybeSingle();
    if (tplErr || !template) throw new Error("Template niet gevonden: " + (tplErr?.message || "niet gevonden"));

    const { data: fileData, error: dlErr } = await serviceSupabase.storage
      .from("document-templates")
      .download(template.file_path);
    if (dlErr || !fileData) throw new Error("Bestand niet gevonden: " + dlErr?.message);

    const zip = await JSZip.loadAsync(await fileData.arrayBuffer());

    const partMapping: Record<string, string> = {
      document: "word/document.xml",
      header1: "word/header1.xml",
      header2: "word/header2.xml",
      footer1: "word/footer1.xml",
      footer2: "word/footer2.xml",
    };

    // Apply text updates first
    if (hasUpdates) {
      for (const [section, paragraphUpdates] of Object.entries(updates)) {
        const partName = partMapping[section];
        if (!partName) continue;
        
        const file = zip.file(partName);
        if (!file) continue;
        
        let xml = await file.async("string");
        xml = updateParagraphTexts(xml, paragraphUpdates as Record<number, string>);
        zip.file(partName, xml);
      }
    }

    // Apply paragraph inserts
    if (hasInserts) {
      for (const [section, sectionInserts] of Object.entries(inserts)) {
        const partName = partMapping[section];
        if (!partName) continue;
        
        const file = zip.file(partName);
        if (!file) continue;
        
        let xml = await file.async("string");
        xml = insertParagraphs(xml, sectionInserts as { afterIndex: number; text: string }[]);
        zip.file(partName, xml);
      }
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
      { status: err.message === "Niet geautoriseerd" ? 401 : err.message?.startsWith?.("Geen toegang") ? 403 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
