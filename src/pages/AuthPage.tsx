import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welkom terug!");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Er is iets misgegaan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left panel */}
      <div className="hidden w-1/2 flex-col justify-between bg-sidebar p-10 lg:flex">
        <div className="kanjer-gradient-bar h-1 w-full rounded-full" />
        <div>
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-sidebar-primary font-display text-2xl font-black text-sidebar-primary-foreground">
            K
          </div>
          <h1 className="mt-6 font-display text-3xl font-extrabold text-sidebar-primary">
            Kanjertraining OS
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-sidebar-foreground/70">
            Het complete operatiesysteem voor het beheren van cliënten, trainingen, scholen en medewerkers.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/40">
          © 2026 Kanjertraining · Data opgeslagen in EU (Frankfurt)
        </p>
      </div>

      {/* Right panel - form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary font-display text-lg font-black text-primary-foreground">
              K
            </div>
            <h1 className="mt-3 font-display text-xl font-extrabold text-foreground">
              Kanjertraining OS
            </h1>
          </div>

          <h2 className="font-display text-2xl font-extrabold text-foreground">Inloggen</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Welkom terug! Log in met je gegevens.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">E-mailadres</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="naam@kanjertraining.nl"
                className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Wachtwoord</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Even geduld..." : "Inloggen"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Geen account? Neem contact op met een beheerder voor een uitnodiging.
          </p>
        </div>
      </div>
    </div>
  );
}
