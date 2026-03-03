
-- Sessies per programma
CREATE TABLE public.program_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  session_number integer NOT NULL,
  session_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(program_id, session_number)
);

ALTER TABLE public.program_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read program_sessions" ON public.program_sessions
  FOR SELECT USING (is_backoffice() OR is_trainer_for_program(program_id));

CREATE POLICY "Backoffice manages program_sessions" ON public.program_sessions
  FOR INSERT WITH CHECK (is_backoffice());

CREATE POLICY "Backoffice updates program_sessions" ON public.program_sessions
  FOR UPDATE USING (is_backoffice());

CREATE POLICY "Backoffice deletes program_sessions" ON public.program_sessions
  FOR DELETE USING (is_backoffice());

-- Trainers mogen ook sessies beheren voor hun programma's
CREATE POLICY "Trainers manage own program_sessions" ON public.program_sessions
  FOR INSERT WITH CHECK (is_trainer_for_program(program_id));

CREATE POLICY "Trainers update own program_sessions" ON public.program_sessions
  FOR UPDATE USING (is_trainer_for_program(program_id));

-- Presentie per sessie per deelnemer
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.program_sessions(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  present boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, client_id)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- RLS via session -> program
CREATE POLICY "Staff read attendance" ON public.attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.program_sessions ps
      WHERE ps.id = session_id
        AND (is_backoffice() OR is_trainer_for_program(ps.program_id))
    )
  );

CREATE POLICY "Backoffice manages attendance" ON public.attendance
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.program_sessions ps
      WHERE ps.id = session_id AND is_backoffice()
    )
  );

CREATE POLICY "Trainers manage attendance" ON public.attendance
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.program_sessions ps
      WHERE ps.id = session_id AND is_trainer_for_program(ps.program_id)
    )
  );

CREATE POLICY "Backoffice updates attendance" ON public.attendance
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.program_sessions ps
      WHERE ps.id = session_id AND is_backoffice()
    )
  );

CREATE POLICY "Trainers update attendance" ON public.attendance
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.program_sessions ps
      WHERE ps.id = session_id AND is_trainer_for_program(ps.program_id)
    )
  );

CREATE POLICY "Backoffice deletes attendance" ON public.attendance
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.program_sessions ps
      WHERE ps.id = session_id AND is_backoffice()
    )
  );
