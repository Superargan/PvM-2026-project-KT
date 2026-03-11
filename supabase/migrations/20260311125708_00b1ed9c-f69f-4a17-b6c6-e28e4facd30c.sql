UPDATE public.clients c
SET waitlist_area_id = n.area_id
FROM public.schools s
JOIN public.neighborhoods n ON s.neighborhood_id = n.id
WHERE c.school_id = s.id
  AND c.waitlist_area_id IS NULL
  AND s.neighborhood_id IS NOT NULL;