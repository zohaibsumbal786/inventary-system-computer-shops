import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPKR, formatDate } from "@/lib/format";
import { downloadCSV, toCSV } from "@/lib/csv";
import { Download, FileText, Receipt, Search, TrendingUp, Wallet, AlertCircle } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
});

const STATUS_STYLES: Record<string, string> = {
  paid:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  partial: "bg-orange-100 text-orange-700 border-orange-200",
  unpaid:  "bg-red-100 text-red-600 border-red-200",
};

function SalesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, dealer:dealers(name), invoice_items(*, item:inventory_items(brand, model_name))")
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = invoices.filter(inv => {
    if (statusFilter !== "all" && inv.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const blob = `${inv.invoice_number} ${(inv.dealer as any)?.name ?? ""}`.toLowerCase();
      if (!blob.includes(s)) return false;
    }
    return true;
  });

  const totalSales = invoices.reduce((s, i) => s + Number(i.subtotal), 0);
  const totalReceived = invoices.reduce((s, i) => s + Number(i.amount_received), 0);
  const outstanding = totalSales - totalReceived;
  const paidCount = invoices.filter(i => i.status === "paid").length;

  const exportCSV = () => {
    const rows = invoices.map(inv => ({
      Date: formatDate(inv.sale_date),
      Invoice: inv.invoice_number,
      Dealer: (inv.dealer as any)?.name ?? "",
      Items: (inv.invoice_items as any[]).map(li => `${li.item?.brand ?? ""} ${li.item?.model_name ?? ""}`.trim()).join(" | "),
      Total: Number(inv.subtotal),
      Received: Number(inv.amount_received),
      Remaining: Number(inv.subtotal) - Number(inv.amount_received),
      Status: inv.status,
    }));
    downloadCSV(`sales-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" /> Sales History
          </h1>
          <p className="text-sm text-muted-foreground">{invoices.length} invoices total</p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={!invoices.length} className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Sales",    value: formatPKR(totalSales),    icon: TrendingUp,  gradient: "from-violet-500 to-indigo-600" },
          { label: "Collected",      value: formatPKR(totalReceived),  icon: Wallet,      gradient: "from-emerald-500 to-teal-600" },
          { label: "Outstanding",    value: formatPKR(outstanding),    icon: AlertCircle, gradient: "from-orange-500 to-red-500" },
          { label: "Paid Invoices",  value: `${paidCount}/${invoices.length}`, icon: FileText, gradient: "from-blue-500 to-cyan-500" },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-md overflow-hidden">
            <div className={`bg-gradient-to-br ${s.gradient} p-4 text-white`}>
              <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center mb-2">
                <s.icon className="h-4 w-4" />
              </div>
              <div className="text-xl font-bold truncate">{s.value}</div>
              <div className="text-xs text-white/70 mt-0.5">{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardContent className="p-4 flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search invoice or dealer…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2">
            {["all", "paid", "partial", "unpaid"].map(s => (
              <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm"
                onClick={() => setStatusFilter(s)} className="capitalize">
                {s === "all" ? "All" : s}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {["Date", "Invoice #", "Dealer", "Items", "Total", "Received", "Remaining", "Status", ""].map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-xs uppercase text-muted-foreground ${h === "" || h === "Total" || h === "Received" || h === "Remaining" ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="py-16 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    Loading…
                  </div>
                </td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={9} className="py-16 text-center">
                  <Receipt className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-muted-foreground">No sales found</p>
                </td></tr>
              )}
              {filtered.map(inv => {
                const remaining = Number(inv.subtotal) - Number(inv.amount_received);
                return (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(inv.sale_date)}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{inv.invoice_number}</td>
                    <td className="px-4 py-3 font-medium">{(inv.dealer as any)?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">
                      {(inv.invoice_items as any[]).map(li => `${li.item?.brand ?? ""} ${li.item?.model_name ?? ""}`.trim()).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatPKR(inv.subtotal)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{formatPKR(inv.amount_received)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-bold ${remaining > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                      {remaining > 0 ? formatPKR(remaining) : "✓"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className={`text-xs ${STATUS_STYLES[inv.status] ?? ""}`}>{inv.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to="/sales/$id" params={{ id: inv.id }}>
                        <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-primary hover:text-primary">
                          <FileText className="h-3.5 w-3.5" /> View
                        </Button>
                      </Link>
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
