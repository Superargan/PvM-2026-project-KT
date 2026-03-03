
-- Add location to program_sessions
ALTER TABLE public.program_sessions ADD COLUMN location text;

-- Create session_documents table
CREATE TABLE public.session_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.program_sessions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.session_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backoffice manages session_documents" ON public.session_documents
  FOR ALL USING (is_backoffice()) WITH CHECK (is_backoffice());

CREATE POLICY "Trainers read session_documents" ON public.session_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM program_sessions ps
      WHERE ps.id = session_documents.session_id
        AND is_trainer_for_program(ps.program_id)
    )
  );

CREATE POLICY "Trainers insert session_documents" ON public.session_documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM program_sessions ps
      WHERE ps.id = session_documents.session_id
        AND is_trainer_for_program(ps.program_id)
    )
  );

-- Storage bucket for session documents
INSERT INTO storage.buckets (id, name, public) VALUES ('session-documents', 'session-documents', false);

CREATE POLICY "Staff upload session docs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'session-documents' AND (is_backoffice() OR is_trainer()));

CREATE POLICY "Staff read session docs" ON storage.objects
  FOR SELECT USING (bucket_id = 'session-documents' AND (is_backoffice() OR is_trainer()));

CREATE POLICY "Backoffice delete session docs" ON storage.objects
  FOR DELETE USING (bucket_id = 'session-documents' AND is_backoffice());
