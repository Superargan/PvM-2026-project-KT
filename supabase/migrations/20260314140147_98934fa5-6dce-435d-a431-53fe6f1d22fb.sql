-- Fix search_path on validate_school_times function
CREATE OR REPLACE FUNCTION public.validate_school_times()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
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