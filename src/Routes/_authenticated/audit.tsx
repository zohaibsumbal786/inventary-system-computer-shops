import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatPKR } from "@/lib/format";
import { useRole } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { downloadCSV, toCSV } from "@/lib/csv";
import {
  Download, Search, Package, ShoppingCart, FileText,
  Banknote, Pencil, AlertCircle, Tag, History, ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

const ACTIONS = [
  "all", "added", "sold", "invoice_created",
  "payment_received", "status_changed", "price_updated",
];

function iconFor(action: string) {
  switch (action) {
    case "added":            return Package;
    case "sold":             return ShoppingCart;
    case "invoice_created":  return FileText;
    case "payment_received": return Banknote;
    case "price_updated":    return Pencil;
    case "status_changed":   return AlertCircle;
    default:                 return Tag;
  }
}

function badgeColor(action: string) {
  switch (action) {
    case "added":            return "bg-blue-100 text-blue-700 border-blue-200";
    case "sold":             return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "invoice_created":  return "bg-purple-100 text-purple-700 border-purple-200";
    case "payment_received": return "bg-green-100 text-green-700 border-green-200";
    case "price_updated":    return "bg-orange-100 text-orange-700 border-orange-200";
    case "status_changed":   return "bg-yellow-100 text-yellow-700 border-yellow-200";
    default:                 return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function AuditPage() {
  const { isAdmin } = useRole();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["audit-log", isAdmin, user?.id],
    queryFn: async () => {
      // RLS already handles filtering:
      // - admins get all rows
      // - staff get only their own rows (performed_by = auth.uid())
      let q = supabase
        .from("activity_log")
        .select(`
          *,
          item:inventory_items(tag_code, brand, model_name),
          dealer:dealers(name),
          invoice:invoices(invoice_number)
        `)
        .order("created_at", { ascending: false })
        .limit(isAdmin ? 500 : 200);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const filtered = rows.filter((r: any) => {
    if (action !== "all" && r.action !== action) return false;
    if (search) {
      const s = search.toLowerCase();
      const blob = `${r.action} ${r.item?.tag_code ?? ""} ${r.item?.brand ?? ""} ${r.item?.model_name ?? ""} ${r.dealer?.name ?? ""} ${r.invoice?.invoice_number ?? ""}`.toLowerCase();
      if (!blob.includes(s)) return false;
    }
    return true;
  });

  const exportCSV = () => {
    const out = filtered.map((r: any) => ({
      When:    formatDateTime(r.created_at),
      Action:  r.action,
      Tag:     r.item?.tag_code ?? "",
      Item:    `${r.item?.brand ?? ""} ${r.item?.model_name ?? ""}`.trim(),
      Dealer:  r.dealer?.name ?? "",
      Invoice: r.invoice?.invoice_number ?? "",
      Details: r.details ? JSON.stringify(r.details) : "",
    }));
    downloadCSV(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(out));
  };

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            {isAdmin ? "Full Audit Log" : "My Activity History"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin
              ? `All ${rows.length} activity entries across all users`
              : "Your personal inventory and sales activity"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Badge className="bg-purple-100 text-purple-700 border-purple-200 gap-1">
              <ShieldCheck className="h-3 w-3" /> Admin View
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Staff info banner */}
      {!isAdmin && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <History className="h-5 w-5 text-blue-500 shrink-0" />
            <p className="text-sm text-blue-700">
              Showing only <strong>your</strong> activity — items you added, sold, or updated.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Filters ── */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tag, item, dealer, invoice…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a === "all" ? "All actions" : a.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center text-sm text-muted-foreground">
            {filtered.length} of {rows.length} entries
          </div>
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left">When</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-left">Dealer / Invoice</th>
                <th className="px-4 py-3 text-left">Details</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    Loading activity…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <History className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No activity found</p>
                  </td>
                </tr>
              )}
              {filtered.map((r: any) => {
                const Icon = iconFor(r.action);
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 align-top">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`gap-1 text-xs ${badgeColor(r.action)}`}>
                        <Icon className="h-3 w-3" />
                        {r.action.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {r.item ? (
                        <Link
                          to="/inventory/$id"
                          params={{ id: r.inventory_item_id }}
                          className="hover:underline"
                        >
                          <div className="font-mono text-xs font-semibold text-primary">{r.item.tag_code}</div>
                          <div className="text-xs text-muted-foreground">{r.item.brand} {r.item.model_name}</div>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.dealer && (
                        <div>
                          {r.dealer_id ? (
                            <Link to="/dealers/$id" params={{ id: r.dealer_id }} className="hover:underline font-medium">
                              {r.dealer.name}
                            </Link>
                          ) : r.dealer.name}
                        </div>
                      )}
                      {r.invoice && (
                        <div className="mt-0.5">
                          <Link
                            to="/sales/$id"
                            params={{ id: r.invoice_id }}
                            className="font-mono text-xs text-primary hover:underline"
                          >
                            {r.invoice.invoice_number}
                          </Link>
                        </div>
                      )}
                      {!r.dealer && !r.invoice && <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <DetailsCell action={r.action} details={r.details} />
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

function DetailsCell({ action, details }: { action: string; details: any }) {
  if (!details) return <>—</>;
  if (action === "payment_received")
    return <>{formatPKR(details.amount)} via {details.method}{details.remarks ? ` · ${details.remarks}` : ""}</>;
  if (action === "sold")
    return <>Sold at {formatPKR(details.unit_price)}</>;
  if (action === "invoice_created")
    return <>{details.items} item(s) · {formatPKR(details.subtotal)} · received {formatPKR(details.received)}</>;
  if (action === "status_changed")
    return <>{details.from} → {details.to}</>;
  if (action === "price_updated")
    return <>Sale {formatPKR(details.sale_from)} → {formatPKR(details.sale_to)}</>;
  if (action === "added")
    return <>Tag {details.tag_code}</>;
  return <>{JSON.stringify(details)}</>;
}
