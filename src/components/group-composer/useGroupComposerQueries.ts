/**
 * Data-fetching hooks for GroupComposer.
 * All Supabase queries live here — the main component stays presentation-focused.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clientKeys, areaKeys, programKeys, staffKeys } from "@/lib/queryKeys";
import { buildPrefsByClientMap, buildAvailabilityByClient } from "@/lib/clientUtils";
import type { AreaRef, ClientAvailabilityRow, AreaPreferenceRow } from "@/lib/queryShapes";
import type { GroupComposerClient, TrainerRef, LinkableProgram } from "./types";

export function useGroupComposerQueries() {
  // Fetch waitlist clients
  const { data: waitlistClients = [] } = useQuery<GroupComposerClient[]>({
    queryKey: clientKeys.groupComposer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, waitlist_area_id, all_areas_flexible, intake_status, school_id, neighborhood_id, dob_estimated, neighborhoods:neighborhood_id(id, area_id, areas(id, name)), schools(id, name, neighborhood_id, neighborhoods(id, area_id, areas(id, name)))")
        .eq("archived", false)
        .in("intake_status", ["wachtlijst", "intake_afgerond"]);
      if (error) throw error;
      return (data ?? []) as unknown as GroupComposerClient[];
    },
  });

  // Fetch area preferences
  const { data: allPreferences = [] } = useQuery<AreaPreferenceRow[]>({
    queryKey: clientKeys.allAreaPreferences,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_area_preferences")
        .select("client_id, area_id, preference_order");
      if (error) throw error;
      return (data ?? []) as AreaPreferenceRow[];
    },
  });

  // Fetch areas
  const { data: areas = [] } = useQuery<AreaRef[]>({
    queryKey: areaKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as AreaRef[];
    },
  });

  // Fetch all client availability — paginated to avoid 1000-row limit
  const { data: allAvailability = [] } = useQuery<ClientAvailabilityRow[]>({
    queryKey: clientKeys.allAvailability,
    queryFn: async () => {
      const results: ClientAvailabilityRow[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("client_availability")
          .select("client_id, available_date, start_time, end_time")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (data) results.push(...(data as ClientAvailabilityRow[]));
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      return results;
    },
  });

  // Fetch program_clients for "al ingepland" check (AC-2)
  const { data: programClients = [] } = useQuery({
    queryKey: programKeys.clientsActive,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_clients")
        .select("client_id, programs!inner(archived)")
        .eq("programs.archived", false);
      if (error) throw error;
      return (data ?? []) as { client_id: string }[];
    },
  });

  const programClientIds = useMemo(
    () => new Set(programClients.map((pc) => pc.client_id)),
    [programClients]
  );

  // Fetch override logs
  const { data: overrideLogs = [] } = useQuery({
    queryKey: clientKeys.overrideLogs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_override_logs")
        .select("client_id")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as { client_id: string }[];
    },
  });

  const overriddenClientIds = useMemo(
    () => new Set(overrideLogs.map((o) => o.client_id)),
    [overrideLogs]
  );

  // Trainers
  const { data: allTrainers = [] } = useQuery<TrainerRef[]>({
    queryKey: staffKeys.trainers,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, name, trainer_type")
        .eq("archived", false)
        .not("name", "is", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as TrainerRef[];
    },
  });

  // Linkable programs
  const { data: linkablePrograms = [] } = useQuery<LinkableProgram[]>({
    queryKey: programKeys.linkable,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("id, name, area_id, age_category, status, training_number, areas(name)")
        .eq("archived", false)
        .order("training_number", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as LinkableProgram[];
    },
  });

  // Derived maps
  const prefsByClient = useMemo(() => buildPrefsByClientMap(allPreferences), [allPreferences]);
  const availByClient = useMemo(() => buildAvailabilityByClient(allAvailability), [allAvailability]);

  const areaMap = useMemo(() => {
    const m: Record<string, string> = {};
    areas.forEach((a) => { m[a.id] = a.name; });
    return m;
  }, [areas]);

  const areaIds = useMemo(() => new Set(areas.map((a) => a.id)), [areas]);

  return {
    waitlistClients,
    allPreferences,
    areas,
    allAvailability,
    programClientIds,
    overriddenClientIds,
    allTrainers,
    linkablePrograms,
    prefsByClient,
    availByClient,
    areaMap,
    areaIds,
  };
}
