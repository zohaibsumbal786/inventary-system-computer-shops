import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ScanLine, Clock, XCircle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

type Screen = "signin" | "signup" | "pending" | "rejected";

function AuthPage() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // On mount: if already signed in, check approval status
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      await checkAndRedirect(data.session.user.id);
    });
  }, []);

  async function checkAndRedirect(userId: string) {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (roles && roles.length > 0) {
      navigate({ to: "/dashboard", replace: true });
      return;
    }

    // Check pending status
    const { data: pending } = await supabase
      .from("pending_users")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();

    if (pending?.status === "rejected") {
      setScreen("rejected");
    } else if (pending?.status === "pending") {
      setScreen("pending");
    }
    // If no pending record and no role, just stay on auth
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (screen === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created — awaiting admin approval");
        // Get current user to check status
        const { data: session } = await supabase.auth.getSession();
        if (session.session) {
          await checkAndRedirect(session.session.user.id);
        } else {
          setScreen("pending");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) await checkAndRedirect(data.user.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setScreen("signin");
    setEmail("");
    setPassword("");
  };

  // Pending approval screen
  if (screen === "pending") {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-accent/40 to-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto h-14 w-14 grid place-items-center rounded-full bg-amber-100 text-amber-600">
              <Clock className="h-7 w-7" />
            </div>
            <CardTitle className="mt-3 text-xl">Awaiting Approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your account request has been submitted. The admin will review it shortly.
              Once approved, you'll be able to access TechStock.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                setBusy(true);
                const { data } = await supabase.auth.getSession();
                if (data.session) await checkAndRedirect(data.session.user.id);
                setBusy(false);
              }}
              disabled={busy}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Status
            </Button>
            <Button variant="ghost" className="w-full text-sm" onClick={signOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Rejected screen
  if (screen === "rejected") {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-accent/40 to-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto h-14 w-14 grid place-items-center rounded-full bg-red-100 text-red-600">
              <XCircle className="h-7 w-7" />
            </div>
            <CardTitle className="mt-3 text-xl">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your access request has been rejected by the admin. Contact the shop owner if you believe this is a mistake.
            </p>
            <Button variant="ghost" className="w-full" onClick={signOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sign in / Sign up form
  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-accent/40 to-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 grid place-items-center rounded-lg bg-primary text-primary-foreground">
            <ScanLine />
          </div>
          <CardTitle className="mt-2">TechStock</CardTitle>
          <p className="text-sm text-muted-foreground">Inventory & dealer ledger</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {screen === "signin" ? "Sign In" : "Create Account"}
            </Button>
          </form>
          <div className="text-center text-sm mt-4">
            {screen === "signin" ? "No account?" : "Have an account?"}{" "}
            <button
              className="text-primary underline"
              onClick={() => setScreen(screen === "signin" ? "signup" : "signin")}
            >
              {screen === "signin" ? "Sign up" : "Sign in"}
            </button>
          </div>
          {screen === "signup" && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              New accounts require admin approval before access is granted.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
