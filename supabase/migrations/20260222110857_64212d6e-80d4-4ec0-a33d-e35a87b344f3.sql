
-- Allow backoffice to read all profiles (needed for Medewerkers page)
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;

CREATE POLICY "Users view profiles"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id OR is_backoffice());
