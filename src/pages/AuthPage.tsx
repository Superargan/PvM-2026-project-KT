import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Vul je e-mailadres in");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      setResetSent(true);
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

          <h2 className="font-display text-2xl font-extrabold text-foreground">
            {forgotMode ? "Wachtwoord vergeten" : "Inloggen"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {forgotMode
              ? "Voer je e-mailadres in om een resetlink te ontvangen."
              : "Welkom terug! Log in met je gegevens."}
          </p>

          {resetSent ? (
            <div className="mt-6 rounded-lg border border-border bg-card p-6 text-center space-y-3">
              <p className="text-sm text-foreground font-medium">Resetlink verzonden!</p>
              <p className="text-sm text-muted-foreground">
                Controleer je inbox voor een link om je wachtwoord te resetten.
              </p>
              <button
                onClick={() => { setForgotMode(false); setResetSent(false); }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Terug naar inloggen
              </button>
            </div>
          ) : forgotMode ? (
            <form onSubmit={handleForgotPassword} className="mt-6 space-y-4">
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
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Even geduld..." : "Resetlink versturen"}
              </button>
              <button
                type="button"
                onClick={() => setForgotMode(false)}
                className="w-full text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Terug naar inloggen
              </button>
            </form>
          ) : (
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
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">Wachtwoord</label>
                  <button
                    type="button"
                    onClick={() => setForgotMode(true)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Wachtwoord vergeten?
                  </button>
                </div>
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
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Geen account? Neem contact op met een beheerder voor een uitnodiging.
          </p>
        </div>
      </div>
    </div>
  );
}
