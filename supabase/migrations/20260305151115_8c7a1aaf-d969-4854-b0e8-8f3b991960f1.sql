
-- Add trainer_type to staff (oudertrainer / kindtrainer / beide)
ALTER TABLE public.staff ADD COLUMN trainer_type text DEFAULT NULL;

-- Staff availability table for scheduling
CREATE TABLE public.staff_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  available_date date NOT NULL,
  start_time time DEFAULT '09:00',
  end_time time DEFAULT '17:00',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, available_date)
);

ALTER TABLE public.staff_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backoffice manages staff_availability" ON public.staff_availability
  FOR ALL TO authenticated
  USING (is_backoffice())
  WITH CHECK (is_backoffice());

CREATE POLICY "Trainers manage own availability" ON public.staff_availability
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staff s 
    WHERE s.id = staff_availability.staff_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.staff s 
    WHERE s.id = staff_availability.staff_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Staff read all availability" ON public.staff_availability
  FOR SELECT TO authenticated
  USING (is_backoffice() OR is_trainer());
