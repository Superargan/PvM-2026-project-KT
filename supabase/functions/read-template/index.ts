import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { assertBackoffice, getCorsHeaders } from "../_shared/auth.ts";

interface DocParagraph {
  index: number;
  text: string;
  style: string; // heading1, heading2, heading3, normal, hr
}

function extractParagraphs(xml: string): DocParagraph[] {
  const paragraphs: DocParagraph[] = [];
  // Match each <w:p ...>...</w:p> or <w:p/>
  const pRegex = /<w:p\b[^/]*?>([\s\S]*?)<\/w:p>|<w:p\/>/g;
  let match;
  let index = 0;

  while ((match = pRegex.exec(xml)) !== null) {
    const inner = match[1] ?? "";
    
    // Detect style
    let style = "normal";
    const styleMatch = inner.match(/<w:pStyle\s+w:val="([^"]+)"/);
    if (styleMatch) {
      const s = styleMatch[1].toLowerCase();
      if (s.includes("heading1") || s === "kop1") style = "heading1";
      else if (s.includes("heading2") || s === "kop2") style = "heading2";
      else if (s.includes("heading3") || s === "kop3") style = "heading3";
    }

    // Check for horizontal rule
    if (inner.includes("<w:pBdr>") && inner.includes('w:val="single"')) {
      style = "hr";
    }

    // Extract all text from <w:t> nodes
    const textParts: string[] = [];
    const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let tMatch;
    while ((tMatch = tRegex.exec(inner)) !== null) {
      textParts.push(unescapeXml(tMatch[1]));
    }

    paragraphs.push({
      index,
      text: textParts.join(""),
      style,
    });
    index++;
  }

  return paragraphs;
}

function unescapeXml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { serviceClient: serviceSupabase } = await assertBackoffice(req);

    const { template_id } = await req.json();
    if (!template_id) throw new Error("template_id is verplicht");

    const { data: template, error: tplErr } = await serviceSupabase
      .from("document_templates")
      .select("*")
      .eq("id", template_id)
      .maybeSingle();
    if (tplErr) throw new Error("Fout bij ophalen template: " + tplErr.message);
    if (!template) throw new Error("Template niet gevonden");

    const { data: fileData, error: dlErr } = await serviceSupabase.storage
      .from("document-templates")
      .download(template.file_path);
    if (dlErr || !fileData) throw new Error("Bestand niet gevonden: " + (dlErr?.message ?? "geen data"));

    const zip = await JSZip.loadAsync(await fileData.arrayBuffer());

    // Extract paragraphs from main document
    const docFile = zip.file("word/document.xml");
    if (!docFile) throw new Error("Geen document.xml gevonden");
    const docXml = await docFile.async("string");
    const paragraphs = extractParagraphs(docXml);

    // Extract headers and footers
    const sections: { part: string; paragraphs: DocParagraph[] }[] = [
      { part: "document", paragraphs },
    ];

    for (const partName of ["word/header1.xml", "word/header2.xml", "word/footer1.xml", "word/footer2.xml"]) {
      const file = zip.file(partName);
      if (!file) continue;
      const xml = await file.async("string");
      const p = extractParagraphs(xml);
      if (p.some((pp) => pp.text.trim())) {
        const label = partName.includes("header") ? `header${partName.match(/\d/)?.[0]}` : `footer${partName.match(/\d/)?.[0]}`;
        sections.push({ part: label, paragraphs: p });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        template: { id: template.id, name: template.name, category: template.category },
        sections,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: err.message === "Niet geautoriseerd" ? 401 : err.message?.startsWith?.("Geen toegang") ? 403 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
