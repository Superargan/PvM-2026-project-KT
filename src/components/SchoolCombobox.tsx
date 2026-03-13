import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SchoolComboboxProps {
  schools: { id: string; name: string }[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** Show a "Geen school" option that passes this value (e.g. "geen" or "") */
  emptyOption?: { value: string; label: string };
  className?: string;
  triggerClassName?: string;
}

export default function SchoolCombobox({
  schools,
  value,
  onValueChange,
  placeholder = "Selecteer school",
  emptyOption,
  className,
  triggerClassName,
}: SchoolComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedLabel = useMemo(() => {
    if (emptyOption && value === emptyOption.value) return emptyOption.label;
    const school = schools.find((s) => s.id === value);
    return school?.name ?? null;
  }, [value, schools, emptyOption]);

  // Tokenized boolean search: all terms must match somewhere in the name
  const filtered = useMemo(() => {
    if (!search.trim()) return schools;
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return schools.filter((s) => {
      const name = s.name.toLowerCase();
      return terms.every((t) => name.includes(t));
    });
  }, [schools, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !selectedLabel && "text-muted-foreground",
            triggerClassName
          )}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[--radix-popover-trigger-width] p-0", className)} align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Zoek school..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>Geen school gevonden.</CommandEmpty>
            <CommandGroup>
              {emptyOption && (
                <CommandItem
                  value={emptyOption.value}
                  onSelect={() => {
                    onValueChange(emptyOption.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === emptyOption.value ? "opacity-100" : "opacity-0")} />
                  {emptyOption.label}
                </CommandItem>
              )}
              {filtered.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onSelect={() => {
                    onValueChange(s.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === s.id ? "opacity-100" : "opacity-0")} />
                  {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
