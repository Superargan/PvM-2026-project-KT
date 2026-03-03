
-- Fase 2A: Uitbreiding clients tabel
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS class_group text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES public.referrers(id);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS referral_reason text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS goals text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS intake_notes text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS intake_date date;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS consent_data_processing boolean DEFAULT false;

-- RLS policy: anonieme gebruikers mogen clients aanmelden (INSERT only)
CREATE POLICY "Anon insert clients"
ON public.clients
FOR INSERT
TO anon
WITH CHECK (
  intake_status = 'nieuw'
  AND first_name IS NOT NULL
  AND last_name IS NOT NULL
);

-- RLS policy: anonieme gebruikers mogen scholen lezen (voor dropdown)
CREATE POLICY "Anon read schools"
ON public.schools
FOR SELECT
TO anon
USING (true);
