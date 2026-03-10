ALTER TABLE public.clients ADD COLUMN registration_date date DEFAULT CURRENT_DATE;

-- Backfill existing rows: use created_at as registration_date
UPDATE public.clients SET registration_date = created_at::date WHERE registration_date IS NULL;