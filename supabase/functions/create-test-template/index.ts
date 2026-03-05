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

    const serviceSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Build a minimal .docx with all placeholders
    const placeholders = [
      { section: "Datum", fields: ["{{datum_vandaag}}"] },
      { section: "Cliënt", fields: [
        "{{client_voornaam}}", "{{client_achternaam}}", "{{client_geboortedatum}}", "{{client_leeftijd}}",
        "{{client_adres}}", "{{client_postcode}}", "{{client_plaats}}", "{{client_geslacht}}",
        "{{client_school}}", "{{client_klas}}"
      ]},
      { section: "Ouder/Verzorger", fields: [
        "{{ouder_naam}}", "{{ouder_telefoon}}", "{{ouder_telefoon_alt}}", "{{ouder_email}}"
      ]},
      { section: "Verwijzing", fields: [
        "{{verwijzer_naam}}", "{{verwijzer_functie}}", "{{verwijsreden}}", "{{intake_datum}}"
      ]},
      { section: "Trainer", fields: [
        "{{trainer_naam}}", "{{trainer_handelsnaam}}", "{{trainer_kvk}}",
        "{{trainer_adres}}", "{{trainer_postcode}}", "{{trainer_plaats}}",
        "{{trainer_telefoon}}", "{{trainer_email}}", "{{trainer_specialisatie}}"
      ]},
      { section: "School", fields: [
        "{{school_naam}}", "{{school_adres}}", "{{school_email}}", "{{school_telefoon}}",
        "{{school_website}}", "{{school_leerlingen}}", "{{school_wijk}}", "{{school_gebied}}"
      ]},
      { section: "Programma", fields: [
        "{{programma_naam}}", "{{programma_start}}", "{{programma_eind}}",
        "{{programma_school}}", "{{programma_wijk}}", "{{programma_gebied}}"
      ]},
      { section: "Overig", fields: ["{{doelen}}", "{{intake_notities}}"] },
    ];

    // Build document.xml body
    let bodyXml = "";
    
    // Title
    bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>Test Document - Alle Placeholders</w:t></w:r></w:p>`;
    bodyXml += `<w:p><w:r><w:t>Gegenereerd op: {{datum_vandaag}}</w:t></w:r></w:p>`;
    bodyXml += `<w:p/>`;

    for (const section of placeholders) {
      // Section heading
      bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${section.section}</w:t></w:r></w:p>`;
      
      // Table with placeholder name and value
      bodyXml += `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr>`;
      
      // Header row
      bodyXml += `<w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Veld</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="5000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Waarde</w:t></w:r></w:p></w:tc></w:tr>`;
      
      for (const field of section.fields) {
        bodyXml += `<w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${field}</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="5000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${field}</w:t></w:r></w:p></w:tc></w:tr>`;
      }
      
      bodyXml += `</w:tbl>`;
      bodyXml += `<w:p/>`;
    }

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:mv="urn:schemas-microsoft-com:mac:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
  <w:body>${bodyXml}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body>
</w:document>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

    const zip = new JSZip();
    zip.file("[Content_Types].xml", contentTypes);
    zip.file("_rels/.rels", rels);
    zip.file("word/document.xml", documentXml);
    zip.file("word/_rels/document.xml.rels", wordRels);

    const docxBuffer = await zip.generateAsync({ type: "uint8array" });

    // Upload to storage
    const filePath = `test_template_${crypto.randomUUID()}.docx`;
    const { error: uploadErr } = await serviceSupabase.storage
      .from("document-templates")
      .upload(filePath, docxBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    if (uploadErr) throw new Error("Upload mislukt: " + uploadErr.message);

    // All placeholder field names
    const allFields = placeholders.flatMap(s => s.fields);

    // Insert template record
    const { data: templateRecord, error: dbErr } = await serviceSupabase
      .from("document_templates")
      .insert({
        name: "Test Template - Alle Placeholders",
        file_path: filePath,
        category: "overig",
        placeholder_fields: allFields,
      })
      .select()
      .single();
    if (dbErr) throw new Error("DB insert mislukt: " + dbErr.message);

    return new Response(
      JSON.stringify({ success: true, template: templateRecord }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
