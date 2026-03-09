
-- Add signed PDF columns to generated_documents
ALTER TABLE public.generated_documents 
  ADD COLUMN signed_file_path text,
  ADD COLUMN signed_file_name text,
  ADD COLUMN signed_at timestamp with time zone;

-- Allow backoffice to update generated_documents (for uploading signed versions)
CREATE POLICY "Backoffice updates generated_documents"
  ON public.generated_documents
  FOR UPDATE
  TO public
  USING (is_backoffice())
  WITH CHECK (is_backoffice());

-- Storage RLS: allow authenticated to upload to generated-documents bucket
CREATE POLICY "Backoffice uploads to generated-documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'generated-documents' AND is_backoffice());

CREATE POLICY "Backoffice reads generated-documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'generated-documents' AND (is_backoffice() OR is_trainer()));

CREATE POLICY "Backoffice deletes generated-documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'generated-documents' AND is_backoffice());
