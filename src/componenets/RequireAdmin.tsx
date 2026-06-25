import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRole } from "@/hooks/use-auth";
import type { ReactNode } from "react";

export function RequireAdmin({ children, label }: { children: ReactNode; label?: string }) {
  const { isAdmin, loading } = useRole();
  if (loading) return (
    <div className="flex items-center justify-center min-h-48">
      <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  if (!isAdmin) return <AccessDenied label={label} />;
  return <>{children}</>;
}

export function AccessDenied({ label }: { label?: string }) {
  return (
    <div className="flex justify-center py-16">
      <Card className="max-w-sm w-full border-0 shadow-lg">
        <CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-orange-100 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-orange-500" />
          </div>
          <h2 className="text-lg font-bold">Admin Only</h2>
          <p className="text-sm text-muted-foreground">
            {label ? `"${label}"` : "This page"} requires admin access.
            Contact your shop admin to get access.
          </p>
          <Link to="/dashboard">
            <Button variant="outline" className="w-full">← Back to Dashboard</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
