ALTER TABLE public.programs ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.staff ADD COLUMN archived boolean NOT NULL DEFAULT false;