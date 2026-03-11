ALTER TABLE public.program_sessions
  ADD COLUMN start_time time without time zone DEFAULT NULL,
  ADD COLUMN end_time time without time zone DEFAULT NULL;