import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { session, loading, signOut };
}

/**
 * Returns whether the currently signed-in user has the backoffice role.
 * Uses the server-side has_role() SECURITY DEFINER function so RLS on
 * user_roles cannot leak or misreport.
 */
export function useIsBackoffice() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { data, isLoading } = useQuery({
    queryKey: ["auth", "is-backoffice", userId],
    queryFn: async () => {
      if (!userId) return false;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "backoffice",
      });
      if (error) throw error;
      return Boolean(data);
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
  return { isBackoffice: data ?? false, isLoading };
}
