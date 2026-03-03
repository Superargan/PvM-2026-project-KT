
-- Add trainer business fields to staff table
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS trade_name text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS kvk_number text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS email text;

-- Make user_id nullable so trainers can exist without a system account
ALTER TABLE public.staff ALTER COLUMN user_id DROP NOT NULL;
