import { School, Search, Plus, MapPin, Loader2, Upload, Users, Trash2, Pencil, UserPlus, Wand2, FileText, Globe, Download, X, Clock, AlertTriangle as AlertTriangleIcon } from "lucide-react";
import SchoolDuplicateWarning from "@/components/SchoolDuplicateWarning";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { schoolKeys, invalidateAllSchoolQueries } from "@/lib/queryKeys";
import { formatSchoolTimeRange, validateSchoolTimePair, findMatchingColumn, normalizeSchoolName, dbTimeToInput, inputTimeToDb, SCHOOL_START_TIME_COLUMNS, SCHOOL_END_TIME_COLUMNS, SCHEDULE_TYPE_COLUMNS, SOURCE_COLUMNS, MUNICIPALITY_COLUMNS, getEffectiveMunicipality, resolveImportedSchoolTimePair } from "@/lib/schoolTimes";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { getAreaFromAddress } from "@/lib/postcodeMapping";
import { downloadExport, ExportColumn } from "@/lib/csvExport";
import { statusLabels, statusStyles } from "@/lib/clientUtils";

// ── CSV / Outlook helpers ──────────────────────────────────────────────

/** Parse a CSV string respecting quoted fields. Auto-detects ; or , delimiter. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter from header
  const header = lines[0];
  const delimiter = header.split(";").length >= header.split(",").length ? ";" : ",";

  const splitRow = (row: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (const ch of row) {
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === delimiter && !inQuote) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] ?? "";
    });
    return obj;
  });
}

/** Read uploaded file as parsed rows (Excel or CSV). */
async function readFileAsRows(file: File): Promise<Record<string, any>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    // Try UTF-8 first, fall back to Windows-1252
    let text: string;
    try {
      text = await file.text();
      // If garbled, try Windows-1252
      if (/\ufffd/.test(text)) throw new Error("garbled");
    } catch {
      const buf = await file.arrayBuffer();
      const decoder = new TextDecoder("windows-1252");
      text = decoder.decode(buf);
    }
    return parseCsv(text);
  }
  // Excel
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });
}

/** Outlook column name mapping → our field keys */
const OUTLOOK_COL_MAP: Record<string, string> = {
  // Name
  "first name": "firstName",
  "voornaam": "firstName",
  "last name": "lastName",
  "achternaam": "lastName",
  "display name": "displayName",
  "weergavenaam": "displayName",
  "naam": "displayName",
  "name": "displayName",
  // Email
  "e-mail address": "email",
  "e-mailadres": "email",
  "email": "email",
  "e-mail": "email",
  "email address": "email",
  // Phone
  "business phone": "phone",
  "home phone": "phone",
  "mobile phone": "phone",
  "primary phone": "phone",
  "telefoon op werk": "phone",
  "mobiele telefoon": "phone",
  "telefoon": "phone",
  "phone": "phone",
  // Function
  "job title": "functionTitle",
  "functie": "functionTitle",
  "function_title": "functionTitle",
  // Company / School
  "company": "company",
  "bedrijf": "company",
  "school": "company",
};

function mapOutlookRow(row: Record<string, any>) {
  const mapped: Record<string, string> = {};
  for (const [col, val] of Object.entries(row)) {
    const key = OUTLOOK_COL_MAP[col.toLowerCase().trim()];
    if (key && val && !mapped[key]) {
      mapped[key] = String(val).trim();
    }
  }
  // Combine firstName + lastName if no displayName
  if (!mapped.displayName && (mapped.firstName || mapped.lastName)) {
    mapped.displayName = [mapped.firstName, mapped.lastName].filter(Boolean).join(" ");
  }
  return mapped;
}

// ── Component ──────────────────────────────────────────────────────────

