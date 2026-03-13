import { Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { statusLabels } from "@/lib/clientUtils";

interface ClientFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  filterArea: string;
  onFilterAreaChange: (v: string) => void;
  filterSchool: string;
  onFilterSchoolChange: (v: string) => void;
  filterAge: string;
  onFilterAgeChange: (v: string) => void;
  filterStatus: string;
  onFilterStatusChange: (v: string) => void;
  areas: { id: string; name: string }[];
  schools: { id: string; name: string }[];
  /** Which statuses to show in the filter. Defaults to all. */
  availableStatuses?: string[];
  totalCount: number;
  filteredCount: number;
}

export default function ClientFilters({
  search, onSearchChange,
  filterArea, onFilterAreaChange,
  filterSchool, onFilterSchoolChange,
  filterAge, onFilterAgeChange,
  filterStatus, onFilterStatusChange,
  areas, schools,
  availableStatuses,
  totalCount, filteredCount,
}: ClientFiltersProps) {
  const hasFilters = filterArea !== "all" || filterSchool !== "all" || filterAge !== "all" || filterStatus !== "all" || search.trim() !== "";

  const statusEntries = availableStatuses
    ? availableStatuses.map((k) => [k, statusLabels[k] ?? k] as [string, string])
    : Object.entries(statusLabels);

  const clearAll = () => {
    onFilterAreaChange("all");
    onFilterSchoolChange("all");
    onFilterAgeChange("all");
    onFilterStatusChange("all");
    onSearchChange("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Zoek op naam..."
            className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-4 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Select value={filterArea} onValueChange={onFilterAreaChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Gebied" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Alle gebieden</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSchool} onValueChange={onFilterSchoolChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="School" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Alle scholen</SelectItem>
            <SelectItem value="none">Geen school</SelectItem>
            {schools.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAge} onValueChange={onFilterAgeChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Leeftijd" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Alle leeftijden</SelectItem>
            <SelectItem value="4-7">4-7 jaar</SelectItem>
            <SelectItem value="8-12">8-12 jaar</SelectItem>
            <SelectItem value="other">Overig</SelectItem>
            <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Exacte leeftijd</div>
            {Array.from({ length: 14 }, (_, i) => i + 2).map((age) => (
              <SelectItem key={age} value={`exact-${age}`}>{age} jaar</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={onFilterStatusChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Alle statussen</SelectItem>
            {statusEntries.map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="h-3.5 w-3.5 mr-1" /> Wis filters
          </Button>
        )}
      </div>
      {hasFilters && (
        <p className="text-xs text-muted-foreground">
          {filteredCount} van {totalCount} resultaten
        </p>
      )}
    </div>
  );
}
