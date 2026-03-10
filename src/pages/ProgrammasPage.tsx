import { useNavigate } from "react-router-dom";
import { GraduationCap, Users, Calendar, Plus, Loader2, MapPin, ArrowRight, Download } from "lucide-react";
import ProgramTrainers from "@/components/ProgramTrainers";
import ProgramAttendance from "@/components/ProgramAttendance";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { downloadExport, ExportColumn } from "@/lib/csvExport";

const statusMap: Record<string, { css: string; label: string }> = {
  te_plannen: { css: "status-rood", label: "Te plannen" },
  ingepland: { css: "status-oranje", label: "Ingepland" },
  gestart: { css: "status-groen", label: "Gestart" },
  afgerond: { css: "status-rood", label: "Afgerond" },
};

const nextStatus: Record<string, string> = {
  te_plannen: "ingepland",
  ingepland: "gestart",
  gestart: "afgerond",
};

const nextStatusLabel: Record<string, string> = {
  te_plannen: "Inplannen",
  ingepland: "Starten",
  gestart: "Afronden",
};

export default function ProgrammasPage() {
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planTarget, setPlanTarget] = useState<{ id: string; area_id?: string; neighborhood_id?: string; start_date?: string; end_date?: string } | null>(null);
  const [planArea, setPlanArea] = useState("");
  const [planNeighborhood, setPlanNeighborhood] = useState("");
  const [planStart, setPlanStart] = useState("");
  const [planEnd, setPlanEnd] = useState("");
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>("");
  const [selectedAgeCategory, setSelectedAgeCategory] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("actief");
  const { toast } = useToast();

  const { data: areas = [] } = useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: neighborhoods = [] } = useQuery({
    queryKey: ["neighborhoods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("neighborhoods").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredNeighborhoods = selectedArea
    ? neighborhoods.filter((n: any) => n.area_id === selectedArea)
    : neighborhoods;

  const { data: programs = [], isLoading, refetch } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("*, schools(name), program_clients(count), areas(name), neighborhoods(name)")
        .eq("archived", false)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredPrograms = programs.filter((p: any) => {
    const s = p.status ?? "te_plannen";
    if (statusFilter === "alle") return true;
    if (statusFilter === "actief") return s !== "afgerond";
    return s === statusFilter;
  });

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("programs").insert({
      name: form.get("name") as string,
      description: (form.get("description") as string) || null,
      training_number: (form.get("training_number") as string) || null,
      location: (form.get("location") as string) || null,
      start_date: (form.get("start_date") as string) || null,
      end_date: (form.get("end_date") as string) || null,
      max_participants: Number(form.get("max_participants")) || 14,
      area_id: selectedArea || null,
      neighborhood_id: selectedNeighborhood || null,
      age_category: selectedAgeCategory || null,
    } as any);

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Programma aangemaakt" });
      setAddOpen(false);
      setSelectedArea("");
      setSelectedNeighborhood("");
      setSelectedAgeCategory("");
      refetch();
    }
  };

  const handleStatusChange = async (id: string, currentStatus: string, newStatus: string, enrolled: number, prog?: any) => {
    // For "Inplannen": open dialog to set period + area
    if (currentStatus === "te_plannen" && newStatus === "ingepland") {
      setPlanTarget({ id, area_id: prog?.area_id, neighborhood_id: prog?.neighborhood_id, start_date: prog?.start_date, end_date: prog?.end_date });
      setPlanArea(prog?.area_id ?? "");
      setPlanNeighborhood(prog?.neighborhood_id ?? "");
      setPlanStart(prog?.start_date ?? "");
      setPlanEnd(prog?.end_date ?? "");
      setPlanOpen(true);
      return;
    }
    // Validate before starting: min 7 participants + 2 trainers
    if (currentStatus === "ingepland" && newStatus === "gestart") {
      if (enrolled < 7) {
        toast({ title: "Kan niet starten", description: `Minimaal 7 deelnemers vereist (nu ${enrolled}).`, variant: "destructive" });
        return;
      }
      const { data: trainers } = await supabase
        .from("program_staff")
        .select("id")
        .eq("program_id", id)
        .eq("role", "trainer");
      const trainerCount = trainers?.length ?? 0;
      if (trainerCount < 2) {
        toast({ title: "Kan niet starten", description: `Minimaal 2 vaste trainers vereist (nu ${trainerCount}).`, variant: "destructive" });
        return;
      }
    }
    const { error } = await supabase.from("programs").update({ status: newStatus } as any).eq("id", id);
    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Status gewijzigd naar ${statusMap[newStatus]?.label ?? newStatus}` });
      refetch();
    }
  };

  const handlePlanSubmit = async () => {
    if (!planTarget) return;
    if (!planStart || !planEnd) {
      toast({ title: "Vul de start- en einddatum in", variant: "destructive" });
      return;
    }
    if (!planArea) {
      toast({ title: "Selecteer een gebied", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("programs").update({
      status: "ingepland",
      start_date: planStart,
      end_date: planEnd,
      area_id: planArea,
      neighborhood_id: planNeighborhood || null,
    } as any).eq("id", planTarget.id);
    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Training ingepland" });
      setPlanOpen(false);
      setPlanTarget(null);
      refetch();
    }
  };

  const planFilteredNeighborhoods = planArea
    ? neighborhoods.filter((n: any) => n.area_id === planArea)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Programma's</h1>
          <p className="text-sm text-muted-foreground">Trainingsgroepen en individuele trajecten</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="alle">Alle statussen</SelectItem>
              <SelectItem value="actief">Actief (niet afgerond)</SelectItem>
              <SelectItem value="te_plannen">Te plannen</SelectItem>
              <SelectItem value="ingepland">Ingepland</SelectItem>
              <SelectItem value="gestart">Gestart</SelectItem>
              <SelectItem value="afgerond">Afgerond</SelectItem>
            </SelectContent>
          </Select>
          {(["csv", "xlsx"] as const).map((fmt) => (
            <Button key={fmt} variant="outline" size="sm" onClick={() => {
              const rows = filteredPrograms.map((p: any) => ({
                naam: p.name,
                beschrijving: p.description ?? "",
                school: p.schools?.name ?? "",
                gebied: p.areas?.name ?? "",
                wijk: p.neighborhoods?.name ?? "",
                status: statusMap[p.status ?? "te_plannen"]?.label ?? p.status ?? "",
                deelnemers: p.program_clients?.[0]?.count ?? 0,
                max: p.max_participants ?? "",
                start: p.start_date ?? "",
                eind: p.end_date ?? "",
              }));
              downloadExport(`programmas.${fmt}`, [
                { key: "naam", label: "Naam" },
                { key: "beschrijving", label: "Beschrijving" },
                { key: "school", label: "School" },
                { key: "gebied", label: "Gebied" },
                { key: "wijk", label: "Wijk" },
                { key: "status", label: "Status" },
                { key: "deelnemers", label: "Deelnemers" },
                { key: "max", label: "Max" },
                { key: "start", label: "Startdatum" },
                { key: "eind", label: "Einddatum" },
              ], rows, fmt);
            }}>
              <Download className="h-4 w-4" /> {fmt.toUpperCase()}
            </Button>
          ))}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Programma Aanmaken</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuw Programma</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div><Label>Naam *</Label><Input name="name" required /></div>
              <div><Label>Trainingsnummer</Label><Input name="training_number" placeholder="bijv. KT-001" /></div>
              <div><Label>Locatie</Label><Input name="location" placeholder="bijv. Huis aan de Wijk, schoolnaam..." /></div>
              <div><Label>Beschrijving</Label><Textarea name="description" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Startdatum</Label><Input name="start_date" type="date" /></div>
                <div><Label>Einddatum</Label><Input name="end_date" type="date" /></div>
              </div>
              <div><Label>Max deelnemers</Label><Input name="max_participants" type="number" defaultValue={14} min={7} max={14} /></div>
              <div>
                <Label>Leeftijdscategorie</Label>
                <Select value={selectedAgeCategory} onValueChange={setSelectedAgeCategory}>
                  <SelectTrigger><SelectValue placeholder="Selecteer categorie" /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="5-7">5–7 jaar</SelectItem>
                    <SelectItem value="8-12">8–12 jaar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Gebied</Label>
                  <Select value={selectedArea} onValueChange={(v) => { setSelectedArea(v); setSelectedNeighborhood(""); }}>
                    <SelectTrigger><SelectValue placeholder="Selecteer gebied" /></SelectTrigger>
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
                    <SelectTrigger><SelectValue placeholder="Selecteer wijk" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      {filteredNeighborhoods.map((n: any) => (
                        <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full">Opslaan</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filteredPrograms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
          <GraduationCap className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Geen programma's gevonden{statusFilter !== "alle" ? " voor deze status" : ""}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPrograms.map((prog: any) => {
            const enrolled = prog.program_clients?.[0]?.count ?? 0;
            const max = prog.max_participants ?? 14;
            const status = prog.status ?? "te_plannen";
            const statusInfo = statusMap[status] ?? { css: "status-oranje", label: status };
            const next = nextStatus[status];
            return (
              <div key={prog.id} className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kanjer-geel/10">
                    <GraduationCap className="h-5 w-5 text-kanjer-geel" />
                  </div>
                  <span className={`status-indicator ${statusInfo.css}`}>
                    {statusInfo.label}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-base font-bold text-card-foreground cursor-pointer hover:underline" onClick={() => navigate(`/programmas/${prog.id}`)}>
                  {prog.name}
                  {prog.age_category && <span className="ml-2 text-xs font-normal text-muted-foreground">({prog.age_category} jaar)</span>}
                </h3>
                {prog.description && <p className="text-xs text-muted-foreground">{prog.description}</p>}
                {prog.schools?.name && <p className="text-xs text-muted-foreground">{prog.schools.name}</p>}
                {prog.areas?.name && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {prog.areas.name}
                  </p>
                )}
                {prog.neighborhoods?.name && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground ml-4">
                    Wijk: {prog.neighborhoods.name}
                  </p>
                )}
                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  <ProgramTrainers programId={prog.id} />
                  <ProgramAttendance programId={prog.id} programName={prog.name} />
                  <div className="flex items-center justify-between text-xs mt-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground"><Users className="h-3.5 w-3.5" /> Deelnemers</span>
                    <span className="font-semibold text-card-foreground">{enrolled}/{max}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> Periode</span>
                    <span className="text-card-foreground">
                      {prog.start_date ? new Date(prog.start_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      {" – "}
                      {prog.end_date ? new Date(prog.end_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-kanjer-groen transition-all"
                      style={{ width: `${Math.min((enrolled / max) * 100, 100)}%` }}
                    />
                  </div>
                  {next && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full text-xs"
                      onClick={() => handleStatusChange(prog.id, status, next, enrolled, prog)}
                    >
                      <ArrowRight className="mr-1 h-3 w-3" />
                      {nextStatusLabel[status]}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Planning dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Training inplannen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Startdatum *</Label>
                <Input type="date" value={planStart} onChange={(e) => setPlanStart(e.target.value)} />
              </div>
              <div>
                <Label>Einddatum *</Label>
                <Input type="date" value={planEnd} onChange={(e) => setPlanEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Gebied *</Label>
              <Select value={planArea} onValueChange={(v) => { setPlanArea(v); setPlanNeighborhood(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecteer gebied" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {areas.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Wijk</Label>
              <Select value={planNeighborhood} onValueChange={setPlanNeighborhood} disabled={!planArea}>
                <SelectTrigger><SelectValue placeholder="Selecteer wijk" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {planFilteredNeighborhoods.map((n: any) => (
                    <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handlePlanSubmit}>
              <ArrowRight className="h-4 w-4 mr-1" /> Inplannen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
