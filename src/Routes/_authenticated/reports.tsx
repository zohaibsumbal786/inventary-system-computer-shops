import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPKR } from "@/lib/format";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts";
import { downloadCSV, toCSV } from "@/lib/csv";
import { Download, BarChart3, TrendingUp, Wallet, Package, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

const COLORS = ["#6366f1", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

function ReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const [items, invoices, dealers] = await Promise.all([
        supabase.from("inventory_items").select("status, unit_cost_price, unit_sale_price, category"),
        supabase.from("invoices").select("sale_date, subtotal, amount_received, dealer_id, status"),
        supabase.from("dealers").select("id, name"),
      ]);
      if (items.error) throw items.error;
      if (invoices.error) throw invoices.error;
      if (dealers.error) throw dealers.error;
      return { items: items.data ?? [], invoices: invoices.data ?? [], dealers: dealers.data ?? [] };
    },
  });

  if (isLoading || !data) return (
    <div className="flex items-center justify-center min-h-96">
      <div className="text-center space-y-3">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
        <p className="text-muted-foreground">Loading reports…</p>
      </div>
    </div>
  );

  const inStock  = data.items.filter(i => i.status === "in_stock");
  const sold     = data.items.filter(i => i.status === "sold");
  const costVal  = inStock.reduce((s, i) => s + Number(i.unit_cost_price), 0);
  const saleVal  = inStock.reduce((s, i) => s + Number(i.unit_sale_price), 0);
  const potential = saleVal - costVal;
  const totalRevenue = data.invoices.reduce((s, i) => s + Number(i.subtotal), 0);
  const totalCollected = data.invoices.reduce((s, i) => s + Number(i.amount_received), 0);

  // Monthly chart
  const byMonth = new Map<string, { sales: number; collected: number }>();
  for (const inv of data.invoices) {
    const k = new Date(inv.sale_date).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    const prev = byMonth.get(k) ?? { sales: 0, collected: 0 };
    byMonth.set(k, { sales: prev.sales + Number(inv.subtotal), collected: prev.collected + Number(inv.amount_received) });
  }
  const monthlyData = Array.from(byMonth.entries()).slice(-12).map(([month, v]) => ({ month, ...v }));

  // Category breakdown
  const catMap = new Map<string, { cost: number; sale: number; count: number }>();
  for (const it of data.items) {
    const prev = catMap.get(it.category) ?? { cost: 0, sale: 0, count: 0 };
    catMap.set(it.category, { cost: prev.cost + Number(it.unit_cost_price), sale: prev.sale + Number(it.unit_sale_price), count: prev.count + 1 });
  }
  const categoryData = Array.from(catMap.entries()).map(([name, v]) => ({ name, ...v }));

  // Invoice status pie
  const statusMap = new Map<string, number>();
  for (const inv of data.invoices) statusMap.set(inv.status, (statusMap.get(inv.status) ?? 0) + 1);
  const statusPie = [
    { name: "Paid", value: statusMap.get("paid") ?? 0, color: "#22c55e" },
    { name: "Partial", value: statusMap.get("partial") ?? 0, color: "#f59e0b" },
    { name: "Unpaid", value: statusMap.get("unpaid") ?? 0, color: "#ef4444" },
  ].filter(s => s.value > 0);

  // Dealer outstanding
  const dealerMap = new Map<string, { name: string; total: number; received: number }>();
  for (const d of data.dealers) dealerMap.set(d.id, { name: d.name, total: 0, received: 0 });
  for (const inv of data.invoices) {
    const m = dealerMap.get(inv.dealer_id);
    if (m) { m.total += Number(inv.subtotal); m.received += Number(inv.amount_received); }
  }
  const outstanding = Array.from(dealerMap.values())
    .map(d => ({ ...d, remaining: d.total - d.received }))
    .filter(d => d.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);

  const exportOutstanding = () => {
    downloadCSV(`outstanding-${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(outstanding.map(d => ({ Dealer: d.name, Total: d.total, Received: d.received, Remaining: d.remaining }))));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Reports & Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Full financial overview of your store</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          { label: "Stock (Cost)",    value: formatPKR(costVal),       gradient: "from-violet-500 to-purple-600",  icon: Package },
          { label: "Stock (Sale)",    value: formatPKR(saleVal),        gradient: "from-blue-500 to-cyan-500",      icon: TrendingUp },
          { label: "Potential Profit",value: formatPKR(potential),      gradient: "from-emerald-500 to-teal-500",   icon: Wallet },
          { label: "Total Revenue",   value: formatPKR(totalRevenue),   gradient: "from-indigo-500 to-blue-600",    icon: BarChart3 },
          { label: "Collected",       value: formatPKR(totalCollected), gradient: "from-green-500 to-emerald-600",  icon: Wallet },
        ].map(k => (
          <Card key={k.label} className="border-0 shadow-md overflow-hidden">
            <div className={`bg-gradient-to-br ${k.gradient} p-4 text-white`}>
              <k.icon className="h-5 w-5 mb-2 opacity-80" />
              <div className="text-lg font-bold truncate">{k.value}</div>
              <div className="text-xs text-white/70 mt-0.5">{k.label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Monthly area + Status pie */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-primary" /> Monthly Sales & Collections
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">No sales data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={monthlyData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" fontSize={11} tick={{ fill: "#888" }} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} tick={{ fill: "#888" }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatPKR(v)} contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="sales" name="Sales" stroke="#6366f1" strokeWidth={2.5} fill="url(#gS)" />
                  <Area type="monotone" dataKey="collected" name="Collected" stroke="#22c55e" strokeWidth={2.5} fill="url(#gC)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-5 w-5 text-primary" /> Invoice Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusPie.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">No invoices yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={statusPie} cx="50%" cy="45%" innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value">
                    {statusPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, name) => [`${v} invoices`, name]} contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                  <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown */}
      <Card className="shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5 text-primary" /> Stock Valuation by Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          {categoryData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No inventory yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={categoryData} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={12} tick={{ fill: "#555" }} axisLine={false} tickLine={false} />
                <YAxis fontSize={11} tick={{ fill: "#888" }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatPKR(v)} contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey="cost" name="Cost Value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sale" name="Sale Value" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs">{value}</span>} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Outstanding balances */}
      <Card className="shadow-md">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-orange-500" /> Outstanding Balances
          </CardTitle>
          <Button size="sm" variant="outline" onClick={exportOutstanding} disabled={!outstanding.length} className="gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase text-muted-foreground">Dealer</th>
                <th className="px-4 py-3 text-right font-semibold text-xs uppercase text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-right font-semibold text-xs uppercase text-muted-foreground">Collected</th>
                <th className="px-4 py-3 text-right font-semibold text-xs uppercase text-muted-foreground">Remaining</th>
                <th className="px-4 py-3 text-right font-semibold text-xs uppercase text-muted-foreground">% Paid</th>
              </tr>
            </thead>
            <tbody>
              {outstanding.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-emerald-600 font-semibold">
                  ✓ All balances settled
                </td></tr>
              )}
              {outstanding.map(d => {
                const pct = d.total > 0 ? Math.round(d.received / d.total * 100) : 0;
                return (
                  <tr key={d.name} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-semibold">{d.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPKR(d.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{formatPKR(d.received)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-orange-600">{formatPKR(d.remaining)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
