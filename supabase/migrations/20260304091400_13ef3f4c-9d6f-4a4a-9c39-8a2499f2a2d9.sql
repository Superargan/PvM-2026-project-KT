
-- Drop the overly strict unique constraint
ALTER TABLE public.program_staff DROP CONSTRAINT program_staff_program_id_staff_id_key;

-- Add a new unique constraint that allows the same staff on different sessions
-- For main trainers (session_id IS NULL), the combo program_id + staff_id must be unique
-- For invallers (session_id IS NOT NULL), program_id + staff_id + session_id must be unique
CREATE UNIQUE INDEX program_staff_trainer_unique 
ON public.program_staff (program_id, staff_id) 
WHERE session_id IS NULL;

CREATE UNIQUE INDEX program_staff_invaller_unique 
ON public.program_staff (program_id, staff_id, session_id) 
WHERE session_id IS NOT NULL;