export default function ScholenPage() {
  const [search, setSearch] = useState("");
  const [filterAreaId, setFilterAreaId] = useState<string>("all");
  const [filterNeighborhoodId, setFilterNeighborhoodId] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("aanmeldingen");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [contactUploadOpen, setContactUploadOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [editingReferrer, setEditingReferrer] = useState<any>(null);
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>("");
  const [docUploading, setDocUploading] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [addScheduleType, setAddScheduleType] = useState<string>("");
  const [addSchoolName, setAddSchoolName] = useState<string>("");
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [timesUploadOpen, setTimesUploadOpen] = useState(false);
  const [importResultOpen, setImportResultOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ added: string[]; updated: string[]; unmatched: string[]; timesSet: number; invalidTimes: number; municipalitySet: number } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [schoolsToDelete, setSchoolsToDelete] = useState<any[]>([]);
  const [deleteBlockers, setDeleteBlockers] = useState<Record<string, { clients: number; programs: number }>>({});
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch areas with neighborhoods
  const { data: areas = [] } = useQuery({
    queryKey: ["areas-with-neighborhoods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("areas")
        .select("id, name, neighborhoods(id, name)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schools = [], isLoading, refetch } = useQuery({
    queryKey: schoolKeys.list(search),
    queryFn: async () => {
      let query = supabase
        .from("schools")
        .select("*, neighborhoods(name, area_id, areas(name)), referrers(id, name, function_title, email, phone)")
        .order("name");

      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,address.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch client counts per school
  const { data: clientsBySchool = [] } = useQuery({
    queryKey: ["clients", "by-school"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("school_id, intake_status")
        .eq("archived", false)
        .not("school_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch program counts per school
  const { data: programsBySchool = [] } = useQuery({
    queryKey: ["programs-by-school"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("school_id, name, status, start_date, end_date")
        .eq("archived", false)
        .not("school_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Build lookup maps
  const schoolClientCounts = clientsBySchool.reduce((acc: Record<string, Record<string, number>>, c: any) => {
    if (!c.school_id) return acc;
    if (!acc[c.school_id]) acc[c.school_id] = {};
    const status = c.intake_status ?? "nieuw";
    acc[c.school_id][status] = (acc[c.school_id][status] || 0) + 1;
    return acc;
  }, {});

  const schoolProgramCounts = programsBySchool.reduce((acc: Record<string, number>, p: any) => {
    if (!p.school_id) return acc;
    acc[p.school_id] = (acc[p.school_id] || 0) + 1;
    return acc;
  }, {});

  const schoolPrograms = programsBySchool.reduce((acc: Record<string, any[]>, p: any) => {
    if (!p.school_id) return acc;
    if (!acc[p.school_id]) acc[p.school_id] = [];
    acc[p.school_id].push(p);
    return acc;
  }, {});

  const getTotalClients = (schoolId: string) => {
    const counts = schoolClientCounts[schoolId];
    if (!counts) return 0;
    return Object.values(counts).reduce((a: number, b: number) => a + b, 0);
  };

  const autoDetectNeighborhood = (address: string) => {
    const areaName = getAreaFromAddress(address);
    if (!areaName) return;
    const area = areas.find((a: any) => a.name === areaName);
    if (area) {
      setSelectedArea(area.id);
      if (area.neighborhoods?.length > 0) {
        setSelectedNeighborhood(area.neighborhoods[0].id);
      } else {
        setSelectedNeighborhood("");
      }
    }
  };

  // Neighborhoods filtered by selected area
  const filteredNeighborhoods = selectedArea
    ? (areas.find((a: any) => a.id === selectedArea) as any)?.neighborhoods ?? []
    : [];

  const openEditSchool = (school: any) => {
    // Find the area from the neighborhood
    const neighborhoodId = school.neighborhood_id ?? "";
    let areaId = "";
    if (neighborhoodId) {
      const area = areas.find((a: any) => (a.neighborhoods ?? []).some((n: any) => n.id === neighborhoodId));
      if (area) areaId = area.id;
    }
    setSelectedArea(areaId);
    setSelectedNeighborhood(neighborhoodId);
    setEditForm({
      name: school.name ?? "",
      address: school.address ?? "",
      contact_email: school.contact_email ?? "",
      contact_phone: school.contact_phone ?? "",
      website_url: school.website_url ?? "",
      student_count: school.student_count ?? 0,
      school_start_time: dbTimeToInput(school.school_start_time),
      school_end_time: dbTimeToInput(school.school_end_time),
      schedule_type: school.schedule_type ?? "",
      source: school.source ?? "",
      municipality: school.municipality ?? "",
    });
    setSelectedSchool(school);
    setEditOpen(true);
  };

  const handleEditSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool) return;

    // Validate time pair before submit
    const timeValidation = validateSchoolTimePair(editForm.school_start_time, editForm.school_end_time);
    if (!timeValidation.valid) {
      toast({ title: "Ongeldige schooltijden", description: timeValidation.error, variant: "destructive" });
      return;
    }

    setEditSaving(true);

    let neighborhoodId = selectedNeighborhood || null;
    if (!neighborhoodId && editForm.address) {
      const areaName = getAreaFromAddress(editForm.address);
      if (areaName) {
        const area = areas.find((a: any) => a.name === areaName);
        if (area && area.neighborhoods?.length > 0) {
          neighborhoodId = area.neighborhoods[0].id;
        }
      }
    }

    const { error } = await supabase.from("schools").update({
      name: editForm.name,
      address: editForm.address || null,
      contact_email: editForm.contact_email || null,
      contact_phone: editForm.contact_phone || null,
      website_url: editForm.website_url || null,
      student_count: Number(editForm.student_count) || 0,
      neighborhood_id: neighborhoodId,
      school_start_time: inputTimeToDb(editForm.school_start_time ?? "") as any,
      school_end_time: inputTimeToDb(editForm.school_end_time ?? "") as any,
      schedule_type: editForm.schedule_type || null,
      source: editForm.source || null,
      municipality: editForm.municipality?.trim() || null,
    }).eq("id", selectedSchool.id);

    setEditSaving(false);
    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "School bijgewerkt" });
      setEditOpen(false);
      setSelectedSchool(null);
      invalidateAllSchoolQueries(queryClient);
    }
  };

  const handleAddSchool = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const address = (formData.get("address") as string) || "";
    const startTime = (formData.get("school_start_time") as string) || "";
    const endTime = (formData.get("school_end_time") as string) || "";

    // Validate time pair
    const timeValidation = validateSchoolTimePair(startTime, endTime);
    if (!timeValidation.valid) {
      toast({ title: "Ongeldige schooltijden", description: timeValidation.error, variant: "destructive" });
      return;
    }

    // Auto-detect neighborhood if not manually selected
    let neighborhoodId = selectedNeighborhood || null;
    if (!neighborhoodId && address) {
      const areaName = getAreaFromAddress(address);
      if (areaName) {
        const area = areas.find((a: any) => a.name === areaName);
        if (area && area.neighborhoods?.length > 0) {
          neighborhoodId = area.neighborhoods[0].id;
        }
      }
    }

    const { error } = await supabase.from("schools").insert({
      name: formData.get("name") as string,
      address: address || null,
      contact_email: (formData.get("contact_email") as string) || null,
      contact_phone: (formData.get("contact_phone") as string) || null,
      website_url: (formData.get("website_url") as string) || null,
      student_count: Number(formData.get("student_count")) || 0,
      neighborhood_id: neighborhoodId,
      school_start_time: inputTimeToDb(startTime) as any,
      school_end_time: inputTimeToDb(endTime) as any,
      schedule_type: addScheduleType || null,
      source: (formData.get("source") as string) || null,
      municipality: ((formData.get("municipality") as string) ?? "").trim() || null,
    } as any);

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "School toegevoegd" });
      setSelectedArea("");
      setSelectedNeighborhood("");
      setAddScheduleType("");
      invalidateAllSchoolQueries(queryClient);
    }
  };

  // ── Bulk-assign schools to neighborhoods based on postcode ──
  const bulkAssignMutation = useMutation({
    mutationFn: async () => {
      let assigned = 0;
      for (const school of schools as any[]) {
        if (!school.address) continue;
        const areaName = getAreaFromAddress(school.address);
        if (!areaName) continue;
        const area = areas.find((a: any) => a.name === areaName);
        if (!area || !area.neighborhoods?.length) continue;
        const neighborhoodId = area.neighborhoods[0].id;
        const { error } = await supabase
          .from("schools")
          .update({ neighborhood_id: neighborhoodId })
          .eq("id", school.id);
        if (!error) assigned++;
      }
      return assigned;
    },
    onSuccess: (count) => {
      toast({ title: `${count} scholen gekoppeld aan een gebied` });
      invalidateAllSchoolQueries(queryClient);
    },
    onError: (err: any) => {
      toast({ title: "Fout bij koppelen", description: err.message, variant: "destructive" });
    },
  });

  // ── School file upload (Excel + CSV) ──

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const rows = await readFileAsRows(file);
      if (rows.length === 0) throw new Error("Bestand is leeg");

      // Build a lookup: area name (lowercase) → { areaId, neighborhoods: [{ id, name }] }
      const areaLookup = new Map<string, { areaId: string; neighborhoods: { id: string; name: string }[] }>();
      for (const a of areas) {
        areaLookup.set(a.name.toLowerCase(), {
          areaId: a.id,
          neighborhoods: (a as any).neighborhoods ?? [],
        });
      }

      // Detect time columns in import headers
      const headers = Object.keys(rows[0] ?? {});
      const startTimeCol = findMatchingColumn(headers, SCHOOL_START_TIME_COLUMNS);
      const endTimeCol = findMatchingColumn(headers, SCHOOL_END_TIME_COLUMNS);
      const scheduleTypeCol = findMatchingColumn(headers, SCHEDULE_TYPE_COLUMNS);
      const sourceCol = findMatchingColumn(headers, SOURCE_COLUMNS);
      const municipalityCol = findMatchingColumn(headers, MUNICIPALITY_COLUMNS);

      let invalidTimeCount = 0;
      let timesSetCount = 0;
      let updatedCount = 0;
      let municipalitySetCount = 0;

      const mapped = rows.map((r) => {
        // Build address from DUO columns if available
        const duoStraat = r["STRAATNAAM"];
        const duoNr = r["HUISNUMMER-TOEVOEGING"];
        const duoPostcode = r["POSTCODE"];
        const duoAddress = duoStraat ? `${duoStraat} ${duoNr || ""}, ${duoPostcode || ""}`.trim().replace(/,\s*$/, "") : null;

        const address = r["adres"] || r["Adres"] || r["address"] || r["Address"] || duoAddress || null;

        // Auto-detect neighborhood from postcode
        let neighborhoodId: string | null = null;
        if (address) {
          const areaName = getAreaFromAddress(address);
          if (areaName) {
            const entry = areaLookup.get(areaName.toLowerCase());
            if (entry && entry.neighborhoods.length > 0) {
              neighborhoodId = entry.neighborhoods[0].id;
            }
          }
        }

        // Resolve school times from explicit columns, range cells, or weekday columns (Maandag–Vrijdag)
        const resolvedTimes = resolveImportedSchoolTimePair(r, headers, startTimeCol, endTimeCol);
        invalidTimeCount += resolvedTimes.invalidValues;
        const school_start_time = resolvedTimes.school_start_time;
        const school_end_time = resolvedTimes.school_end_time;

        // Parse schedule type and source
        const rawScheduleType = scheduleTypeCol ? String(r[scheduleTypeCol] ?? "").trim().toLowerCase() : "";
        const schedule_type = rawScheduleType === "traditioneel" || rawScheduleType === "continu" ? rawScheduleType : null;
        const source = sourceCol ? String(r[sourceCol] ?? "").trim() || null : null;
        const rawMunicipality = municipalityCol ? String(r[municipalityCol] ?? "").trim() : "";
        const municipality = rawMunicipality || null;

        return {
          name: r["naam"] || r["Naam"] || r["name"] || r["School"] || r["school"] || r["VESTIGINGSNAAM"] || "",
          address,
          contact_email: r["email"] || r["Email"] || r["E-mail"] || r["e-mail"] || null,
          contact_phone: r["telefoon"] || r["Telefoon"] || r["phone"] || r["Phone"] || r["TELEFOONNUMMER"] || null,
          website_url: r["website"] || r["Website"] || r["website_url"] || r["URL"] || r["url"] || r["Website URL"] || r["website url"] || r["INTERNETADRES"] || null,
          student_count: Number(r["leerlingen"] || r["Leerlingen"] || r["student_count"] || r["Aantal leerlingen"] || 0) || 0,
          neighborhood_id: neighborhoodId,
          school_start_time,
          school_end_time,
          schedule_type,
          source,
          municipality,
        };
      }).filter((s) => s.name);

      if (mapped.length === 0) throw new Error("Geen geldige scholen gevonden. Zorg dat er een kolom 'Naam' is.");

      // Fetch existing schools for deduplication (include times for enrichment policy)
      const { data: existingSchools } = await supabase.from("schools").select("id, name, school_start_time, school_end_time, schedule_type, source, municipality");
      const existingMap = new Map<string, { id: string; school_start_time: string | null; school_end_time: string | null; schedule_type: string | null; source: string | null; municipality: string | null }>();
      for (const s of existingSchools ?? []) {
        existingMap.set(normalizeSchoolName(s.name), s);
      }

      const newSchools: any[] = [];
      const addedNames: string[] = [];
      const updatedNames: string[] = [];
      const updatePromises: Promise<any>[] = [];

      for (const s of mapped) {
        const normalized = normalizeSchoolName(s.name);
        const existing = existingMap.get(normalized);

        if (!existing) {
          // New school — insert with times
          newSchools.push(s);
          addedNames.push(s.name);
          if (s.school_start_time) timesSetCount++;
          if (s.municipality) municipalitySetCount++;
        } else {
          // Existing school — enrich with times, schedule_type, source when valid values provided
          const hasTimeUpdate = s.school_start_time && s.school_end_time;
          const hasScheduleTypeUpdate = s.schedule_type && !existing.schedule_type;
          const hasSourceUpdate = s.source && !existing.source;
          const hasMunicipalityUpdate = s.municipality && !existing.municipality;

          if (hasTimeUpdate || hasScheduleTypeUpdate || hasSourceUpdate || hasMunicipalityUpdate) {
            const schoolName = s.name;
            const updateFn = async () => {
              const updatePayload: Record<string, any> = {};
              if (hasTimeUpdate) {
                updatePayload.school_start_time = s.school_start_time;
                updatePayload.school_end_time = s.school_end_time;
              }
              if (hasScheduleTypeUpdate) updatePayload.schedule_type = s.schedule_type;
              if (hasSourceUpdate) updatePayload.source = s.source;
              if (hasMunicipalityUpdate) updatePayload.municipality = s.municipality;

              const { error } = await supabase.from("schools").update(updatePayload).eq("id", existing.id);
              if (!error) {
                updatedCount++;
                updatedNames.push(schoolName);
                if (hasTimeUpdate) timesSetCount++;
                if (hasMunicipalityUpdate) municipalitySetCount++;
              }
            };
            updatePromises.push(updateFn());
          }
        }
      }

      // Batch insert new schools
      for (let i = 0; i < newSchools.length; i += 50) {
        const chunk = newSchools.slice(i, i + 50);
        const { error } = await supabase.from("schools").insert(chunk);
        if (error) throw error;
      }

      // Wait for all time updates
      await Promise.all(updatePromises);

      return {
        imported: newSchools.length,
        skipped: mapped.length - newSchools.length,
        updated: updatedCount,
        timesSet: timesSetCount,
        invalidTimes: invalidTimeCount,
        municipalitySet: municipalitySetCount,
        addedNames,
        updatedNames,
      };
    },
    onSuccess: (result) => {
      const parts: string[] = [];
      if (result.imported > 0) parts.push(`${result.imported} scholen geïmporteerd`);
      if (result.skipped > 0) parts.push(`${result.skipped} duplicaten overgeslagen`);
      if (result.updated > 0) parts.push(`${result.updated} scholen bijgewerkt`);
      if (result.timesSet > 0) parts.push(`${result.timesSet} schooltijden ingesteld`);
      if (result.municipalitySet > 0) parts.push(`${result.municipalitySet} gemeenten ingesteld`);
      if (result.invalidTimes > 0) parts.push(`${result.invalidTimes} ongeldige tijdwaarden`);
      toast({ title: parts.join(", ") || "Import voltooid" });
      setUploadOpen(false);
      setImportResult({
        added: result.addedNames,
        updated: result.updatedNames,
        unmatched: [],
        timesSet: result.timesSet,
        invalidTimes: result.invalidTimes,
        municipalitySet: result.municipalitySet,
      });
      setImportResultOpen(true);
      invalidateAllSchoolQueries(queryClient);
    },
    onError: (err: any) => {
      toast({ title: "Import mislukt", description: err.message, variant: "destructive" });
    },
  });

  const handleSchoolFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  // ── School TIMES ONLY upload (never creates new schools) ──

  const [timesRows, setTimesRows] = useState<Record<string, any>[]>([]);
  const [timesUnmatched, setTimesUnmatched] = useState<string[]>([]);
  const [timesResolutions, setTimesResolutions] = useState<Record<string, string>>({});
  const [timesShowResolution, setTimesShowResolution] = useState(false);
  const [timesImporting, setTimesImporting] = useState(false);

  /** Strip common school type prefixes for better fuzzy matching */
  const SCHOOL_PREFIXES = [
    "openbare basisschool", "christelijke basisschool", "prot chr basissch",
    "chr basissch", "protestants christelijke basisschool", "rooms katholieke basisschool",
    "rk basisschool", "r.k. basisschool", "basisschool", "daltonschool",
    "montessorischool", "jenaplanschool", "obs", "cbs", "kbs", "sbo", "wso",
    "rkbs", "pcbs", "school voor",
  ];

  const stripSchoolPrefix = (name: string): string => {
    let n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    for (const prefix of SCHOOL_PREFIXES) {
      if (n.startsWith(prefix + " ")) {
        n = n.slice(prefix.length).trim();
        break;
      }
    }
    // Also strip leading "de ", "het ", "'t "
    n = n.replace(/^(de|het|'t)\s+/i, "").trim();
    return n;
  };

  /** Fuzzy school name matching with prefix-stripping for robust matching */
  const findSchoolMatch = (name: string, resolutions?: Record<string, string>): { id: string; name: string } | null => {
    if (!name) return null;
    const norm = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // Check user resolutions first
    if (resolutions && resolutions[norm]) {
      const s = (schools as any[]).find((s) => s.id === resolutions[norm]);
      return s ? { id: s.id, name: s.name } : null;
    }

    // Exact match
    const exact = (schools as any[]).find((s) => s.name.toLowerCase().trim() === norm);
    if (exact) return { id: exact.id, name: exact.name };

    // Contains: school name contains search or search contains school name
    const contains = (schools as any[]).find((s) => {
      const sNorm = s.name.toLowerCase().trim();
      return sNorm.includes(norm) || norm.includes(sNorm);
    });
    if (contains) return { id: contains.id, name: contains.name };

    // Prefix-stripped matching: strip known prefixes and compare core names
    const strippedInput = stripSchoolPrefix(name);
    if (strippedInput.length >= 3) {
      const prefixMatch = (schools as any[]).find((s) => {
        const strippedExisting = stripSchoolPrefix(s.name);
        return strippedExisting === strippedInput
          || strippedExisting.includes(strippedInput)
          || strippedInput.includes(strippedExisting);
      });
      if (prefixMatch) return { id: prefixMatch.id, name: prefixMatch.name };
    }

    // Starts-with match (first significant word)
    const firstWord = norm.split(/\s+/)[0];
    if (firstWord.length >= 3) {
      const startsWith = (schools as any[]).find((s) => s.name.toLowerCase().trim().startsWith(firstWord));
      if (startsWith) return { id: startsWith.id, name: startsWith.name };
    }

    return null;
  };

  const handleTimesFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await readFileAsRows(file);
      if (rows.length === 0) throw new Error("Bestand is leeg");
      setTimesRows(rows);
      // Detect unmatched
      const unmatched = new Set<string>();
      for (const r of rows) {
        const name = r["naam"] || r["Naam"] || r["name"] || r["School"] || r["school"] || r["VESTIGINGSNAAM"] || "";
        if (name && !findSchoolMatch(name)) {
          const norm = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          unmatched.add(norm);
        }
      }
      if (unmatched.size > 0) {
        setTimesUnmatched(Array.from(unmatched));
        setTimesShowResolution(true);
      } else {
        setTimesUnmatched([]);
        setTimesShowResolution(false);
        // Auto-import if all matched
        runTimesImport(rows, {});
      }
    } catch (err: any) {
      toast({ title: "Fout bij lezen", description: err.message, variant: "destructive" });
    }
  };

  const runTimesImport = async (rows: Record<string, any>[], resolutions: Record<string, string>) => {
    setTimesImporting(true);
    try {
      const headers = Object.keys(rows[0] ?? {});
      const startTimeCol = findMatchingColumn(headers, SCHOOL_START_TIME_COLUMNS);
      const endTimeCol = findMatchingColumn(headers, SCHOOL_END_TIME_COLUMNS);
      const scheduleTypeCol = findMatchingColumn(headers, SCHEDULE_TYPE_COLUMNS);
      const sourceCol = findMatchingColumn(headers, SOURCE_COLUMNS);
      const municipalityCol = findMatchingColumn(headers, MUNICIPALITY_COLUMNS);

      // Fetch existing school data for enrichment policy
      const { data: existingSchools } = await supabase.from("schools").select("id, name, school_start_time, school_end_time, schedule_type, source, municipality");
      const existingById = new Map<string, any>();
      for (const s of existingSchools ?? []) {
        existingById.set(s.id, s);
      }

      let invalidTimeCount = 0;
      let timesSetCount = 0;
      let municipalitySetCount = 0;
      const updatedNames: string[] = [];
      const unmatchedNames: string[] = [];

      for (const r of rows) {
        const name = r["naam"] || r["Naam"] || r["name"] || r["School"] || r["school"] || r["VESTIGINGSNAAM"] || "";
        if (!name) continue;

        const match = findSchoolMatch(name, resolutions);
        if (!match) {
          unmatchedNames.push(name);
          continue;
        }

        const existing = existingById.get(match.id);
        if (!existing) continue;

        // Resolve school times from explicit columns, range cells, or weekday columns (Maandag–Vrijdag)
        const resolvedTimes = resolveImportedSchoolTimePair(r, headers, startTimeCol, endTimeCol);
        invalidTimeCount += resolvedTimes.invalidValues;
        const school_start_time = resolvedTimes.school_start_time;
        const school_end_time = resolvedTimes.school_end_time;

        const rawScheduleType = scheduleTypeCol ? String(r[scheduleTypeCol] ?? "").trim().toLowerCase() : "";
        const schedule_type = rawScheduleType === "traditioneel" || rawScheduleType === "continu" ? rawScheduleType : null;
        const source = sourceCol ? String(r[sourceCol] ?? "").trim() || null : null;
        const rawMunicipality = municipalityCol ? String(r[municipalityCol] ?? "").trim() : "";
        const municipality = rawMunicipality || null;

        const hasTimeUpdate = school_start_time && school_end_time;
        const hasScheduleTypeUpdate = schedule_type && !existing.schedule_type;
        const hasSourceUpdate = source && !existing.source;
        const hasMunicipalityUpdate = municipality && !existing.municipality;

        if (hasTimeUpdate || hasScheduleTypeUpdate || hasSourceUpdate || hasMunicipalityUpdate) {
          const updatePayload: Record<string, any> = {};
          if (hasTimeUpdate) {
            updatePayload.school_start_time = school_start_time;
            updatePayload.school_end_time = school_end_time;
          }
          if (hasScheduleTypeUpdate) updatePayload.schedule_type = schedule_type;
          if (hasSourceUpdate) updatePayload.source = source;
          if (hasMunicipalityUpdate) updatePayload.municipality = municipality;

          const { error } = await supabase.from("schools").update(updatePayload).eq("id", match.id);
          if (!error) {
            updatedNames.push(name);
            if (hasTimeUpdate) timesSetCount++;
            if (hasMunicipalityUpdate) municipalitySetCount++;
          }
        }
      }

      const parts: string[] = [];
      if (updatedNames.length > 0) parts.push(`${updatedNames.length} scholen bijgewerkt`);
      if (timesSetCount > 0) parts.push(`${timesSetCount} schooltijden ingesteld`);
      if (municipalitySetCount > 0) parts.push(`${municipalitySetCount} gemeenten ingesteld`);
      if (unmatchedNames.length > 0) parts.push(`${unmatchedNames.length} niet gevonden`);
      if (invalidTimeCount > 0) parts.push(`${invalidTimeCount} ongeldige tijdwaarden`);
      toast({ title: parts.join(", ") || "Import voltooid — geen wijzigingen" });

      setTimesUploadOpen(false);
      setTimesRows([]);
      setTimesUnmatched([]);
      setTimesResolutions({});
      setTimesShowResolution(false);
      setImportResult({
        added: [],
        updated: updatedNames,
        unmatched: unmatchedNames,
        timesSet: timesSetCount,
        invalidTimes: invalidTimeCount,
        municipalitySet: municipalitySetCount,
      });
      setImportResultOpen(true);
      invalidateAllSchoolQueries(queryClient);
    } catch (err: any) {
      toast({ title: "Import mislukt", description: err.message, variant: "destructive" });
    } finally {
      setTimesImporting(false);
    }
  };

  // ── Contact person file upload (Excel + CSV + Outlook) ──

  const contactUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const rows = await readFileAsRows(file);
      if (rows.length === 0) throw new Error("Bestand is leeg");

      // Build school lookup (case-insensitive)
      const schoolLookup = new Map<string, string>();
      schools.forEach((s: any) => {
        schoolLookup.set(s.name.toLowerCase(), s.id);
      });

      const toInsert: any[] = [];
      const unmatched: string[] = [];

      for (const row of rows) {
        const m = mapOutlookRow(row);
        const name = m.displayName;
        if (!name) continue;

        let schoolId: string | null = null;
        if (m.company) {
          schoolId = schoolLookup.get(m.company.toLowerCase()) ?? null;
          if (!schoolId) {
            unmatched.push(`${name} (${m.company})`);
          }
        }

        toInsert.push({
          name,
          email: m.email || null,
          phone: m.phone || null,
          function_title: m.functionTitle || null,
          school_id: schoolId,
        });
      }

      if (toInsert.length === 0) throw new Error("Geen geldige contactpersonen gevonden.");

      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const { error } = await supabase.from("referrers").insert(chunk);
        if (error) throw error;
      }

      return { imported: toInsert.length, unmatched };
    },
    onSuccess: ({ imported, unmatched }) => {
      const desc = unmatched.length > 0
        ? `${unmatched.length} contactpersonen konden niet aan een school worden gekoppeld.`
        : undefined;
      toast({ title: `${imported} contactpersonen geïmporteerd`, description: desc });
      setContactUploadOpen(false);
      queryClient.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (err: any) => {
      toast({ title: "Import mislukt", description: err.message, variant: "destructive" });
    },
  });

  const handleContactFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) contactUploadMutation.mutate(file);
  };

  // ── Contact person CRUD ──

  const handleAddReferrer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("ref_name") as string,
      function_title: (form.get("ref_function") as string) || null,
      email: (form.get("ref_email") as string) || null,
      phone: (form.get("ref_phone") as string) || null,
      school_id: selectedSchool?.id,
    };

    const { error } = editingReferrer
      ? await supabase.from("referrers").update(payload).eq("id", editingReferrer.id)
      : await supabase.from("referrers").insert(payload);

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingReferrer ? "Contactpersoon bijgewerkt" : "Contactpersoon toegevoegd" });
      setEditingReferrer(null);
      refetch();
    }
  };

  const handleDeleteReferrer = async (id: string) => {
    const { error } = await supabase.from("referrers").delete().eq("id", id);
    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Contactpersoon verwijderd" });
      refetch();
    }
  };

  // Flatten areas → neighborhoods for select
  const neighborhoodOptions = areas.flatMap((area: any) =>
    (area.neighborhoods ?? []).map((n: any) => ({
      id: n.id,
      label: `${area.name} – ${n.name}`,
    }))
  );

  // Get current referrers for selected school
  const selectedSchoolReferrers = selectedSchool
    ? (schools.find((s: any) => s.id === selectedSchool.id) as any)?.referrers ?? []
    : [];

  // Document generation state for schools
  const [selectedSchoolTemplateId, setSelectedSchoolTemplateId] = useState("");

  // Fetch document templates
  const { data: schoolDocTemplates = [] } = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("document_templates").select("*").order("name");
      return data ?? [];
    },
  });

  // ── Documents for selected school ──
  const { data: schoolDocs = [], refetch: refetchDocs } = useQuery({
    queryKey: ["school-documents", selectedSchool?.id],
    queryFn: async () => {
      if (!selectedSchool?.id) return [];
      const { data, error } = await supabase
        .from("school_documents" as any)
        .select("*")
        .eq("school_id", selectedSchool.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedSchool?.id && docsDialogOpen,
  });

  // Fetch generated docs for selected school
  const { data: schoolGeneratedDocs = [], refetch: refetchSchoolGenDocs } = useQuery({
    queryKey: ["school-generated-docs", selectedSchool?.id],
    queryFn: async () => {
      if (!selectedSchool?.id) return [];
      const { data } = await supabase
        .from("generated_documents")
        .select("*, document_templates(name)")
        .eq("school_id", selectedSchool.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!selectedSchool?.id && docsDialogOpen,
  });

  // Generate document for school
  const generateSchoolDocMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSchoolTemplateId || !selectedSchool?.id) throw new Error("Selecteer een template");
      const { data, error } = await supabase.functions.invoke("generate-document", {
        body: { template_id: selectedSchoolTemplateId, school_id: selectedSchool.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Document gegenereerd", description: data.file_name });
      setSelectedSchoolTemplateId("");
      refetchSchoolGenDocs();
    },
    onError: (err: any) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  // Download generated school document
  const handleGenDocDownload = async (doc: any) => {
    const { data, error } = await supabase.storage.from("generated-documents").download(doc.file_path);
    if (error || !data) {
      toast({ title: "Download mislukt", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: string) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSchool) return;
    setDocUploading(true);
    try {
      const filePath = `${selectedSchool.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("school-documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { user } } = await supabase.auth.getUser();
      const { error: dbError } = await supabase.from("school_documents" as any).insert({
        school_id: selectedSchool.id,
        category,
        file_name: file.name,
        file_path: filePath,
        uploaded_by: user?.id,
      } as any);
      if (dbError) throw dbError;

      toast({ title: "Document geüpload" });
      refetchDocs();
    } catch (err: any) {
      toast({ title: "Upload mislukt", description: err.message, variant: "destructive" });
    } finally {
      setDocUploading(false);
      e.target.value = "";
    }
  };

  const handleDocDelete = async (doc: any) => {
    await supabase.storage.from("school-documents").remove([doc.file_path]);
    const { error } = await supabase.from("school_documents" as any).delete().eq("id", doc.id);
    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Document verwijderd" });
      refetchDocs();
    }
  };

  const handleDocDownload = async (doc: any) => {
    const { data } = await supabase.storage.from("school-documents").createSignedUrl(doc.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  // ── School deletion ──

  const checkDeleteBlockers = async (schoolIds: string[]) => {
    const blockers: Record<string, { clients: number; programs: number }> = {};
    for (const id of schoolIds) {
      const [{ count: clientCount }, { count: programCount }] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("school_id", id),
        supabase.from("programs").select("id", { count: "exact", head: true }).eq("school_id", id),
      ]);
      blockers[id] = { clients: clientCount ?? 0, programs: programCount ?? 0 };
    }
    return blockers;
  };

  const initiateDelete = async (schoolList: any[]) => {
    const blockers = await checkDeleteBlockers(schoolList.map((s) => s.id));
    setDeleteBlockers(blockers);
    setSchoolsToDelete(schoolList);
    setDeleteConfirmOpen(true);
  };

  const executeDelete = async () => {
    setDeleting(true);
    try {
      const deletableIds = schoolsToDelete
        .filter((s) => {
          const b = deleteBlockers[s.id];
          return !b || (b.clients === 0 && b.programs === 0);
        })
        .map((s) => s.id);

      if (deletableIds.length === 0) {
        toast({ title: "Geen scholen verwijderd", description: "Alle geselecteerde scholen hebben gekoppelde gegevens.", variant: "destructive" });
        return;
      }

      // Cascade: delete referrers, school_documents, staff links, scenario slots school refs
      for (const id of deletableIds) {
        await Promise.all([
          supabase.from("referrers").delete().eq("school_id", id),
          supabase.from("school_documents" as any).delete().eq("school_id", id),
        ]);
      }

      // Delete schools
      for (let i = 0; i < deletableIds.length; i += 50) {
        const chunk = deletableIds.slice(i, i + 50);
        const { error } = await supabase.from("schools").delete().in("id", chunk);
        if (error) throw error;
      }

      toast({ title: `${deletableIds.length} school${deletableIds.length === 1 ? "" : "en"} verwijderd` });
      setSelectedSchoolIds(new Set());
      setDeleteConfirmOpen(false);
      setSchoolsToDelete([]);
      invalidateAllSchoolQueries(queryClient);
    } catch (err: any) {
      toast({ title: "Fout bij verwijderen", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const toggleSchoolSelection = (id: string) => {
    setSelectedSchoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllSchools = (schoolIds: string[]) => {
    setSelectedSchoolIds((prev) => {
      const allSelected = schoolIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(schoolIds);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Scholen</h1>
          <p className="text-sm text-muted-foreground">{schools.length} partnerscholen geregistreerd</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["csv", "xlsx"] as const).map((fmt) => (
            <Button key={fmt} variant="outline" size="sm" onClick={() => {
              const rows = schools.map((s: any) => ({
                naam: s.name,
                adres: s.address ?? "",
                gebied: s.neighborhoods?.areas?.name ?? "",
                wijk: s.neighborhoods?.name ?? "",
                leerlingen: s.student_count ?? 0,
                 roostertype: s.schedule_type ?? "",
                 bron: s.source ?? "",
                 gemeente: getEffectiveMunicipality(s.municipality),
                 schooltijden: formatSchoolTimeRange(s.school_start_time, s.school_end_time),
                 email: s.contact_email ?? "",
                 telefoon: s.contact_phone ?? "",
                 website: s.website_url ?? "",
                 contactpersonen: (s.referrers ?? []).map((r: any) => r.name).join(", "),
               }));
               downloadExport(`scholen.${fmt}`, [
                 { key: "naam", label: "Naam" },
                 { key: "adres", label: "Adres" },
                 { key: "gebied", label: "Gebied" },
                 { key: "wijk", label: "Wijk" },
                 { key: "leerlingen", label: "Leerlingen" },
                 { key: "roostertype", label: "Roostertype" },
                 { key: "bron", label: "Bron" },
                 { key: "gemeente", label: "Gemeente" },
                 { key: "schooltijden", label: "Schooltijden" },
                 { key: "email", label: "E-mail" },
                 { key: "telefoon", label: "Telefoon" },
                 { key: "website", label: "Website" },
                 { key: "contactpersonen", label: "Contactpersonen" },
              ], rows, fmt);
            }}>
              <Download className="h-4 w-4" /> {fmt.toUpperCase()}
            </Button>
          ))}
          {/* Bulk assign areas */}
          <Button
            variant="outline"
            onClick={() => bulkAssignMutation.mutate()}
            disabled={bulkAssignMutation.isPending}
          >
            <Wand2 className="h-4 w-4" />
            {bulkAssignMutation.isPending ? "Bezig..." : "Gebieden Toewijzen"}
          </Button>
          {/* Contact upload dialog */}
          <Dialog open={contactUploadOpen} onOpenChange={setContactUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Users className="h-4 w-4" /> Contactpersonen Importeren</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Contactpersonen Importeren</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload een Excel (.xlsx/.xls) of CSV-bestand, bijvoorbeeld een Outlook-export.
                  Het systeem herkent automatisch kolomnamen zoals <strong>First Name</strong>, <strong>Last Name</strong>, <strong>E-mail Address</strong>, <strong>Company</strong>, etc.
                </p>
                <p className="text-sm text-muted-foreground">
                  Het <strong>Company/Bedrijf</strong>-veld wordt gebruikt om contactpersonen aan een bestaande school te koppelen.
                </p>
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-border p-8">
                  <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {contactUploadMutation.isPending ? "Bezig met importeren..." : "Klik om bestand te kiezen"}
                    </span>
                    <span className="text-xs text-muted-foreground">.xlsx, .xls of .csv</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleContactFileUpload}
                      disabled={contactUploadMutation.isPending}
                    />
                  </label>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={() => setDuplicateDialogOpen(true)}>
            <AlertTriangle className="h-4 w-4" /> Check Duplicaten
          </Button>

          {/* School upload dialog */}
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="h-4 w-4" /> Scholen Importeren</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Scholen Importeren</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload een Excel (.xlsx/.xls) of CSV-bestand. Zorg dat er minimaal een kolom <strong>Naam</strong> is.
                  Optionele kolommen: Adres, Email, Telefoon, Leerlingen, Schooltijd begin, Schooltijd eind, Rooster (traditioneel/continu), Bron, Gemeente.
                </p>
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-border p-8">
                  <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {uploadMutation.isPending ? "Bezig met importeren..." : "Klik om bestand te kiezen"}
                    </span>
                    <span className="text-xs text-muted-foreground">.xlsx, .xls of .csv</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleSchoolFileUpload}
                      disabled={uploadMutation.isPending}
                    />
                  </label>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* School times only upload dialog */}
          <Dialog open={timesUploadOpen} onOpenChange={(open) => {
            setTimesUploadOpen(open);
            if (!open) { setTimesRows([]); setTimesUnmatched([]); setTimesResolutions({}); setTimesShowResolution(false); }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline"><Clock className="h-4 w-4" /> Schooltijden Importeren</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Schooltijden Importeren</DialogTitle>
                <DialogDescription>Update alleen bestaande scholen — er worden geen nieuwe scholen aangemaakt.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload een Excel of CSV-bestand met een kolom <strong>Naam</strong> en óf losse tijdkolommen (<strong>Schooltijd begin</strong>/<strong>Schooltijd eind</strong>) óf dagkolommen (<strong>Maandag</strong> t/m <strong>Vrijdag</strong>) met waarden zoals 08:30–15:00.
                  Optioneel: Rooster, Bron, Gemeente. Schoolnamen worden fuzzy gematcht met bestaande scholen.
                </p>

                {timesRows.length === 0 && (
                  <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-border p-8">
                    <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
                      <Clock className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">Klik om bestand te kiezen</span>
                      <span className="text-xs text-muted-foreground">.xlsx, .xls of .csv</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={handleTimesFileSelect}
                      />
                    </label>
                  </div>
                )}

                {timesRows.length > 0 && (
                  <Badge variant="secondary" className="text-sm">{timesRows.length} rijen ingelezen</Badge>
                )}

                {/* School name resolution step */}
                {timesShowResolution && timesUnmatched.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                    <p className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      {timesUnmatched.length} schoolna{timesUnmatched.length === 1 ? "am" : "men"} niet automatisch herkend
                    </p>
                    <p className="text-xs text-amber-700">Koppel hieronder de juiste school, of laat op "Overslaan" om deze rij(en) te negeren.</p>
                    {timesUnmatched.map((name) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="text-xs font-medium text-amber-900 min-w-[120px] truncate" title={name}>"{name}"</span>
                        <select
                          className="flex-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs"
                          value={timesResolutions[name] ?? ""}
                          onChange={(e) => setTimesResolutions((prev) => ({ ...prev, [name]: e.target.value }))}
                        >
                          <option value="">— Overslaan —</option>
                          {(schools as any[]).map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                {timesRows.length > 0 && (
                  <Button
                    onClick={() => runTimesImport(timesRows, timesResolutions)}
                    disabled={timesImporting}
                    className="w-full"
                  >
                    {timesImporting
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Importeren...</>
                      : <><Clock className="h-4 w-4" /> {timesShowResolution ? "Importeren met bovenstaande keuzes" : `${timesRows.length} schooltijden importeren`}</>
                    }
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setAddSchoolName(""); setAddScheduleType(""); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> School Toevoegen</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nieuwe School</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddSchool} className="space-y-4">
                <div><Label>Naam *</Label><Input name="name" required value={addSchoolName} onChange={(e) => setAddSchoolName(e.target.value)} /></div>
                <SchoolDuplicateWarning name={addSchoolName} schools={schools} />
                <div><Label>Adres</Label><Input name="address" onBlur={(e) => autoDetectNeighborhood(e.target.value)} /></div>
                <div>
                  <Label>Gebied</Label>
                  <Select value={selectedArea} onValueChange={(val) => { setSelectedArea(val); setSelectedNeighborhood(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecteer een gebied..." />
                    </SelectTrigger>
                    <SelectContent>
                      {areas.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Wijk</Label>
                  <Select value={selectedNeighborhood} onValueChange={setSelectedNeighborhood} disabled={!selectedArea}>
                    <SelectTrigger>
                      <SelectValue placeholder={selectedArea ? "Selecteer een wijk..." : "Kies eerst een gebied"} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredNeighborhoods.map((n: any) => (
                        <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>E-mail</Label><Input name="contact_email" type="email" /></div>
                  <div><Label>Telefoon</Label><Input name="contact_phone" type="tel" /></div>
                </div>
                <div><Label>Website</Label><Input name="website_url" type="url" placeholder="https://..." /></div>
                <div><Label>Aantal leerlingen</Label><Input name="student_count" type="number" min="0" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Schooltijd begin</Label><Input name="school_start_time" type="time" /></div>
                  <div><Label>Schooltijd eind</Label><Input name="school_end_time" type="time" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Roostertype</Label>
                    <Select value={addScheduleType} onValueChange={setAddScheduleType}>
                      <SelectTrigger><SelectValue placeholder="Selecteer..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="traditioneel">Traditioneel</SelectItem>
                        <SelectItem value="continu">Continu</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Bron</Label><Input name="source" placeholder="bijv. DUO, handmatig" /></div>
                </div>
                <div>
                  <Label>Gemeente</Label>
                  <Input name="municipality" placeholder="Leeg = Rotterdam" />
                </div>
                <Button type="submit" className="w-full">Opslaan</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek op naam of adres..."
          className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-4 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filterAreaId} onValueChange={(v) => { setFilterAreaId(v); setFilterNeighborhoodId("all"); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Gebied" /></SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Alle gebieden</SelectItem>
            {areas.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterNeighborhoodId} onValueChange={setFilterNeighborhoodId} disabled={filterAreaId === "all"}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Wijk" /></SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Alle wijken</SelectItem>
            {(filterAreaId !== "all" ? (areas.find((a: any) => a.id === filterAreaId) as any)?.neighborhoods ?? [] : []).map((n: any) => (
              <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="aanmeldingen">Meeste aanmeldingen</SelectItem>
            <SelectItem value="naam-az">Naam A-Z</SelectItem>
            <SelectItem value="naam-za">Naam Z-A</SelectItem>
          </SelectContent>
        </Select>
        {(filterAreaId !== "all" || filterNeighborhoodId !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterAreaId("all"); setFilterNeighborhoodId("all"); }}>
            <X className="h-3 w-3 mr-1" /> Wis filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (() => {
        const filtered = schools.filter((school: any) => {
          if (filterAreaId !== "all") {
            const schoolAreaId = school.neighborhoods?.area_id;
            if (schoolAreaId !== filterAreaId) return false;
          }
          if (filterNeighborhoodId !== "all") {
            if (school.neighborhood_id !== filterNeighborhoodId) return false;
          }
          return true;
        });
        const sorted = [...filtered].sort((a: any, b: any) => {
          if (sortBy === "aanmeldingen") return (getTotalClients(b.id)) - (getTotalClients(a.id));
          if (sortBy === "naam-az") return (a.name ?? "").localeCompare(b.name ?? "", "nl");
          if (sortBy === "naam-za") return (b.name ?? "").localeCompare(a.name ?? "", "nl");
          return 0;
        });
        return (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                    checked={sorted.length > 0 && sorted.every((s: any) => selectedSchoolIds.has(s.id))}
                    onChange={() => toggleAllSchools(sorted.map((s: any) => s.id))}
                  />
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">School</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Gebied</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Wijk</th>
                <th className="hidden px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Aanmeldingen</th>
                <th className="hidden px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Trainingen</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">Contactpersonen</th>
                <th className="hidden px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Rooster</th>
                <th className="hidden px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Schooltijden</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leerlingen</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0 && (
                <tr><td colSpan={11} className="px-5 py-8 text-center text-sm text-muted-foreground">Geen scholen gevonden</td></tr>
              )}
              {sorted.map((school: any) => (
                <tr key={school.id} className={`transition-colors hover:bg-muted/30 ${selectedSchoolIds.has(school.id) ? "bg-primary/5" : ""}`}>
                  <td className="px-3 py-4 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={selectedSchoolIds.has(school.id)}
                      onChange={() => toggleSchoolSelection(school.id)}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/20">
                        <School className="h-4 w-4 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-card-foreground">{school.name}</p>
                        {school.municipality && (
                          <span className="inline-flex items-center rounded-md bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                            {school.municipality}
                          </span>
                        )}
                        {school.address && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" /> {school.address}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          {(school as any).website_url && (
                            <a href={(school as any).website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                              <Globe className="h-3 w-3" /> Website
                            </a>
                          )}
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                            onClick={() => { setSelectedSchool(school); setDocsDialogOpen(true); }}
                          >
                            <FileText className="h-3 w-3" /> Documenten
                          </button>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 mt-1" onClick={() => openEditSchool(school)} title="School bewerken">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                  <td className="hidden px-5 py-4 md:table-cell">
                    {school.neighborhoods?.areas?.name ? (
                      <span className="inline-flex items-center rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                        {school.neighborhoods.areas.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="hidden px-5 py-4 md:table-cell">
                    {school.neighborhoods?.name ? (
                      <span className="inline-flex items-center rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                        {school.neighborhoods.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="hidden px-5 py-4 lg:table-cell text-center">
                    <button
                      type="button"
                      className="inline-flex flex-col items-center gap-0.5 hover:opacity-80"
                      onClick={() => { setSelectedSchool(school); setStatsDialogOpen(true); }}
                    >
                      <span className="font-display text-sm font-bold text-card-foreground">{getTotalClients(school.id)}</span>
                      {(() => {
                        const counts = schoolClientCounts[school.id];
                        if (!counts) return null;
                        const statusKeys = Object.keys(counts);
                        if (statusKeys.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-0.5 justify-center max-w-[120px]">
                            {statusKeys.slice(0, 3).map((s) => (
                              <span key={s} className={`status-indicator text-[9px] px-1.5 py-0 ${statusStyles[s] ?? "status-rood"}`}>
                                {counts[s]}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </button>
                  </td>
                  <td className="hidden px-5 py-4 lg:table-cell text-center">
                    <button
                      type="button"
                      className="inline-flex flex-col items-center gap-0.5 hover:opacity-80"
                      onClick={() => { setSelectedSchool(school); setStatsDialogOpen(true); }}
                    >
                      <span className="font-display text-sm font-bold text-card-foreground">{schoolProgramCounts[school.id] ?? 0}</span>
                    </button>
                  </td>
                  <td className="hidden px-5 py-4 xl:table-cell">
                    <div className="flex items-center gap-2">
                      {school.referrers && school.referrers.length > 0 ? (
                        <div className="space-y-1 flex-1">
                          {school.referrers.slice(0, 2).map((ref: any) => (
                            <div key={ref.id} className="text-xs">
                              <span className="font-medium text-card-foreground">{ref.name}</span>
                              {ref.function_title && (
                                <span className="ml-1 text-muted-foreground">({ref.function_title})</span>
                              )}
                            </div>
                          ))}
                          {school.referrers.length > 2 && (
                            <span className="text-xs text-muted-foreground">+{school.referrers.length - 2} meer</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground flex-1">—</span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => {
                          setSelectedSchool(school);
                          setEditingReferrer(null);
                          setContactDialogOpen(true);
                        }}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                  <td className="hidden px-5 py-4 lg:table-cell text-center">
                    <span className="text-xs text-card-foreground">{(school as any).schedule_type ? ((school as any).schedule_type === "continu" ? "Continu" : "Traditioneel") : "—"}</span>
                  </td>
                  <td className="hidden px-5 py-4 lg:table-cell text-center">
                    <span className="text-xs text-card-foreground">{formatSchoolTimeRange((school as any).school_start_time, (school as any).school_end_time)}</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="font-display text-sm font-bold text-card-foreground">{school.student_count ?? 0}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => initiateDelete([school])}
                      title="School verwijderen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        );
      })()}

      {/* Bulk delete bar */}
      {selectedSchoolIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-lg">
          <span className="text-sm font-medium text-card-foreground">{selectedSchoolIds.size} school{selectedSchoolIds.size === 1 ? "" : "en"} geselecteerd</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              const toDelete = (schools as any[]).filter((s) => selectedSchoolIds.has(s.id));
              initiateDelete(toDelete);
            }}
          >
            <Trash2 className="h-4 w-4" /> Verwijderen
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedSchoolIds(new Set())}>
            Deselecteren
          </Button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scholen verwijderen</DialogTitle>
            <DialogDescription>Bevestig de verwijdering van de onderstaande scholen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {schoolsToDelete.map((school) => {
              const b = deleteBlockers[school.id];
              const blocked = b && (b.clients > 0 || b.programs > 0);
              return (
                <div key={school.id} className={`flex items-start justify-between rounded-lg border p-3 ${blocked ? "border-destructive/30 bg-destructive/5" : "border-border"}`}>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">{school.name}</p>
                    {school.address && <p className="text-xs text-muted-foreground">{school.address}</p>}
                  </div>
                  {blocked && (
                    <div className="flex items-center gap-1.5 text-xs text-destructive shrink-0">
                      <AlertTriangleIcon className="h-3.5 w-3.5" />
                      {b.clients > 0 && <span>{b.clients} deelnemer{b.clients > 1 ? "s" : ""}</span>}
                      {b.programs > 0 && <span>{b.programs} training{b.programs > 1 ? "en" : ""}</span>}
                    </div>
                  )}
                  {!blocked && <span className="text-xs text-muted-foreground">Kan verwijderd worden</span>}
                </div>
              );
            })}
            {schoolsToDelete.some((s) => { const b = deleteBlockers[s.id]; return b && (b.clients > 0 || b.programs > 0); }) && (
              <p className="text-xs text-muted-foreground">
                Scholen met gekoppelde deelnemers of trainingen worden <strong>niet</strong> verwijderd.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Annuleren</Button>
            <Button
              variant="destructive"
              onClick={executeDelete}
              disabled={deleting || schoolsToDelete.every((s) => { const b = deleteBlockers[s.id]; return b && (b.clients > 0 || b.programs > 0); })}
            >
              {deleting ? <><Loader2 className="h-4 w-4 animate-spin" /> Verwijderen...</> : <><Trash2 className="h-4 w-4" /> Verwijderen</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contact person management dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={(open) => {
        setContactDialogOpen(open);
        if (!open) { setEditingReferrer(null); setSelectedSchool(null); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Contactpersonen – {selectedSchool?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Existing referrers */}
            {selectedSchoolReferrers.length > 0 ? (
              <div className="space-y-2">
                {selectedSchoolReferrers.map((ref: any) => (
                  <div key={ref.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-card-foreground">{ref.name}</p>
                      {ref.function_title && <p className="text-xs text-muted-foreground">{ref.function_title}</p>}
                      {ref.email && <p className="text-xs text-muted-foreground">{ref.email}</p>}
                      {ref.phone && <p className="text-xs text-muted-foreground">{ref.phone}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingReferrer(ref)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteReferrer(ref.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nog geen contactpersonen.</p>
            )}

            {/* Add / Edit form */}
            <form onSubmit={handleAddReferrer} className="space-y-3 rounded-lg border border-border p-4 bg-muted/30">
              <p className="text-sm font-medium text-card-foreground">
                {editingReferrer ? "Contactpersoon bewerken" : "Contactpersoon toevoegen"}
              </p>
              <div><Label>Naam *</Label><Input name="ref_name" required defaultValue={editingReferrer?.name ?? ""} key={editingReferrer?.id ?? "new"} /></div>
              <div><Label>Functie</Label><Input name="ref_function" defaultValue={editingReferrer?.function_title ?? ""} key={`fn-${editingReferrer?.id ?? "new"}`} placeholder="bijv. IB-er, Directeur" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>E-mail</Label><Input name="ref_email" type="email" defaultValue={editingReferrer?.email ?? ""} key={`em-${editingReferrer?.id ?? "new"}`} /></div>
                <div><Label>Telefoon</Label><Input name="ref_phone" type="tel" defaultValue={editingReferrer?.phone ?? ""} key={`ph-${editingReferrer?.id ?? "new"}`} /></div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">{editingReferrer ? "Bijwerken" : "Toevoegen"}</Button>
                {editingReferrer && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingReferrer(null)}>Annuleren</Button>
                )}
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Documents dialog */}
      <Dialog open={docsDialogOpen} onOpenChange={(open) => {
        setDocsDialogOpen(open);
        if (!open) { setSelectedSchool(null); setSelectedSchoolTemplateId(""); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Documenten – {selectedSchool?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Document generation from template */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-card-foreground">Document Genereren</p>
              {schoolDocTemplates.length === 0 ? (
                <p className="text-xs text-muted-foreground">Geen templates beschikbaar.</p>
              ) : (
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <Select value={selectedSchoolTemplateId} onValueChange={setSelectedSchoolTemplateId}>
                      <SelectTrigger><SelectValue placeholder="Selecteer een template" /></SelectTrigger>
                      <SelectContent className="bg-popover">
                        {schoolDocTemplates.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" onClick={() => generateSchoolDocMutation.mutate()} disabled={!selectedSchoolTemplateId || generateSchoolDocMutation.isPending}>
                    {generateSchoolDocMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Genereer
                  </Button>
                </div>
              )}
              {(schoolGeneratedDocs as any[]).length > 0 && (
                <div className="space-y-1 mt-2">
                  {(schoolGeneratedDocs as any[]).map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-card-foreground truncate">{doc.file_name}</p>
                        <p className="text-[10px] text-muted-foreground">{doc.document_templates?.name ?? "—"}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleGenDocDownload(doc)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Schoolgids upload */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-card-foreground">Schoolgids</p>
              {(schoolDocs as any[]).filter((d: any) => d.category === "schoolgids").map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
                  <button
                    type="button"
                    className="flex items-center gap-2 min-w-0 hover:underline text-left"
                    onClick={() => handleDocDownload(doc)}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm truncate text-primary">{doc.file_name}</span>
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDocDownload(doc)}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDocDelete(doc)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-border p-3 hover:bg-muted/30">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{docUploading ? "Bezig..." : "Schoolgids uploaden"}</span>
                <input type="file" className="hidden" onChange={(e) => handleDocUpload(e, "schoolgids")} disabled={docUploading} />
              </label>
            </div>

            {/* Overig upload */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-card-foreground">Overig</p>
              {(schoolDocs as any[]).filter((d: any) => d.category === "overig").map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
                  <button
                    type="button"
                    className="flex items-center gap-2 min-w-0 hover:underline text-left"
                    onClick={() => handleDocDownload(doc)}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm truncate text-primary">{doc.file_name}</span>
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDocDownload(doc)}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDocDelete(doc)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-border p-3 hover:bg-muted/30">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{docUploading ? "Bezig..." : "Document uploaden"}</span>
                <input type="file" className="hidden" onChange={(e) => handleDocUpload(e, "overig")} disabled={docUploading} />
              </label>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit school dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => {
        setEditOpen(open);
        if (!open) { setSelectedSchool(null); setSelectedArea(""); setSelectedNeighborhood(""); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>School bewerken</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSchool} className="space-y-4">
            <div>
              <Label>Naam *</Label>
              <Input value={editForm.name ?? ""} onChange={(e) => setEditForm((f: any) => ({ ...f, name: e.target.value }))} required />
            </div>
            <SchoolDuplicateWarning name={editForm.name ?? ""} excludeId={selectedSchool?.id} schools={schools} />
            <div>
              <Label>Adres</Label>
              <Input value={editForm.address ?? ""} onChange={(e) => { setEditForm((f: any) => ({ ...f, address: e.target.value })); }} onBlur={(e) => autoDetectNeighborhood(e.target.value)} />
            </div>
            <div>
              <Label>Gebied</Label>
              <Select value={selectedArea} onValueChange={(val) => { setSelectedArea(val); setSelectedNeighborhood(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecteer een gebied..." /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {areas.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Wijk</Label>
              <Select value={selectedNeighborhood} onValueChange={setSelectedNeighborhood} disabled={!selectedArea}>
                <SelectTrigger><SelectValue placeholder={selectedArea ? "Selecteer een wijk..." : "Kies eerst een gebied"} /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {filteredNeighborhoods.map((n: any) => (
                    <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={editForm.contact_email ?? ""} onChange={(e) => setEditForm((f: any) => ({ ...f, contact_email: e.target.value }))} />
              </div>
              <div>
                <Label>Telefoon</Label>
                <Input type="tel" value={editForm.contact_phone ?? ""} onChange={(e) => setEditForm((f: any) => ({ ...f, contact_phone: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Website</Label>
              <Input type="url" placeholder="https://..." value={editForm.website_url ?? ""} onChange={(e) => setEditForm((f: any) => ({ ...f, website_url: e.target.value }))} />
            </div>
            <div>
              <Label>Aantal leerlingen</Label>
              <Input type="number" min="0" value={editForm.student_count ?? 0} onChange={(e) => setEditForm((f: any) => ({ ...f, student_count: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Schooltijd begin</Label>
                <Input type="time" value={editForm.school_start_time ?? ""} onChange={(e) => setEditForm((f: any) => ({ ...f, school_start_time: e.target.value }))} />
              </div>
              <div>
                <Label>Schooltijd eind</Label>
                <Input type="time" value={editForm.school_end_time ?? ""} onChange={(e) => setEditForm((f: any) => ({ ...f, school_end_time: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Roostertype</Label>
                <Select value={editForm.schedule_type ?? ""} onValueChange={(val) => setEditForm((f: any) => ({ ...f, schedule_type: val }))}>
                  <SelectTrigger><SelectValue placeholder="Selecteer..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="traditioneel">Traditioneel</SelectItem>
                    <SelectItem value="continu">Continu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Bron</Label>
                <Input value={editForm.source ?? ""} onChange={(e) => setEditForm((f: any) => ({ ...f, source: e.target.value }))} placeholder="bijv. DUO, handmatig" />
              </div>
            </div>
            <div>
              <Label>Gemeente</Label>
              <Input value={editForm.municipality ?? ""} onChange={(e) => setEditForm((f: any) => ({ ...f, municipality: e.target.value }))} placeholder="Leeg = Rotterdam" />
            </div>
            <Button type="submit" className="w-full" disabled={editSaving}>
              {editSaving ? "Opslaan..." : "Opslaan"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stats dialog */}
      <Dialog open={statsDialogOpen} onOpenChange={(open) => {
        setStatsDialogOpen(open);
        if (!open) setSelectedSchool(null);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Overzicht – {selectedSchool?.name}</DialogTitle>
          </DialogHeader>
          {selectedSchool && (
            <div className="space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Status distribution */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-card-foreground">Statusverdeling aanmeldingen</p>
                {(() => {
                  const counts = schoolClientCounts[selectedSchool.id];
                  if (!counts || Object.keys(counts).length === 0) {
                    return <p className="text-xs text-muted-foreground">Geen aanmeldingen bij deze school.</p>;
                  }
                  return (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(counts).map(([status, count]) => (
                        <div key={status} className="flex items-center gap-1.5">
                          <span className={`status-indicator ${statusStyles[status] ?? "status-rood"}`}>
                            {statusLabels[status] ?? status}
                          </span>
                          <span className="font-display text-sm font-bold text-card-foreground">{count as number}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    navigate(`/aanmeldingen?school=${selectedSchool.id}`);
                    setStatsDialogOpen(false);
                  }}>
                    Naar aanmeldingen
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    navigate(`/clienten?school=${selectedSchool.id}`);
                    setStatsDialogOpen(false);
                  }}>
                    Naar deelnemers
                  </Button>
                </div>
              </div>

              {/* Trainingen */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-card-foreground">Trainingen ({schoolProgramCounts[selectedSchool.id] ?? 0})</p>
                {(() => {
                  const progs = schoolPrograms[selectedSchool.id];
                  if (!progs || progs.length === 0) {
                    return <p className="text-xs text-muted-foreground">Geen trainingen bij deze school.</p>;
                  }
                  return (
                    <div className="space-y-1">
                      {progs.map((p: any) => (
                        <div key={p.school_id + p.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-card-foreground">{p.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.start_date ?? "—"} – {p.end_date ?? "—"}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">{p.status ?? "—"}</Badge>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate check dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Duplicaten Check</DialogTitle>
            <DialogDescription>Scholen met vergelijkbare namen</DialogDescription>
          </DialogHeader>
          {(() => {
            // Build fuzzy duplicate groups: schools whose normalized names overlap (substring match)
            const allSchools = schools.map((s: any) => ({ ...s, norm: normalizeSchoolName(s.name ?? "") })).filter((s: any) => s.norm);
            const visited = new Set<string>();
            const groups: { items: any[] }[] = [];

            for (let i = 0; i < allSchools.length; i++) {
              if (visited.has(allSchools[i].id)) continue;
              const group = [allSchools[i]];
              visited.add(allSchools[i].id);

              for (let j = i + 1; j < allSchools.length; j++) {
                if (visited.has(allSchools[j].id)) continue;
                // Check if any existing member in the group matches this school
                const matches = group.some((g: any) =>
                  g.norm === allSchools[j].norm ||
                  g.norm.includes(allSchools[j].norm) ||
                  allSchools[j].norm.includes(g.norm)
                );
                if (matches) {
                  group.push(allSchools[j]);
                  visited.add(allSchools[j].id);
                }
              }

              if (group.length > 1) {
                groups.push({ items: group });
              }
            }

            if (groups.length === 0) {
              return (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">Geen duplicaten gevonden ✓</p>
                </div>
              );
            }
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{groups.length} groep{groups.length !== 1 ? "en" : ""} met mogelijke duplicaten gevonden.</p>
                {groups.map((g, gi) => (
                  <div key={gi} className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-semibold">{g.items.length} scholen met vergelijkbare naam</span>
                    </div>
                    <div className="space-y-1">
                      {g.items.map((s: any) => (
                        <div key={s.id} className="flex items-center gap-2 text-sm">
                          <span className="font-medium">{s.name}</span>
                          {s.address && <span className="text-muted-foreground text-xs">{s.address}</span>}
                          {s.neighborhoods?.areas?.name && (
                            <Badge variant="outline" className="text-[10px]">{s.neighborhoods.areas.name}</Badge>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 text-xs ml-auto" onClick={() => { setDuplicateDialogOpen(false); openEditSchool(s); }}>
                            <Pencil className="h-3 w-3 mr-1" /> Bewerken
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Import result overview dialog */}
      <Dialog open={importResultOpen} onOpenChange={setImportResultOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Resultaat</DialogTitle>
            <DialogDescription>Overzicht van toegevoegde en bijgewerkte scholen</DialogDescription>
          </DialogHeader>
          {importResult && (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="flex flex-wrap gap-3">
                {importResult.added.length > 0 && <Badge variant="default" className="text-sm">{importResult.added.length} toegevoegd</Badge>}
                <Badge variant="secondary" className="text-sm">{importResult.updated.length} bijgewerkt</Badge>
                {importResult.timesSet > 0 && <Badge variant="outline" className="text-sm">{importResult.timesSet} tijden ingesteld</Badge>}
                {importResult.municipalitySet > 0 && <Badge variant="outline" className="text-sm">{importResult.municipalitySet} gemeenten ingesteld</Badge>}
                {importResult.invalidTimes > 0 && <Badge variant="destructive" className="text-sm">{importResult.invalidTimes} ongeldige tijdwaarden</Badge>}
              </div>

              {/* Added schools */}
              {importResult.added.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-card-foreground flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" />
                    Toegevoegde scholen ({importResult.added.length})
                  </p>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-48 overflow-y-auto">
                    <ul className="space-y-1">
                      {importResult.added.map((name, i) => (
                        <li key={i} className="text-sm text-card-foreground">{name}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Updated schools */}
              {importResult.updated.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-card-foreground flex items-center gap-2">
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                    Bijgewerkte scholen ({importResult.updated.length})
                  </p>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-48 overflow-y-auto">
                    <ul className="space-y-1">
                      {importResult.updated.map((name, i) => (
                        <li key={i} className="text-sm text-card-foreground">{name}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Unmatched schools */}
              {importResult.unmatched.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-card-foreground flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Niet gevonden in systeem ({importResult.unmatched.length})
                  </p>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 max-h-48 overflow-y-auto">
                    <ul className="space-y-1">
                      {importResult.unmatched.map((name, i) => (
                        <li key={i} className="text-sm text-card-foreground">{name}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {importResult.added.length === 0 && importResult.updated.length === 0 && importResult.unmatched.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Geen wijzigingen — alle scholen bestonden al.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
