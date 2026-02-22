import { useState } from "react";
import { UserCog, Plus, Search, Mail, Phone, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const rolColors: Record<string, string> = {
  backoffice: "bg-kanjer-blauw/10 text-kanjer-blauw",
  trainer: "bg-kanjer-groen/10 text-kanjer-groen",
};

const rolLabels: Record<string, string> = {
  backoffice: "Backoffice",
  trainer: "Trainer",
};

export default function MedewerkersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("");
  const queryClient = useQueryClient();

  const { data: medewerkers = [], isLoading } = useQuery({
    queryKey: ["medewerkers"],
    queryFn: async () => {
      // Fetch profiles, user_roles, and staff with active program count
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, phone");
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;

      const { data: staffData, error: sErr } = await supabase
        .from("staff")
        .select("user_id, specialization, program_staff(id)");
      if (sErr) throw sErr;

      return (profiles || []).map((p) => {
        const role = roles?.find((r) => r.user_id === p.user_id);
        const staff = staffData?.find((s) => s.user_id === p.user_id);
        return {
          user_id: p.user_id,
          naam: p.full_name,
          email: p.email || "",
          telefoon: p.phone || "",
          rol: role?.role || "onbekend",
          specialisatie: staff?.specialization || "",
          actieveGroepen: staff?.program_staff?.length || 0,
        };
      });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (payload: { email: string; full_name: string; role: string }) => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: payload,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Uitnodiging verstuurd!");
      setDialogOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("");
      queryClient.invalidateQueries({ queryKey: ["medewerkers"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Uitnodiging kon niet worden verstuurd");
    },
  });

  const filtered = medewerkers.filter((m) => {
    const q = searchQuery.toLowerCase();
    return (
      m.naam.toLowerCase().includes(q) ||
      m.rol.toLowerCase().includes(q) ||
      m.specialisatie.toLowerCase().includes(q)
    );
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteRole) {
      toast.error("Selecteer een rol");
      return;
    }
    inviteMutation.mutate({ email: inviteEmail, full_name: inviteName, role: inviteRole });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Medewerkers</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Laden..." : `${medewerkers.length} teamleden`}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
              <Plus className="h-4 w-4" />
              Medewerker Uitnodigen
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Medewerker Uitnodigen</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <Label htmlFor="invite-name">Volledige naam</Label>
                <Input
                  id="invite-name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  required
                  placeholder="Jan de Vries"
                />
              </div>
              <div>
                <Label htmlFor="invite-email">E-mailadres</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  placeholder="jan@kanjertraining.nl"
                />
              </div>
              <div>
                <Label>Rol</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer een rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trainer">Trainer</SelectItem>
                    <SelectItem value="backoffice">Backoffice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <button
                type="submit"
                disabled={inviteMutation.isPending}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {inviteMutation.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Versturen...
                  </span>
                ) : (
                  "Uitnodiging Versturen"
                )}
              </button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Zoek op naam, rol of specialisatie..."
          className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-4 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((person) => (
            <div
              key={person.user_id}
              className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">
                  {person.naam
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-card-foreground">
                    {person.naam}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${rolColors[person.rol] || ""}`}
                    >
                      {rolLabels[person.rol] || person.rol}
                    </span>
                    {person.specialisatie && (
                      <span className="text-xs text-muted-foreground">
                        {person.specialisatie}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 space-y-2 border-t border-border pt-3">
                {person.email && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {person.email}
                  </p>
                )}
                {person.telefoon && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> {person.telefoon}
                  </p>
                )}
                {person.actieveGroepen > 0 && (
                  <p className="text-xs font-medium text-kanjer-groen">
                    {person.actieveGroepen} actieve groep
                    {person.actieveGroepen > 1 ? "en" : ""}
                  </p>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && !isLoading && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              Geen medewerkers gevonden.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
