import { GraduationCap, Users, Calendar, Plus, Loader2 } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const statusMap: Record<string, string> = {
  actief: "status-groen",
  gepland: "status-oranje",
  afgerond: "status-rood",
};

export default function ProgrammasPage() {
  const [addOpen, setAddOpen] = useState(false);
  const { toast } = useToast();

  const { data: programs = [], isLoading, refetch } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("*, schools(name), program_clients(count)")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("programs").insert({
      name: form.get("name") as string,
      description: (form.get("description") as string) || null,
      start_date: (form.get("start_date") as string) || null,
      end_date: (form.get("end_date") as string) || null,
      max_participants: Number(form.get("max_participants")) || 10,
    });

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Programma aangemaakt" });
      setAddOpen(false);
      refetch();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Programma's</h1>
          <p className="text-sm text-muted-foreground">Trainingsgroepen en individuele trajecten</p>
        </div>
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
              <div><Label>Beschrijving</Label><Textarea name="description" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Startdatum</Label><Input name="start_date" type="date" /></div>
                <div><Label>Einddatum</Label><Input name="end_date" type="date" /></div>
              </div>
              <div><Label>Max deelnemers</Label><Input name="max_participants" type="number" defaultValue={10} min={1} /></div>
              <Button type="submit" className="w-full">Opslaan</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : programs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
          <GraduationCap className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nog geen programma's aangemaakt</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((prog: any) => {
            const enrolled = prog.program_clients?.[0]?.count ?? 0;
            const max = prog.max_participants ?? 10;
            const status = prog.status ?? "gepland";
            return (
              <div key={prog.id} className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kanjer-geel/10">
                    <GraduationCap className="h-5 w-5 text-kanjer-geel" />
                  </div>
                  <span className={`status-indicator ${statusMap[status] ?? "status-oranje"}`}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-base font-bold text-card-foreground">{prog.name}</h3>
                {prog.schools?.name && <p className="text-xs text-muted-foreground">{prog.schools.name}</p>}
                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground"><Users className="h-3.5 w-3.5" /> Deelnemers</span>
                    <span className="font-semibold text-card-foreground">{enrolled}/{max}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> Periode</span>
                    <span className="text-card-foreground">
                      {prog.start_date ? new Date(prog.start_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "—"}
                      {" – "}
                      {prog.end_date ? new Date(prog.end_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "—"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-kanjer-groen transition-all"
                      style={{ width: `${Math.min((enrolled / max) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
