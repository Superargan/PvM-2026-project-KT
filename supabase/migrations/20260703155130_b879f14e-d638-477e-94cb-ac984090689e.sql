ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_viewed_by_profile_fkey
  FOREIGN KEY (viewed_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;