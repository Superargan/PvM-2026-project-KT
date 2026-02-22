
-- Add website_url to schools
ALTER TABLE public.schools ADD COLUMN website_url text;

-- Create school_documents table
CREATE TABLE public.school_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'overig',
  file_name text NOT NULL,
  file_path text NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.school_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read school_documents" ON public.school_documents
  FOR SELECT USING (is_backoffice() OR is_trainer());

CREATE POLICY "Backoffice manages school_documents" ON public.school_documents
  FOR INSERT WITH CHECK (is_backoffice());

CREATE POLICY "Backoffice updates school_documents" ON public.school_documents
  FOR UPDATE USING (is_backoffice());

CREATE POLICY "Backoffice deletes school_documents" ON public.school_documents
  FOR DELETE USING (is_backoffice());

CREATE TRIGGER update_school_documents_updated_at
  BEFORE UPDATE ON public.school_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for school documents
INSERT INTO storage.buckets (id, name, public) VALUES ('school-documents', 'school-documents', false);

CREATE POLICY "Staff can view school documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'school-documents' AND (is_backoffice() OR is_trainer()));

CREATE POLICY "Backoffice can upload school documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'school-documents' AND is_backoffice());

CREATE POLICY "Backoffice can delete school documents" ON storage.objects
  FOR DELETE USING (bucket_id = 'school-documents' AND is_backoffice());
