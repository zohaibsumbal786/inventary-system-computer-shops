import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPKR, formatDateTime, formatDate } from "@/lib/format";
import {
  Package, ShoppingCart, Wallet, AlertTriangle, TrendingUp,
  Boxes, ArrowRight, Activity, Users, Receipt,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

async function loadDashboard() {
  const [items, invoices, dealers, activity] = await Promise.all([
    supabase.from("inventory_items").select("id, status, unit_cost_price, unit_sale_price, category, date_added"),
    supabase.from("invoices").select("id, subtotal, amount_received, dealer_id, sale_date, invoice_number, status, dealer:dealers(name)").order("sale_date", { ascending: false }),
    supabase.from("dealers").select("id, name"),
    supabase.from("activity_log").select("id, action, created_at, inventory_item_id, inventory_item:inventory_items(tag_code, brand, model_name)").order("created_at", { ascending: false }).limit(8),
  ]);
  if (items.error) throw items.error;
  if (invoices.error) throw invoices.error;
  if (dealers.error) throw dealers.error;
  return { items: items.data ?? [], invoices: invoices.data ?? [], dealers: dealers.data ?? [], activity: activity.data ?? [] };
}

const CHART_COLORS = ["#6366f1", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: loadDashboard });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const inStock   = data.items.filter(i => i.status === "in_stock");
  const sold      = data.items.filter(i => i.status === "sold");
  const reserved  = data.items.filter(i => i.status === "reserved");
  const stockValue    = inStock.reduce((s, i) => s + Number(i.unit_cost_price ?? 0), 0);
  const potentialRev  = inStock.reduce((s, i) => s + Number(i.unit_sale_price ?? 0), 0);
  const totalSales    = data.invoices.reduce((s, i) => s + Number(i.subtotal), 0);
  const totalReceived = data.invoices.reduce((s, i) => s + Number(i.amount_received), 0);
  const totalOutstanding = totalSales - totalReceived;

  // Monthly sales chart (last 6 months)
  const monthlyMap = new Map<string, { sales: number; received: number }>();
  for (const inv of data.invoices) {
    const k = new Date(inv.sale_date).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    const prev = monthlyMap.get(k) ?? { sales: 0, received: 0 };
    monthlyMap.set(k, { sales: prev.sales + Number(inv.subtotal), received: prev.received + Number(inv.amount_received) });
  }
  const monthlyData = Array.from(monthlyMap.entries()).slice(-6).map(([month, v]) => ({ month, ...v }));

  // Category breakdown pie
  const catMap = new Map<string, number>();
  for (const it of data.items) catMap.set(it.category, (catMap.get(it.category) ?? 0) + 1);
  const pieData = Array.from(catMap.entries()).map(([name, value]) => ({ name, value }));

  // Status breakdown
  const statusData = [
    { name: "In Stock", value: inStock.length, color: "#22c55e" },
    { name: "Sold", value: sold.length, color: "#6366f1" },
    { name: "Reserved", value: reserved.length, color: "#f59e0b" },
  ];

  // Per-dealer ledger
  const dealerMap = new Map<string, { id: string; name: string; total: number; received: number }>();
  for (const d of data.dealers) dealerMap.set(d.id, { id: d.id, name: d.name, total: 0, received: 0 });
  for (const inv of data.invoices) {
    const m = dealerMap.get(inv.dealer_id);
    if (m) { m.total += Number(inv.subtotal); m.received += Number(inv.amount_received); }
  }
  const ledger = Array.from(dealerMap.values())
    .map(d => ({ ...d, remaining: d.total - d.received }))
    .filter(d => d.total > 0)
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 8);

  const stats = [
    { label: "Stock Value",     value: formatPKR(stockValue),      icon: Wallet,       gradient: "from-violet-500 to-purple-600",  sub: `${inStock.length} items` },
    { label: "Potential Rev.",  value: formatPKR(potentialRev),    icon: TrendingUp,   gradient: "from-blue-500 to-cyan-500",      sub: "at sale prices" },
    { label: "Total Sales",     value: formatPKR(totalSales),      icon: Receipt,      gradient: "from-emerald-500 to-teal-500",   sub: `${data.invoices.length} invoices` },
    { label: "Collected",       value: formatPKR(totalReceived),   icon: Boxes,        gradient: "from-green-500 to-emerald-600",  sub: `${Math.round(totalSales > 0 ? totalReceived / totalSales * 100 : 0)}% of total` },
    { label: "Outstanding",     value: formatPKR(totalOutstanding),icon: AlertTriangle,gradient: "from-orange-500 to-red-500",     sub: `${data.dealers.length} dealers` },
    { label: "Items Sold",      value: sold.length.toString(),     icon: ShoppingCart, gradient: "from-pink-500 to-rose-500",      sub: `${inStock.length} still in stock` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back — here's your store overview</p>
        </div>
        <Link to="/scan">
          <Button className="gap-2 shadow-lg shadow-primary/25">
            <Activity className="h-4 w-4" /> New Sale
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="overflow-hidden border-0 shadow-md">
            <div className={`bg-gradient-to-br ${s.gradient} p-4 text-white`}>
              <div className="flex items-center justify-between mb-3">
                <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center">
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
              <div className="text-2xl font-bold truncate">{s.value}</div>
              <div className="text-xs text-white/80 mt-1">{s.label}</div>
              <div className="text-xs text-white/60 mt-0.5">{s.sub}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Monthly sales area chart */}
        <Card className="lg:col-span-2 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Sales vs Collections (Monthly)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No sales data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={monthlyData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gReceived" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" fontSize={11} tick={{ fill: "#888" }} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} tick={{ fill: "#888" }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatPKR(v)} contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }} />
                  <Area type="monotone" dataKey="sales" name="Sales" stroke="#6366f1" strokeWidth={2} fill="url(#gSales)" />
                  <Area type="monotone" dataKey="received" name="Collected" stroke="#22c55e" strokeWidth={2} fill="url(#gReceived)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Inventory status donut */}
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Inventory Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="45%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number, name) => [`${v} items`, name]} contentStyle={{ borderRadius: "8px" }} />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Category chart + Dealer ledger */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Category bar chart */}
        <Card className="lg:col-span-2 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              Stock by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No inventory yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={pieData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" fontSize={11} tick={{ fill: "#888" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" fontSize={11} tick={{ fill: "#555" }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip formatter={(v: number) => [`${v} items`, "Count"]} contentStyle={{ borderRadius: "8px" }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Dealer ledger */}
        <Card className="lg:col-span-3 shadow-md">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Dealer Ledger
            </CardTitle>
            <Link to="/dealers">
              <Button variant="ghost" size="sm" className="gap-1 text-primary text-xs">
                View all <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {ledger.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No dealers yet</div>
            ) : (
              <div className="divide-y">
                {ledger.map((d, i) => {
                  const pct = d.total > 0 ? Math.round(d.received / d.total * 100) : 100;
                  return (
                    <div key={d.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                        {d.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link to="/dealers/$id" params={{ id: d.id }} className="font-medium text-sm hover:underline truncate block">{d.name}</Link>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-sm font-bold ${d.remaining > 0 ? "text-orange-500" : "text-emerald-500"}`}>
                          {formatPKR(d.remaining)}
                        </div>
                        <div className="text-xs text-muted-foreground">outstanding</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent invoices + Activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent invoices */}
        <Card className="shadow-md">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Recent Invoices
            </CardTitle>
            <Link to="/sales">
              <Button variant="ghost" size="sm" className="gap-1 text-primary text-xs">
                View all <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {data.invoices.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No invoices yet</div>
            ) : (
              <div className="divide-y">
                {data.invoices.slice(0, 6).map((inv) => (
                  <div key={inv.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${inv.status === "paid" ? "bg-emerald-500" : inv.status === "partial" ? "bg-orange-400" : "bg-red-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">{inv.invoice_number}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${inv.status === "paid" ? "bg-emerald-100 text-emerald-700" : inv.status === "partial" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-600"}`}>
                          {inv.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{(inv.dealer as any)?.name} · {formatDate(inv.sale_date)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">{formatPKR(inv.subtotal)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card className="shadow-md">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Recent Activity
            </CardTitle>
            <Link to="/audit">
              <Button variant="ghost" size="sm" className="gap-1 text-primary text-xs">
                Full log <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {data.activity.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No activity yet</div>
            ) : (
              <div className="divide-y">
                {data.activity.map((a: any) => {
                  const colors: Record<string, string> = {
                    added: "bg-blue-500", sold: "bg-emerald-500",
                    invoice_created: "bg-purple-500", payment_received: "bg-green-500",
                    price_updated: "bg-orange-500", status_changed: "bg-yellow-500",
                  };
                  return (
                    <div key={a.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${colors[a.action] ?? "bg-gray-400"}`}>
                        <Activity className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium capitalize">{a.action.replace(/_/g, " ")}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {a.inventory_item ? `${a.inventory_item.tag_code} · ${a.inventory_item.brand ?? ""} ${a.inventory_item.model_name ?? ""}` : "—"}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">{formatDateTime(a.created_at)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
