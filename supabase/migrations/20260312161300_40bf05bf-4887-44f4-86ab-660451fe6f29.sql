
-- Remove duplicate client_availability records, keeping the newest one per (client_id, available_date)
DELETE FROM public.client_availability
WHERE id NOT IN (
  SELECT DISTINCT ON (client_id, available_date) id
  FROM public.client_availability
  ORDER BY client_id, available_date, created_at DESC
);
