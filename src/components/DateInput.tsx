import * as React from "react";
import { Input } from "@/components/ui/input";

interface DateInputProps {
  value: string;
  onChange: (isoDate: string) => void;
  max?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Parses pasted date strings in common Dutch formats (dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy)
 * and converts to yyyy-mm-dd for the native date input.
 */
function parsePastedDate(text: string): string | null {
  const trimmed = text.trim();

  // dd-mm-yyyy or dd/mm/yyyy or dd.mm.yyyy
  const match = trimmed.match(/^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3];
    const iso = `${year}-${month}-${day}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime()) && d.getFullYear() === +year) return iso;
  }

  // yyyy-mm-dd (already ISO)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const iso = `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return iso;
  }

  return null;
}

export function DateInput({ value, onChange, max, placeholder, className }: DateInputProps) {
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    const parsed = parsePastedDate(pasted);
    if (parsed) {
      e.preventDefault();
      onChange(parsed);
    }
  };

  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={handlePaste}
      max={max}
      placeholder={placeholder}
      className={className}
    />
  );
}
