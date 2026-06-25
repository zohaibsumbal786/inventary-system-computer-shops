import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Clock, ShieldCheck,
  Users, UserX, RefreshCw, History, Trash2,
  UserCheck, AlertTriangle,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/user-mgmt")({
  component: () => (
    <RequireAdmin>
      <UserMgmtContent />
    </RequireAdmin>
  ),
});

// ─── types ────────────────────────────────────────────────────────────────────
type PendingUser = {
  id: string;
  user_id: string;
  email: string;
  requested_at: string;
  status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
};

type ActiveUser = {
  user_id: string;
  email: string;
  role: "admin" | "staff";
  created_at: string;
};

// ─── status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "pending")
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-600 bg-amber-50 gap-1">
        <Clock className="h-3 w-3" /> Pending
      </Badge>
    );
  if (status === "approved")
    return (
      <Badge variant="outline" className="border-emerald-400 text-emerald-700 bg-emerald-50 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Approved
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-red-400 text-red-600 bg-red-50 gap-1">
      <XCircle className="h-3 w-3" /> Rejected
    </Badge>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
function UserMgmtContent() {
  const qc = useQueryClient();

  // ── data ─────────────────────────────────────────────────────────────────────
  const { data: pending = [], isLoading: loadingPending, refetch: refetchPending } = useQuery({
    queryKey: ["pending-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_users")
        .select("*")
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PendingUser[];
    },
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  const { data: active = [], isLoading: loadingActive, refetch: refetchActive } = useQuery({
    queryKey: ["active-users"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Get emails from pending_users table (all approved users have a record there)
      const { data: emailRows } = await supabase
        .from("pending_users")
        .select("user_id, email");
      const emailMap: Record<string, string> = {};
      (emailRows ?? []).forEach((e) => { emailMap[e.user_id] = e.email; });

      return (roles ?? []).map((r) => ({
        ...r,
        email: emailMap[r.user_id] ?? "—",
      })) as ActiveUser[];
    },
    refetchInterval: 30_000,
  });

  // ── mutations ─────────────────────────────────────────────────────────────────
  const approve = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("approve_user", {
        _user_id: userId,
        _role: "staff",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("✅ User approved — they can now log in");
      qc.invalidateQueries({ queryKey: ["pending-users"] });
      qc.invalidateQueries({ queryKey: ["active-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("reject_user", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User rejected");
      qc.invalidateQueries({ queryKey: ["pending-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("revoke_user_access", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Access revoked — user can no longer log in");
      qc.invalidateQueries({ queryKey: ["active-users"] });
      qc.invalidateQueries({ queryKey: ["pending-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("delete_user", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account permanently deleted");
      qc.invalidateQueries({ queryKey: ["active-users"] });
      qc.invalidateQueries({ queryKey: ["pending-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reApprove = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("approve_user", {
        _user_id: userId,
        _role: "staff",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("✅ User re-approved");
      qc.invalidateQueries({ queryKey: ["pending-users"] });
      qc.invalidateQueries({ queryKey: ["active-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const waiting = pending.filter((p) => p.status === "pending");
  const approved = pending.filter((p) => p.status === "approved");
  const rejected = pending.filter((p) => p.status === "rejected");
  // Non-admin active users (clients)
  const clients = active.filter((u) => u.role !== "admin");

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
            Admin Panel
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage client access requests and active accounts
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetchPending(); refetchActive(); }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard color="amber" icon={<Clock className="h-5 w-5 text-amber-500" />} label="Awaiting" value={waiting.length} />
        <StatCard color="blue" icon={<Users className="h-5 w-5 text-blue-500" />} label="Active Clients" value={clients.length} />
        <StatCard color="emerald" icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Approved Total" value={approved.length} />
        <StatCard color="red" icon={<XCircle className="h-5 w-5 text-red-500" />} label="Rejected" value={rejected.length} />
      </div>

      {/* ── Pending Requests ── */}
      <Card className={waiting.length > 0 ? "border-amber-300 shadow-amber-100 shadow-md" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-amber-500" />
            Pending Access Requests
            {waiting.length > 0 && (
              <Badge className="bg-amber-500 hover:bg-amber-500 text-white">{waiting.length} new</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingPending ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : waiting.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No pending requests — all caught up!</p>
            </div>
          ) : (
            <div className="divide-y">
              {waiting.map((p) => (
                <div key={p.id} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{p.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested {formatDateTime(p.requested_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* APPROVE */}
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => approve.mutate(p.user_id)}
                      disabled={approve.isPending}
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-1" />
                      Approve
                    </Button>

                    {/* REJECT */}
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50">
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                        </Button>
                      }
                      title="Reject this request?"
                      description={`${p.email} will be told their request was rejected. You can re-approve them later.`}
                      actionLabel="Reject"
                      actionClass="bg-orange-600 hover:bg-orange-700 text-white"
                      onConfirm={() => reject.mutate(p.user_id)}
                    />

                    {/* DELETE */}
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                        </Button>
                      }
                      title="Permanently delete account?"
                      description={`This will completely remove ${p.email} from the system. This cannot be undone.`}
                      actionLabel="Delete Forever"
                      actionClass="bg-destructive hover:bg-destructive/90 text-white"
                      onConfirm={() => deleteUser.mutate(p.user_id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Active Clients ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-blue-500" />
            Active Client Accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingActive ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : clients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No active clients yet.</p>
          ) : (
            <div className="divide-y">
              {clients.map((u) => (
                <div key={u.user_id} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{u.email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Active since {formatDateTime(u.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* REVOKE ACCESS (keeps account, removes login ability) */}
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50">
                          <UserX className="h-3.5 w-3.5 mr-1" /> Revoke Access
                        </Button>
                      }
                      title="Revoke access?"
                      description={`${u.email} will immediately lose access to TechStock. Their data is kept. You can re-approve later.`}
                      actionLabel="Revoke"
                      actionClass="bg-orange-600 hover:bg-orange-700 text-white"
                      onConfirm={() => revoke.mutate(u.user_id)}
                    />

                    {/* DELETE ACCOUNT PERMANENTLY */}
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Account
                        </Button>
                      }
                      title="Permanently delete account?"
                      description={`This will completely remove ${u.email} and all their data. This CANNOT be undone.`}
                      actionLabel="Delete Forever"
                      actionClass="bg-destructive hover:bg-destructive/90 text-white"
                      onConfirm={() => deleteUser.mutate(u.user_id)}
                      dangerous
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Your Admin Account (read-only) ── */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Your Admin Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          {active.filter((u) => u.role === "admin").map((u) => (
            <div key={u.user_id} className="flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-emerald-500 shrink-0" />
              <div>
                <p className="font-semibold">{u.email}</p>
                <p className="text-xs text-muted-foreground">Full admin access · Protected account</p>
              </div>
              <Badge className="ml-auto bg-emerald-600 hover:bg-emerald-600 text-white">Admin</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Full History ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Request History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No history yet.</p>
          ) : (
            <div className="divide-y">
              {pending.map((p) => (
                <div key={p.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(p.requested_at)}
                      {p.reviewed_at && ` · reviewed ${formatDateTime(p.reviewed_at)}`}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                  {p.status === "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 text-xs shrink-0"
                      onClick={() => reApprove.mutate(p.user_id)}
                      disabled={reApprove.isPending}
                    >
                      Re-approve
                    </Button>
                  )}
                  {p.status !== "pending" && (
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0 px-2">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      }
                      title="Delete this account?"
                      description={`Permanently remove ${p.email} from the system.`}
                      actionLabel="Delete"
                      actionClass="bg-destructive hover:bg-destructive/90 text-white"
                      onConfirm={() => deleteUser.mutate(p.user_id)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Reusable confirm dialog ──────────────────────────────────────────────────
function ConfirmDialog({
  trigger, title, description, actionLabel, actionClass, onConfirm, dangerous,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  actionClass: string;
  onConfirm: () => void;
  dangerous?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {dangerous && <AlertTriangle className="h-5 w-5 text-red-500" />}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className={actionClass} onClick={onConfirm}>
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number;
  color: "amber" | "blue" | "emerald" | "red";
}) {
  const bg = {
    amber: "bg-amber-50 border-amber-200",
    blue: "bg-blue-50 border-blue-200",
    emerald: "bg-emerald-50 border-emerald-200",
    red: "bg-red-50 border-red-200",
  }[color];
  return (
    <Card className={bg}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
