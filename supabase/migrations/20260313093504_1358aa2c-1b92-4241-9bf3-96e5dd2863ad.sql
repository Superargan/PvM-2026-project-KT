
-- 1. Create training_locations table
CREATE TABLE public.training_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  postal_code text,
  city text,
  neighborhood_id uuid REFERENCES public.neighborhoods(id),
  area_id uuid REFERENCES public.areas(id),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.training_locations ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies (same pattern as schools)
CREATE POLICY "Staff read training_locations" ON public.training_locations
  FOR SELECT TO authenticated
  USING (is_backoffice() OR is_trainer());

CREATE POLICY "Backoffice manages training_locations" ON public.training_locations
  FOR INSERT TO authenticated
  WITH CHECK (is_backoffice());

CREATE POLICY "Backoffice updates training_locations" ON public.training_locations
  FOR UPDATE TO authenticated
  USING (is_backoffice());

CREATE POLICY "Backoffice deletes training_locations" ON public.training_locations
  FOR DELETE TO authenticated
  USING (is_backoffice());

-- 4. Add training_location_id to programs
ALTER TABLE public.programs
  ADD COLUMN training_location_id uuid REFERENCES public.training_locations(id);

-- 5. Add school_id and training_location_id to simulation_scenario_slots
ALTER TABLE public.simulation_scenario_slots
  ADD COLUMN school_id uuid REFERENCES public.schools(id),
  ADD COLUMN training_location_id uuid REFERENCES public.training_locations(id);

-- 6. Updated_at trigger for training_locations
CREATE TRIGGER update_training_locations_updated_at
  BEFORE UPDATE ON public.training_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
