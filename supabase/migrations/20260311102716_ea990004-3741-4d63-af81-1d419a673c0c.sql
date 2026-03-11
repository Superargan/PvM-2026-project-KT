
-- 1. Add status column to program_sessions
ALTER TABLE public.program_sessions 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'beschikbaar';

-- 2. Add min_participants to programs
ALTER TABLE public.programs 
  ADD COLUMN IF NOT EXISTS min_participants integer DEFAULT 6;

-- 3. Create session_override_logs table
CREATE TABLE IF NOT EXISTS public.session_override_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.program_sessions(id) ON DELETE CASCADE,
  overridden_by uuid NOT NULL,
  override_type text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_override_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backoffice manages override logs"
  ON public.session_override_logs FOR ALL
  TO authenticated
  USING (is_backoffice())
  WITH CHECK (is_backoffice());
