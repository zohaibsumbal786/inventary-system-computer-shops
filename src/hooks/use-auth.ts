import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}

export type Role = "admin" | "staff" | null;
export type ApprovalStatus = "pending" | "approved" | "rejected" | "none";

export function useRole(): {
  role: Role;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  approvalStatus: ApprovalStatus;
} {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<Role>(null);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("none");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRole(null);
      setApprovalStatus("none");
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      // Check role first
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (roleData?.some((r) => r.role === "admin")) {
        setRole("admin");
        setApprovalStatus("approved");
      } else if (roleData && roleData.length > 0) {
        setRole("staff");
        setApprovalStatus("approved");
      } else {
        // No role yet — check pending status
        setRole(null);
        const { data: pending } = await supabase
          .from("pending_users")
          .select("status")
          .eq("user_id", user.id)
          .maybeSingle();

        if (pending) {
          setApprovalStatus(pending.status as ApprovalStatus);
        } else {
          setApprovalStatus("none");
        }
      }
      setLoading(false);
    })();
  }, [user, authLoading]);

  return { role, loading, isAdmin: role === "admin", isStaff: role === "staff", approvalStatus };
}
