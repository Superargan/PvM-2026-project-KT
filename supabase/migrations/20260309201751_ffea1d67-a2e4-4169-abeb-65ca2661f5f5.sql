
ALTER TABLE public.generated_documents ADD COLUMN program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL;
