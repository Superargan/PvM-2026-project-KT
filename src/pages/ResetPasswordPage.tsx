import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Also check hash for recovery type
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Wachtwoorden komen niet overeen");
      return;
    }
    if (password.length < 6) {
      toast.error("Wachtwoord moet minimaal 6 tekens zijn");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Wachtwoord succesvol gewijzigd!");
      navigate("/");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary font-display text-lg font-black text-primary-foreground">
            K
          </div>
          <h2 className="mt-4 font-display text-2xl font-extrabold text-foreground">Nieuw wachtwoord instellen</h2>
          <p className="mt-1 text-sm text-muted-foreground">Voer je nieuwe wachtwoord in.</p>
        </div>

        {!ready ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Deze pagina is alleen toegankelijk via de link in je e-mail. Vraag een nieuwe resetlink aan via de loginpagina.
            </p>
            <Button variant="outline" onClick={() => navigate("/login")}>Naar inloggen</Button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Nieuw wachtwoord</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="Minimaal 6 tekens" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Bevestig wachtwoord</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} placeholder="Herhaal wachtwoord" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Bezig..." : "Wachtwoord wijzigen"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
