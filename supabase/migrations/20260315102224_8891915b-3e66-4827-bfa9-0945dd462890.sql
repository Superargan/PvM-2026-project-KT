
-- Add break time columns to schools for traditional schedule support
-- Traditional schedules have: morning (start → break_start), break (break_start → break_end), afternoon (break_end → end)
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS break_start_time time without time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS break_end_time time without time zone DEFAULT NULL;

-- Add validation trigger for break times
CREATE OR REPLACE FUNCTION public.validate_school_break_times()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Break times must come as a pair (both or neither)
  IF (NEW.break_start_time IS NOT NULL AND NEW.break_end_time IS NULL)
     OR (NEW.break_start_time IS NULL AND NEW.break_end_time IS NOT NULL) THEN
    RAISE EXCEPTION 'Pauze begin- en eindtijd moeten beide ingevuld zijn of beide leeg.';
  END IF;

  -- Break end must be after break start
  IF NEW.break_start_time IS NOT NULL AND NEW.break_end_time IS NOT NULL
     AND NEW.break_end_time <= NEW.break_start_time THEN
    RAISE EXCEPTION 'Pauze eindtijd moet later zijn dan pauze begintijd.';
  END IF;

  -- Break must fall within school time range (if school times are set)
  IF NEW.break_start_time IS NOT NULL AND NEW.school_start_time IS NOT NULL THEN
    IF NEW.break_start_time <= NEW.school_start_time THEN
      RAISE EXCEPTION 'Pauze begintijd moet na schooltijd begin liggen.';
    END IF;
  END IF;

  IF NEW.break_end_time IS NOT NULL AND NEW.school_end_time IS NOT NULL THEN
    IF NEW.break_end_time >= NEW.school_end_time THEN
      RAISE EXCEPTION 'Pauze eindtijd moet voor schooltijd einde liggen.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_school_break_times
  BEFORE INSERT OR UPDATE ON public.schools
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_school_break_times();
