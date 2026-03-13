import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/DateInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SchoolCombobox from "@/components/SchoolCombobox";
import { CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import DuplicateWarning from "@/components/DuplicateWarning";

const aanmeldSchema = z.object({
  first_name: z.string().trim().min(1, "Voornaam is verplicht").max(100),
  last_name: z.string().trim().min(1, "Achternaam is verplicht").max(100),
  date_of_birth: z.string().optional(),
  school_id: z.string().optional(),
  waitlist_area_id: z.string().optional(),
  guardian_name: z.string().trim().max(200).optional(),
  guardian_phone: z.string().trim().max(20).optional(),
  guardian_email: z.string().trim().email("Ongeldig e-mailadres").max(255).optional().or(z.literal("")),
  referral_reason: z.string().trim().max(2000).optional(),
});

type AanmeldForm = z.infer<typeof aanmeldSchema>;

export default function AanmeldenPublicPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof AanmeldForm, string>>>({});
  const [form, setForm] = useState<Partial<AanmeldForm>>({});

  const { data: schools = [] } = useQuery({
    queryKey: ["public-schools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, neighborhood_id, neighborhoods(area_id)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["public-areas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("areas")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Auto-fill area from selected school
  useEffect(() => {
    if (form.school_id && !form.waitlist_area_id) {
      const school = schools.find((s) => s.id === form.school_id);
      const areaId = (school as any)?.neighborhoods?.area_id;
      if (areaId) {
        setForm((prev) => ({ ...prev, waitlist_area_id: areaId }));
      }
    }
  }, [form.school_id, schools]);

  const updateField = (field: keyof AanmeldForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = aanmeldSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof AanmeldForm, string>> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof AanmeldForm;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    const school = schools.find((s: any) => s.id === result.data.school_id);
    const neighborhoodId = (school as any)?.neighborhood_id ?? null;
    const insertData: any = {
      first_name: result.data.first_name,
      last_name: result.data.last_name,
      date_of_birth: result.data.date_of_birth,
      school_id: result.data.school_id,
      neighborhood_id: neighborhoodId,
      guardian_name: result.data.guardian_name,
      guardian_phone: result.data.guardian_phone,
      guardian_email: result.data.guardian_email,
      referral_reason: result.data.referral_reason,
      intake_status: "nieuw",
      registration_date: new Date().toISOString().split("T")[0],
    };
    if (result.data.waitlist_area_id) {
      insertData.waitlist_area_id = result.data.waitlist_area_id;
    }
    const { error } = await supabase.from("clients").insert(insertData);
    setSubmitting(false);

    if (error) {
      setErrors({ first_name: "Er ging iets mis bij het verzenden. Probeer het opnieuw." });
    } else {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-6">
        <div className="max-w-md space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--status-groen)/0.15)]">
            <CheckCircle2 className="h-7 w-7 text-[hsl(var(--status-groen))]" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Aanmelding ontvangen!</h1>
          <p className="text-muted-foreground">
            De aanmelding is succesvol verwerkt. Het kind staat nu in het systeem met status "Nieuw".
          </p>
          <Button variant="outline" onClick={() => { setSubmitted(false); setForm({}); }}>
            <ArrowLeft className="h-4 w-4" /> Nieuwe aanmelding
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Kind Aanmelden</h1>
        <p className="text-sm text-muted-foreground">
          Vul het formulier in om een kind aan te melden voor een trainingsprogramma.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label="Voornaam kind *" error={errors.first_name}>
              <Input value={form.first_name ?? ""} onChange={(e) => updateField("first_name", e.target.value)} placeholder="Voornaam" />
            </FieldWrapper>
            <FieldWrapper label="Achternaam kind *" error={errors.last_name}>
              <Input value={form.last_name ?? ""} onChange={(e) => updateField("last_name", e.target.value)} placeholder="Achternaam" />
            </FieldWrapper>
          </div>
          <DuplicateWarning firstName={form.first_name ?? ""} lastName={form.last_name ?? ""} />

          <FieldWrapper label="Geboortedatum kind" error={errors.date_of_birth}>
            <DateInput value={form.date_of_birth ?? ""} onChange={(v) => updateField("date_of_birth", v)} max={new Date().toISOString().split("T")[0]} />
          </FieldWrapper>

          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label="School" error={errors.school_id}>
              <SchoolCombobox
                schools={schools}
                value={form.school_id ?? ""}
                onValueChange={(v) => updateField("school_id", v)}
              />
            </FieldWrapper>
            <FieldWrapper label="Gebied">
              <Select value={form.waitlist_area_id ?? ""} onValueChange={(v) => updateField("waitlist_area_id", v)}>
                <SelectTrigger><SelectValue placeholder="Automatisch via school" /></SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Gegevens ouder/verzorger</p>
          </div>

          <FieldWrapper label="Naam ouder/verzorger" error={errors.guardian_name}>
            <Input value={form.guardian_name ?? ""} onChange={(e) => updateField("guardian_name", e.target.value)} placeholder="Volledige naam" />
          </FieldWrapper>

          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label="Telefoonnummer" error={errors.guardian_phone}>
              <Input type="tel" value={form.guardian_phone ?? ""} onChange={(e) => updateField("guardian_phone", e.target.value)} placeholder="06-12345678" />
            </FieldWrapper>
            <FieldWrapper label="E-mailadres" error={errors.guardian_email}>
              <Input type="email" value={form.guardian_email ?? ""} onChange={(e) => updateField("guardian_email", e.target.value)} placeholder="email@voorbeeld.nl" />
            </FieldWrapper>
          </div>

          <FieldWrapper label="Reden van aanmelding" error={errors.referral_reason}>
            <Textarea
              value={form.referral_reason ?? ""}
              onChange={(e) => updateField("referral_reason", e.target.value)}
              placeholder="Beschrijf kort waarom u uw kind wilt aanmelden..."
              rows={3}
            />
          </FieldWrapper>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Bezig met verzenden..." : "Aanmelding versturen"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Gegevens worden vertrouwelijk behandeld conform de AVG.
          </p>
        </form>
    </div>
  );
}

function FieldWrapper({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
