
ALTER TABLE public.program_staff 
  ADD COLUMN session_id uuid REFERENCES public.program_sessions(id) ON DELETE SET NULL,
  ADD COLUMN replaces_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;
