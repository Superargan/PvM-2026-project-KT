import { Pencil } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { calculateAge, getAgeGroup, getResolvedAreaName, statusLabels, statusStyles } from "@/lib/clientUtils";

interface ClientListTableProps {
  clients: any[];
  onNavigate: (id: string) => void;
  onEdit?: (client: any) => void;
  /** Map of client_id → assigned staff names */
  assignmentsByClient?: Record<string, string[]>;
  /** Areas list for resolving area names */
  areas?: { id: string; name: string }[];
  showAssigned?: boolean;
  showCheckbox?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
  /** Extra column rendered after status */
  renderActions?: (client: any) => React.ReactNode;
  emptyMessage?: string;
  /** Show training column with program_clients data (definitieve programma's only) */
  showTraining?: boolean;
}

export default function ClientListTable({
  clients,
  onNavigate,
  onEdit,
  assignmentsByClient,
  areas,
  showAssigned,
  showCheckbox,
  selected,
  onToggleSelect,
  onToggleAll,
  renderActions,
  emptyMessage = "Geen resultaten gevonden",
  showTraining,
}: ClientListTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {showCheckbox && (
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    checked={selected?.size === clients.length && clients.length > 0}
                    onCheckedChange={() => onToggleAll?.()}
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Naam</th>
              <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">Leeftijd</th>
              <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">School</th>
              <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Gebied</th>
              {showTraining && (
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Training</th>
              )}
              <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Contact</th>
              <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Aanmelddatum</th>
              {showAssigned && (
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">Toegewezen</th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actie</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.length === 0 && (
              <tr>
                <td colSpan={99} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {clients.map((client: any) => {
              const status = client.intake_status ?? "nieuw";
              const age = calculateAge(client.date_of_birth);
              const ageGroup = getAgeGroup(client.date_of_birth);
              const assigned = assignmentsByClient?.[client.id] ?? [];
              const isStopped = status === "tussentijds_gestopt";

              return (
                <tr
                  key={client.id}
                  className={`transition-colors hover:bg-muted/30 ${isStopped ? "opacity-60 line-through" : ""} ${showCheckbox && selected?.has(client.id) ? "bg-muted/50" : ""}`}
                >
                  {showCheckbox && (
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selected?.has(client.id)}
                        onCheckedChange={() => onToggleSelect?.(client.id)}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <p
                      className="text-sm font-semibold text-primary hover:underline cursor-pointer no-underline"
                      style={{ textDecoration: "none" }}
                      onClick={() => onNavigate(client.id)}
                    >
                      {client.first_name} {client.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground sm:hidden">
                      {age !== null ? `${age} jaar` : "—"}
                    </p>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <Badge variant="outline" className="text-xs">{ageGroup}</Badge>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className="text-sm text-card-foreground">{client.schools?.name ?? "—"}</span>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className="text-sm text-card-foreground">{getResolvedAreaName(client, areas) || "—"}</span>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <span className="text-sm text-card-foreground">{client.guardian_phone ?? client.guardian_name ?? "—"}</span>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {client.registration_date
                        ? format(new Date(client.registration_date), "d MMM yyyy", { locale: nl })
                        : "—"}
                    </span>
                  </td>
                  {showAssigned && (
                    <td className="hidden px-4 py-3 xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {assigned.length > 0
                          ? assigned.map((name, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{name}</Badge>
                            ))
                          : <span className="text-xs text-muted-foreground">—</span>
                        }
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className={`status-indicator ${statusStyles[status] ?? "status-rood"}`}>
                      {statusLabels[status] ?? status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {renderActions ? (
                      renderActions(client)
                    ) : onEdit ? (
                      <Button size="sm" variant="ghost" onClick={() => onEdit(client)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
