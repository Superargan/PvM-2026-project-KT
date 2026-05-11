import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CallButtonProps {
  phone?: string | null;
  className?: string;
}

export default function CallButton({ phone, className }: CallButtonProps) {
  const normalized = (phone ?? "").replace(/[^\d+]/g, "");
  const disabled = normalized.length < 4;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={disabled}
      asChild={!disabled}
      title={disabled ? "Geen telefoonnummer" : `Bel ${phone}`}
      className={className}
    >
      {disabled ? (
        <Phone className="h-4 w-4" />
      ) : (
        <a href={`tel:${normalized}`} aria-label={`Bel ${phone}`}>
          <Phone className="h-4 w-4" />
        </a>
      )}
    </Button>
  );
}