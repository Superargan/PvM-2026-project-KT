
-- New table for reserve area preferences (up to 3 per client)
CREATE TABLE public.client_area_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  preference_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, area_id)
);

ALTER TABLE public.client_area_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Backoffice manages client_area_preferences" ON public.client_area_preferences
  FOR ALL TO authenticated USING (is_backoffice()) WITH CHECK (is_backoffice());

CREATE POLICY "Trainers read client_area_preferences" ON public.client_area_preferences
  FOR SELECT TO authenticated USING (is_trainer());

-- Add all_areas_flexible to clients
ALTER TABLE public.clients ADD COLUMN all_areas_flexible boolean NOT NULL DEFAULT false;
