-- ============================================================
-- User Approval System
-- New signups go into pending_users; admin must approve them.
-- Only the very first user (who becomes admin) is auto-approved.
-- ============================================================

-- 1. Pending users table
CREATE TABLE IF NOT EXISTS public.pending_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE ON public.pending_users TO authenticated;
GRANT ALL ON public.pending_users TO service_role;
ALTER TABLE public.pending_users ENABLE ROW LEVEL SECURITY;

-- Users can read their own pending record (to show "awaiting approval" screen)
CREATE POLICY "users read own pending" ON public.pending_users
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Admins can read and update all pending records
CREATE POLICY "admins read all pending" ON public.pending_users
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update pending" ON public.pending_users
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Replace the handle_new_user trigger:
--    First user → admin + approved
--    Everyone else → pending
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    -- First ever user becomes admin immediately
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    -- Everyone else goes into the approval queue
    INSERT INTO public.pending_users (user_id, email)
    VALUES (NEW.id, NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Approve user RPC (admin only, sets role and marks approved)
CREATE OR REPLACE FUNCTION public.approve_user(
  _user_id UUID,
  _role public.app_role DEFAULT 'staff'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admins only';
  END IF;

  -- Give them a role so they can access the app
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Mark as approved
  UPDATE public.pending_users
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE user_id = _user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_user(UUID, public.app_role) TO authenticated;

-- 4. Reject user RPC (admin only, marks rejected, removes any role)
CREATE OR REPLACE FUNCTION public.reject_user(_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admins only';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;

  UPDATE public.pending_users
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE user_id = _user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reject_user(UUID) TO authenticated;

-- 5. Remove a user's access (admin only — revoke role)
CREATE OR REPLACE FUNCTION public.revoke_user_access(_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admins only';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot revoke your own access';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.revoke_user_access(UUID) TO authenticated;
