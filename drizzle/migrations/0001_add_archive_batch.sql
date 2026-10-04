ALTER TABLE public.clients ADD COLUMN archive_batch text;
ALTER TABLE public.programs ADD COLUMN archive_batch text;
COMMENT ON COLUMN public.clients.archive_batch IS 'Label of bulk archive batch, e.g. testfase';
COMMENT ON COLUMN public.programs.archive_batch IS 'Label of bulk archive batch, e.g. testfase';