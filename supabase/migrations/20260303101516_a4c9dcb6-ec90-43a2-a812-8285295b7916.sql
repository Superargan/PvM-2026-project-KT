
-- Fase 3A: Document templates tabel
CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  file_path text NOT NULL,
  category text NOT NULL DEFAULT 'overig',
  placeholder_fields text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read document_templates"
  ON public.document_templates FOR SELECT
  USING (is_backoffice() OR is_trainer());

CREATE POLICY "Backoffice manages document_templates"
  ON public.document_templates FOR INSERT
  WITH CHECK (is_backoffice());

CREATE POLICY "Backoffice updates document_templates"
  ON public.document_templates FOR UPDATE
  USING (is_backoffice());

CREATE POLICY "Backoffice deletes document_templates"
  ON public.document_templates FOR DELETE
  USING (is_backoffice());

-- Fase 3B: Generated documents tabel
CREATE TABLE public.generated_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  template_id uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  generated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read generated_documents"
  ON public.generated_documents FOR SELECT
  USING (is_backoffice() OR is_trainer_for_client(client_id));

CREATE POLICY "Backoffice manages generated_documents"
  ON public.generated_documents FOR INSERT
  WITH CHECK (is_backoffice());

CREATE POLICY "Backoffice deletes generated_documents"
  ON public.generated_documents FOR DELETE
  USING (is_backoffice());

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('document-templates', 'document-templates', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('generated-documents', 'generated-documents', false);

-- Storage policies: document-templates
CREATE POLICY "Staff read templates" ON storage.objects FOR SELECT
  USING (bucket_id = 'document-templates' AND (is_backoffice() OR is_trainer()));

CREATE POLICY "Backoffice upload templates" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'document-templates' AND is_backoffice());

CREATE POLICY "Backoffice delete templates" ON storage.objects FOR DELETE
  USING (bucket_id = 'document-templates' AND is_backoffice());

-- Storage policies: generated-documents
CREATE POLICY "Staff read generated docs" ON storage.objects FOR SELECT
  USING (bucket_id = 'generated-documents' AND (is_backoffice() OR is_trainer()));

CREATE POLICY "Backoffice upload generated docs" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'generated-documents' AND is_backoffice());

CREATE POLICY "Backoffice delete generated docs" ON storage.objects FOR DELETE
  USING (bucket_id = 'generated-documents' AND is_backoffice());

-- Trigger for updated_at on document_templates
CREATE TRIGGER update_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
