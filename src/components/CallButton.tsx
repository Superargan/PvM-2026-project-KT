import { Phone, Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";

interface CallButtonProps {
  phone?: string | null;
  className?: string;
}

export default function CallButton({ phone, className }: CallButtonProps) {
  const normalized = (phone ?? "").replace(/[^\d+]/g, "");
  const disabled = normalized.length < 4;

  // WhatsApp wil cijfers zonder + en zonder leading 0 voor NL
  const waNumber = (() => {
    let n = normalized.replace(/^\+/, "");
    if (n.startsWith("00")) n = n.slice(2);
    else if (n.startsWith("0")) n = "31" + n.slice(1);
    return n;
  })();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(phone ?? "");
      toast({ title: "Gekopieerd", description: phone ?? "" });
    } catch {
      toast({ title: "Kopiëren mislukt", variant: "destructive" });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          title={disabled ? "Geen telefoonnummer" : `Acties voor ${phone}`}
          className={className}
        >
          <Phone className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleCopy}>
          <Copy className="h-4 w-4 mr-2" />
          Nummer kopiëren
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={`https://wa.me/${waNumber}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            WhatsApp openen
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}