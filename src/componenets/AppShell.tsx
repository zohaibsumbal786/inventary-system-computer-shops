import { Link, useRouter } from "@tanstack/react-router";
import {
  LayoutDashboard, Package, ScanLine, Users, Receipt,
  BarChart3, Settings, LogOut, Menu, ShieldCheck,
  History, UserCheck, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/use-auth";

// All clients get full access — only User Management is admin-only
const nav = [
  { to: "/dashboard",  label: "Dashboard",       icon: LayoutDashboard, adminOnly: false },
  { to: "/scan",       label: "Scan & Sell",      icon: ScanLine,        adminOnly: false },
  { to: "/inventory",  label: "Inventory",        icon: Package,         adminOnly: false },
  { to: "/dealers",    label: "Dealers",          icon: Users,           adminOnly: false },
  { to: "/sales",      label: "Sales",            icon: Receipt,         adminOnly: false },
  { to: "/reports",    label: "Reports",          icon: BarChart3,       adminOnly: false },
  { to: "/audit",      label: "Activity Log",     icon: History,         adminOnly: false },
  { to: "/user-mgmt",  label: "User Management",  icon: UserCheck,       adminOnly: true  },
  { to: "/settings",   label: "Settings",         icon: Settings,        adminOnly: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { role, isAdmin } = useRole();

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pending-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("pending_users")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  const visible = nav.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground shadow-xl">
        <SidebarContent role={role} items={visible} pendingCount={pendingCount} onNavigate={() => {}} signOut={signOut} />
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar text-sidebar-foreground flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-sidebar-border">
              <span className="font-bold text-lg">TechStock</span>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-sidebar-accent">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent role={role} items={visible} pendingCount={pendingCount} onNavigate={() => setOpen(false)} signOut={signOut} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 border-b bg-white px-4 h-14 shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-bold text-primary">TechStock</span>
          {pendingCount > 0 && (
            <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-[11px] font-bold text-white">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </header>
        <main className="flex-1 min-w-0 p-4 md:p-6 max-w-screen-2xl">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  role, items, pendingCount, onNavigate, signOut,
}: {
  role: "admin" | "staff" | null;
  items: ReadonlyArray<{ to: string; label: string; icon: React.ElementType }>;
  pendingCount: number;
  onNavigate: () => void;
  signOut: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight">TechStock</div>
            <div className="text-[11px] text-sidebar-foreground/50">Inventory & Ledger</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {items.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            activeProps={{ className: "bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary/90 hover:text-white" }}
          >
            <n.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 font-medium">{n.label}</span>
            {n.to === "/user-mgmt" && pendingCount > 0 && (
              <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border space-y-3">
        <div className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold",
          role === "admin"
            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
            : "bg-blue-500/15 text-blue-300 border border-blue-500/20"
        )}>
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="capitalize">{role ?? "—"} Account</span>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm w-full text-sidebar-foreground/60 hover:bg-red-500/15 hover:text-red-300 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
