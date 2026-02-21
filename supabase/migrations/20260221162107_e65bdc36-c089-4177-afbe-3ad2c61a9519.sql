ALTER TABLE public.programs
  ADD COLUMN area_id UUID REFERENCES public.areas(id),
  ADD COLUMN neighborhood_id UUID REFERENCES public.neighborhoods(id);