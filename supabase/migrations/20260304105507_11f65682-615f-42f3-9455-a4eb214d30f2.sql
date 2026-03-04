
-- 1. Waitlist fields on clients
ALTER TABLE public.clients 
  ADD COLUMN IF NOT EXISTS waitlist_status text,
  ADD COLUMN IF NOT EXISTS waitlist_area_id uuid REFERENCES public.areas(id),
  ADD COLUMN IF NOT EXISTS dropout_reason text,
  ADD COLUMN IF NOT EXISTS dropout_action text;

-- 2. Monitoring fields on program_clients
ALTER TABLE public.program_clients
  ADD COLUMN IF NOT EXISTS started boolean DEFAULT null,
  ADD COLUMN IF NOT EXISTS reason_not_started text,
  ADD COLUMN IF NOT EXISTS action_not_started text,
  ADD COLUMN IF NOT EXISTS parent_participants integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sessions_attended integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS successfully_completed boolean DEFAULT null,
  ADD COLUMN IF NOT EXISTS early_dropout boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dropout_reason text,
  ADD COLUMN IF NOT EXISTS dropout_action text,
  ADD COLUMN IF NOT EXISTS referred_to text,
  ADD COLUMN IF NOT EXISTS follow_up_program text,
  ADD COLUMN IF NOT EXISTS kanvas_parent_pre numeric,
  ADD COLUMN IF NOT EXISTS kanvas_child_pre numeric,
  ADD COLUMN IF NOT EXISTS kanvas_parent_post numeric,
  ADD COLUMN IF NOT EXISTS kanvas_child_post numeric,
  ADD COLUMN IF NOT EXISTS evaluation_filled_parent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS satisfaction_parent numeric,
  ADD COLUMN IF NOT EXISTS satisfaction_child numeric;

-- 3. Invoices table
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  amount numeric,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS for invoices: backoffice full access, trainers see own
CREATE POLICY "Backoffice manages invoices" ON public.invoices FOR ALL
  USING (is_backoffice()) WITH CHECK (is_backoffice());

CREATE POLICY "Trainers read own invoices" ON public.invoices FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = invoices.staff_id AND s.user_id = auth.uid()));

CREATE POLICY "Trainers insert own invoices" ON public.invoices FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = invoices.staff_id AND s.user_id = auth.uid()));

-- Update trigger for invoices
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Create invoices storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', false) ON CONFLICT DO NOTHING;

-- Storage policies for invoices bucket
CREATE POLICY "Backoffice manages invoice files" ON storage.objects FOR ALL
  USING (bucket_id = 'invoices' AND (SELECT is_backoffice())) 
  WITH CHECK (bucket_id = 'invoices' AND (SELECT is_backoffice()));

CREATE POLICY "Trainers upload invoice files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoices' AND (SELECT is_trainer()));

CREATE POLICY "Trainers read own invoice files" ON storage.objects FOR SELECT
  USING (bucket_id = 'invoices' AND (SELECT is_trainer()));
