import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface SaveScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeScenarioId?: string | null;
  scenarioName: string;
  onScenarioNameChange: (value: string) => void;
  scenarioDescription: string;
  onScenarioDescriptionChange: (value: string) => void;
  scenarioStatus: string;
  onScenarioStatusChange: (value: string) => void;
  saving: boolean;
  onSave: () => void;
}

export function SaveScenarioDialog({
  open,
  onOpenChange,
  activeScenarioId,
  scenarioName,
  onScenarioNameChange,
  scenarioDescription,
  onScenarioDescriptionChange,
  scenarioStatus,
  onScenarioStatusChange,
  saving,
  onSave,
}: SaveScenarioDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{activeScenarioId ? "Proforma planning bijwerken" : "Opslaan als proforma planning"}</DialogTitle>
          <DialogDescription>Geef de proforma planning een naam en optioneel een beschrijving.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Naam *</Label>
            <Input value={scenarioName} onChange={(e) => onScenarioNameChange(e.target.value)} placeholder="bijv. Kralingen 4-7 Q2" />
          </div>
          <div>
            <Label>Beschrijving</Label>
            <Textarea value={scenarioDescription} onChange={(e) => onScenarioDescriptionChange(e.target.value)} placeholder="Optionele toelichting..." rows={2} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={scenarioStatus} onValueChange={onScenarioStatusChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="concept">Proforma concept</SelectItem>
                <SelectItem value="vastgezet">Proforma vastgezet</SelectItem>
                <SelectItem value="in_uitwerking">Proforma in uitwerking</SelectItem>
                <SelectItem value="gecontroleerd">Proforma gecontroleerd</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}