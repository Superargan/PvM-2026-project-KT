
-- Add KVK uittreksel and VOG tracking columns to staff
ALTER TABLE public.staff
  ADD COLUMN kvk_uittreksel_path text,
  ADD COLUMN kvk_uittreksel_uploaded_at timestamp with time zone,
  ADD COLUMN vog_path text,
  ADD COLUMN vog_uploaded_at timestamp with time zone;

-- Create storage bucket for trainer documents
INSERT INTO storage.buckets (id, name, public) VALUES ('trainer-documents', 'trainer-documents', false);

-- Storage policies for trainer-documents bucket
CREATE POLICY "Backoffice manages trainer documents"
ON storage.objects FOR ALL
USING (bucket_id = 'trainer-documents' AND is_backoffice())
WITH CHECK (bucket_id = 'trainer-documents' AND is_backoffice());

CREATE POLICY "Trainers read own trainer documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'trainer-documents' AND is_trainer());
