
-- Stap 1a: neighborhood_id op clients + backfill
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS neighborhood_id uuid REFERENCES public.neighborhoods(id);

UPDATE public.clients c SET neighborhood_id = s.neighborhood_id
FROM public.schools s WHERE c.school_id = s.id AND c.neighborhood_id IS NULL AND s.neighborhood_id IS NOT NULL;

-- Stap 1b: admin rol
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
