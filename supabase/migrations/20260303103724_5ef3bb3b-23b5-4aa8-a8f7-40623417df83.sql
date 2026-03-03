
-- Make client_id nullable so documents can be generated for trainers and schools too
ALTER TABLE public.generated_documents ALTER COLUMN client_id DROP NOT NULL;

-- Add staff_id and school_id columns
ALTER TABLE public.generated_documents ADD COLUMN staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE;
ALTER TABLE public.generated_documents ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

-- Add constraint: at least one entity must be set
ALTER TABLE public.generated_documents ADD CONSTRAINT generated_documents_entity_check
  CHECK (client_id IS NOT NULL OR staff_id IS NOT NULL OR school_id IS NOT NULL);

-- RLS policies for staff and school documents
CREATE POLICY "Backoffice manages staff generated_documents"
  ON public.generated_documents FOR INSERT
  WITH CHECK (is_backoffice());

CREATE POLICY "Staff read staff generated_documents"
  ON public.generated_documents FOR SELECT
  USING (is_backoffice() OR (staff_id IS NOT NULL AND is_trainer()));
