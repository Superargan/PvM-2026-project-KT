-- Add school time columns
ALTER TABLE public.schools
  ADD COLUMN school_start_time time without time zone,
  ADD COLUMN school_end_time time without time zone;

-- Validation trigger (preferred over CHECK constraint per project conventions)
CREATE OR REPLACE FUNCTION public.validate_school_times()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.school_start_time IS NULL) != (NEW.school_end_time IS NULL) THEN
    RAISE EXCEPTION 'Begin- en eindtijd moeten beide ingevuld zijn of beide leeg.';
  END IF;
  IF NEW.school_start_time IS NOT NULL AND NEW.school_start_time >= NEW.school_end_time THEN
    RAISE EXCEPTION 'Eindtijd moet later zijn dan begintijd.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_school_times
  BEFORE INSERT OR UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.validate_school_times();