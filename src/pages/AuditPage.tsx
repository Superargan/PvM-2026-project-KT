import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { auditKeys, clientKeys } from "@/lib/queryKeys";
import { useIsBackoffice } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Shield, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

const ACTION_LABELS: Record<string, string> = {
  view: "Bekeken",
  list_view: "Lijst bekeken",
  insert: "Aangemaakt",
  update: "Bijgewerkt",
  delete: "Verwijderd",
};

const TABLE_LABELS: Record<string, string> = {
  clients: "Deelnemer",
  programs: "Programma",
  program_clients: "Deelname",
  attendance: "Aanwezigheid",
  schools: "School",
  staff: "Medewerker",
};

type AuditRow = {
  id: string;
  created_at: string;
  viewed_by: string | null;
  client_id: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  changed_fields: string[] | null;
  old_values: Record<string, { old: unknown; new: unknown }> | null;
  new_values: Record<string, unknown> | null;
  details: string | null;
  profiles: { full_name: string | null } | null;
  clients: { first_name: string | null; last_name: string | null } | null;
};

export default function AuditPage() {
  const { isBackoffice, isLoading: roleLoading } = useIsBackoffice();
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [clientSearch, setClientSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data: clientOptions = [] } = useQuery({
    queryKey: clientKeys.list("audit-picker"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .order("last_name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: isBackoffice,
  });

  const filters: Record<string, string> = {
    client: clientFilter,
    action: actionFilter,
    table: tableFilter,
    from: dateFrom,
    to: dateTo,
    page: String(page),
  };
  const { data: rows = [], isLoading } = useQuery<AuditRow[]>({
    queryKey: auditKeys.review(filters),
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select(
          "id, created_at, viewed_by, client_id, action, table_name, record_id, changed_fields, old_values, new_values, details, profiles!viewed_by(full_name), clients!client_id(first_name, last_name)"
        )
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
      if (clientFilter !== "all") q = q.eq("client_id", clientFilter);
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      if (tableFilter !== "all") q = q.eq("table_name", tableFilter);
      if (dateFrom) q = q.gte("created_at", new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
    enabled: isBackoffice,
  });

  const hasNext = rows.length > PAGE_SIZE;
  const pageRows = hasNext ? rows.slice(0, PAGE_SIZE) : rows;

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(0);
  };

  const filteredClientOptions = useMemo(() => {
    if (!clientSearch.trim()) return clientOptions;
    const s = clientSearch.toLowerCase();
    return clientOptions.filter((c) =>
      `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase().includes(s)
    );
  }, [clientOptions, clientSearch]);

  if (roleLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isBackoffice) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Shield className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 font-display text-lg font-bold text-foreground">Geen toegang</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Alleen backoffice-medewerkers hebben toegang tot de audit log.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Overzicht van alle wijzigingen en inzagen op deelnemersdossiers.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 grid gap-3 md:grid-cols-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deelnemer</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Zoek naam..."
                className="pl-8"
              />
            </div>
            <Select value={clientFilter} onValueChange={resetPage(setClientFilter)}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle deelnemers</SelectItem>
                {filteredClientOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actie</Label>
          <Select value={actionFilter} onValueChange={resetPage(setActionFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle acties</SelectItem>
              {Object.entries(ACTION_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tabel</Label>
          <Select value={tableFilter} onValueChange={resetPage(setTableFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle tabellen</SelectItem>
              {Object.entries(TABLE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Van</Label>
          <Input type="date" value={dateFrom} onChange={(e) => resetPage(setDateFrom)(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tot</Label>
          <Input type="date" value={dateTo} onChange={(e) => resetPage(setDateTo)(e.target.value)} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datum/Tijd</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gebruiker</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actie</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tabel</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deelnemer</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wijzigingen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></td></tr>
            )}
            {!isLoading && pageRows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Geen audit-logs gevonden</td></tr>
            )}
            {pageRows.map((r) => {
              const clientName = r.clients
                ? `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim()
                : "—";
              return (
                <tr key={r.id} className="align-top transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm text-card-foreground whitespace-nowrap">
                    {format(new Date(r.created_at), "d MMM yyyy HH:mm", { locale: nl })}
                  </td>
                  <td className="px-4 py-3 text-sm text-card-foreground">
                    {r.profiles?.full_name ?? "Systeem"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{ACTION_LABELS[r.action] ?? r.action}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-card-foreground">
                    {r.table_name ? TABLE_LABELS[r.table_name] ?? r.table_name : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-card-foreground">{clientName || "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-xl">
                    <ChangeSummary row={r} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-xs text-muted-foreground">
            Pagina {page + 1} — {pageRows.length} regels
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isLoading}
            >
              <ChevronLeft className="h-4 w-4" /> Vorige
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext || isLoading}
            >
              Volgende <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangeSummary({ row }: { row: AuditRow }) {
  if (row.action === "view" || row.action === "list_view") {
    return <span>{row.details ?? "—"}</span>;
  }
  if (row.action === "insert") {
    return <span>Nieuwe record aangemaakt</span>;
  }
  if (row.action === "delete") {
    return <span>Record verwijderd</span>;
  }
  if (row.action === "update" && row.old_values) {
    const entries = Object.entries(row.old_values);
    if (entries.length === 0) return <span>—</span>;
    return (
      <ul className="space-y-0.5">
        {entries.slice(0, 5).map(([field, diff]) => (
          <li key={field} className="font-mono text-xs">
            <span className="font-semibold text-foreground">{field}:</span>{" "}
            <span className="text-destructive line-through">{formatValue(diff.old)}</span>{" "}
            → <span className="text-[hsl(var(--status-groen))]">{formatValue(diff.new)}</span>
          </li>
        ))}
        {entries.length > 5 && (
          <li className="text-xs text-muted-foreground">+ {entries.length - 5} meer</li>
        )}
      </ul>
    );
  }
  return <span>{row.details ?? "—"}</span>;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "string") return v.length > 60 ? v.slice(0, 60) + "…" : v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}