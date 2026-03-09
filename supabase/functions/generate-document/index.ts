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

    const { template_id, client_id, staff_id, school_id, program_id } = await req.json();
    if (!template_id) throw new Error("template_id is verplicht");
    if (!client_id && !staff_id && !school_id) throw new Error("client_id, staff_id of school_id is verplicht");

    // Fetch template metadata
    const { data: template, error: tplErr } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", template_id)
      .single();
    if (tplErr || !template) throw new Error("Template niet gevonden");

    const serviceSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const today = new Date();
    const formatDateNL = (dateStr: string | null): string => {
      if (!dateStr) return "";
      try {
        const d = new Date(dateStr + "T00:00:00");
        return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
      } catch { return dateStr; }
    };
    let replacements: Record<string, string> = {
      "{{datum_vandaag}}": today.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }),
    };
    let outputFileName = "";

    if (staff_id) {
      const { data: staff, error: staffErr } = await supabase
        .from("staff")
        .select("*")
        .eq("id", staff_id)
        .single();
      if (staffErr || !staff) throw new Error("Trainer niet gevonden");

      replacements = {
        ...replacements,
        "{{trainer_naam}}": staff.name ?? "",
        "{{trainer_handelsnaam}}": staff.trade_name ?? "",
        "{{trainer_kvk}}": staff.kvk_number ?? "",
        "{{trainer_adres}}": staff.address ?? "",
        "{{trainer_postcode}}": staff.postal_code ?? "",
        "{{trainer_plaats}}": staff.city ?? "",
        "{{trainer_telefoon}}": staff.phone ?? "",
        "{{trainer_email}}": staff.email ?? "",
        "{{trainer_specialisatie}}": staff.specialization ?? "",
      };

      // If program_id is provided, fetch program data for trainer documents
      const programToFetch = program_id;
      if (!programToFetch) {
        // Try to find the most recent program for this trainer
        const { data: ps } = await supabase
          .from("program_staff")
          .select("program_id, programs(id, name, start_date, end_date, schools(name), neighborhoods(name, areas(name)))")
          .eq("staff_id", staff_id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (ps && ps.length > 0) {
          const prog = (ps[0] as any).programs;
          if (prog) {
            const programName = prog.name ?? "";
            const programNumber = prog.training_number ?? "";
            const programStart = formatDateNL(prog.start_date);
            const programEnd = formatDateNL(prog.end_date);
            replacements = {
              ...replacements,
              "{{programma_naam}}": programName,
              "{{programmanaam}}": programName,
              "{{programma_nummer}}": programNumber,
              "{{programmanummer}}": programNumber,
              "{{trajectnummer}}": programNumber,
              "{{programma_start}}": programStart,
              "{{startdatum}}": programStart,
              "{{programma_eind}}": programEnd,
              "{{einddatum}}": programEnd,
              "{{programma_school}}": prog.schools?.name ?? "",
              "{{programma_wijk}}": prog.neighborhoods?.name ?? "",
              "{{programma_gebied}}": prog.neighborhoods?.areas?.name ?? "",
            };
          }
        }
      } else {
        const { data: prog } = await supabase
          .from("programs")
          .select("*, schools(name), neighborhoods(name, areas(name))")
          .eq("id", programToFetch)
          .single();
        if (prog) {
          const programName = prog.name ?? "";
          const programStart = formatDateNL(prog.start_date);
          const programEnd = formatDateNL(prog.end_date);
          replacements = {
            ...replacements,
            "{{programma_naam}}": programName,
            "{{programmanaam}}": programName,
            "{{programmanummer}}": programName,
            "{{programma_nummer}}": programName,
            "{{trajectnummer}}": programName,
            "{{programma_start}}": programStart,
            "{{startdatum}}": programStart,
            "{{programma_eind}}": programEnd,
            "{{einddatum}}": programEnd,
            "{{programma_school}}": (prog as any).schools?.name ?? "",
            "{{programma_wijk}}": (prog as any).neighborhoods?.name ?? "",
            "{{programma_gebied}}": (prog as any).neighborhoods?.areas?.name ?? "",
          };
        }
      }

      outputFileName = `${staff.name ?? "Trainer"}_${template.name}.docx`.replace(/\s+/g, "_");
    }

    if (school_id) {
      const { data: school, error: schoolErr } = await supabase
        .from("schools")
        .select("*, neighborhoods(name, areas(name))")
        .eq("id", school_id)
        .single();
      if (schoolErr || !school) throw new Error("School niet gevonden");

      replacements = {
        ...replacements,
        "{{school_naam}}": school.name ?? "",
        "{{school_adres}}": school.address ?? "",
        "{{school_email}}": school.contact_email ?? "",
        "{{school_telefoon}}": school.contact_phone ?? "",
        "{{school_website}}": school.website_url ?? "",
        "{{school_leerlingen}}": String(school.student_count ?? ""),
        "{{school_wijk}}": (school as any).neighborhoods?.name ?? "",
        "{{school_gebied}}": (school as any).neighborhoods?.areas?.name ?? "",
      };

      outputFileName = `${school.name ?? "School"}_${template.name}.docx`.replace(/\s+/g, "_");
    }

    if (client_id) {
      const { data: client, error: clientErr } = await supabase
        .from("clients")
        .select("*, schools(name), referrers(name)")
        .eq("id", client_id)
        .single();
      if (clientErr || !client) throw new Error("Cliënt niet gevonden");

      const { data: programClients } = await supabase
        .from("program_clients")
        .select("programs(name, start_date, end_date, program_staff(staff(id, name, user_id)))")
        .eq("client_id", client_id)
        .limit(1);

      const program = (programClients as any)?.[0]?.programs;

      // Fetch program school/area/neighborhood info
      let programSchoolName = "";
      let programWijk = "";
      let programGebied = "";
      if (program?.name) {
        // Get the full program with relations
        const latestPc = programClients as any;
        const programId = latestPc?.[0]?.program_id ?? latestPc?.[0]?.programs?.id;
        if (programId) {
          const { data: fullProgram } = await supabase
            .from("programs")
            .select("schools(name), neighborhoods(name, areas(name))")
            .eq("id", programId)
            .single();
          if (fullProgram) {
            programSchoolName = (fullProgram as any).schools?.name ?? "";
            programWijk = (fullProgram as any).neighborhoods?.name ?? "";
            programGebied = (fullProgram as any).neighborhoods?.areas?.name ?? "";
          }
        }
      }

      let trainerName = "";
      if (program?.program_staff?.length) {
        for (const ps of program.program_staff) {
          if (ps.staff?.name) {
            trainerName = ps.staff.name;
            break;
          }
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

      let age = "";
      if (client.date_of_birth) {
        const birth = new Date(client.date_of_birth);
        let a = today.getFullYear() - birth.getFullYear();
        if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) a--;
        age = String(a);
      }

      replacements = {
        ...replacements,
        "{{client_voornaam}}": client.first_name ?? "",
        "{{client_achternaam}}": client.last_name ?? "",
        "{{client_geboortedatum}}": formatDateNL(client.date_of_birth),
        "{{client_leeftijd}}": age,
        "{{client_adres}}": client.address ?? "",
        "{{client_postcode}}": client.postal_code ?? "",
        "{{client_plaats}}": client.city ?? "",
        "{{client_geslacht}}": client.gender ?? "",
        "{{client_school}}": (client as any).schools?.name ?? "",
        "{{client_klas}}": client.class_group ?? "",
        "{{ouder_naam}}": client.guardian_name ?? "",
        "{{ouder_telefoon}}": client.guardian_phone ?? "",
        "{{ouder_telefoon_alt}}": client.guardian_phone_alt ?? "",
        "{{ouder_email}}": client.guardian_email ?? "",
        "{{verwijzer_naam}}": (client as any).referrers?.name ?? "",
        "{{verwijzer_functie}}": (client as any).referrers?.function_title ?? "",
        "{{verwijsreden}}": client.referral_reason ?? "",
        "{{intake_datum}}": formatDateNL(client.intake_date),
        "{{trainer_naam}}": replacements["{{trainer_naam}}"] || trainerName,
        "{{programma_naam}}": program?.name ?? "",
        "{{programma_start}}": formatDateNL(program?.start_date),
        "{{programma_eind}}": formatDateNL(program?.end_date),
        "{{programma_school}}": programSchoolName,
        "{{programma_wijk}}": programWijk,
        "{{programma_gebied}}": programGebied,
        "{{doelen}}": client.goals ?? "",
        "{{intake_notities}}": client.intake_notes ?? "",
      };

      outputFileName = `${client.first_name}_${client.last_name}_${template.name}.docx`.replace(/\s+/g, "_");
    }

    // Download template from storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("document-templates")
      .download(template.file_path);
    if (dlErr || !fileData) throw new Error("Template bestand niet gevonden");

    // Process DOCX (ZIP with XML)
    const zip = await JSZip.loadAsync(await fileData.arrayBuffer());
    const xmlParts = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml", "word/footer1.xml", "word/footer2.xml", "word/footer3.xml"];

    for (const partName of xmlParts) {
      const file = zip.file(partName);
      if (!file) continue;
      let xml = await file.async("string");
      
      // Pass 1: simple text replacement for non-split placeholders
      for (const [placeholder, value] of Object.entries(replacements)) {
        xml = xml.split(placeholder).join(escapeXml(value));
      }
      
      // Pass 2: handle split placeholders SCOPED per paragraph to prevent cross-paragraph destruction
      xml = xml.replace(/<w:p\b[^\/]*?>[\s\S]*?<\/w:p>/g, (para) => {
        const texts: string[] = [];
        para.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (_m: string, t: string) => {
          texts.push(t);
          return _m;
        });
        const joined = texts.join("");

        let modified = para;
        for (const [placeholder, value] of Object.entries(replacements)) {
          if (joined.includes(placeholder)) {
            modified = replaceSplitPlaceholder(modified, placeholder, escapeXml(value));
          }
        }
        return modified;
      });

      zip.file(partName, xml);
    }

    const outputBuffer = await zip.generateAsync({ type: "uint8array" });
    const storagePath = client_id ? `${client_id}` : staff_id ? `trainers/${staff_id}` : `schools/${school_id}`;
    const outputPath = `${storagePath}/${crypto.randomUUID()}_${outputFileName}`;

    const { error: uploadErr } = await serviceSupabase.storage
      .from("generated-documents")
      .upload(outputPath, outputBuffer, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    if (uploadErr) throw new Error("Opslaan mislukt: " + uploadErr.message);

    // Record in DB
    await serviceSupabase.from("generated_documents").insert({
      client_id: client_id || null,
      staff_id: staff_id || null,
      school_id: school_id || null,
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
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function replaceSplitPlaceholder(xml: string, placeholder: string, replacement: string): string {
  const chars = placeholder.split("");
  let pattern = "";
  for (let i = 0; i < chars.length; i++) {
    pattern += escapeRegex(chars[i]);
    if (i < chars.length - 1) {
      // Allow any combination of closing/opening w:t and w:r tags with optional w:rPr (which may contain nested XML elements)
      pattern += "(?:</w:t></w:r><w:r[^>]*>(?:<w:rPr>(?:[^<]|<(?!/w:rPr>))*</w:rPr>)?<w:t[^>]*>|</w:t></w:r><w:r[^>]*><w:t[^>]*>|</w:t><w:t[^>]*>|<w:rPr>(?:[^<]|<(?!/w:rPr>))*</w:rPr>)?";
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
