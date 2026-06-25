import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Users, Search, Phone, Mail, MapPin, ArrowRight, TrendingDown } from "lucide-react";
import { formatPKR } from "@/lib/format";
import { toast } from "sonner";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dealers")({
  component: DealersPage,
});

function DealersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: dealers = [], isLoading } = useQuery({
    queryKey: ["dealers-with-balances"],
    queryFn: async () => {
      const [d, i] = await Promise.all([
        supabase.from("dealers").select("*").order("name"),
        supabase.from("invoices").select("dealer_id, subtotal, amount_received"),
      ]);
      if (d.error) throw d.error;
      if (i.error) throw i.error;
      const totals = new Map<string, { total: number; received: number }>();
      for (const inv of i.data) {
        const t = totals.get(inv.dealer_id) ?? { total: 0, received: 0 };
        t.total += Number(inv.subtotal); t.received += Number(inv.amount_received);
        totals.set(inv.dealer_id, t);
      }
      return d.data.map(x => {
        const t = totals.get(x.id) ?? { total: 0, received: 0 };
        return { ...x, total: t.total, received: t.received, remaining: t.total - t.received };
      });
    },
  });

  const add = useMutation({
    mutationFn: async (v: { name: string; contact_number: string; email: string; address: string; notes: string }) => {
      const { error } = await supabase.from("dealers").insert({
        name: v.name, contact_number: v.contact_number || null, email: v.email || null,
        address: v.address || null, notes: v.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dealers-with-balances"] }); toast.success("Dealer added"); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = dealers.filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()) || (d.contact_number ?? "").includes(search));
  const totalOutstanding = dealers.reduce((s, d) => s + d.remaining, 0);
  const totalSales = dealers.reduce((s, d) => s + d.total, 0);

  const COLORS = ["#6366f1", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Dealers
          </h1>
          <p className="text-sm text-muted-foreground">{dealers.length} dealer(s) · {formatPKR(totalOutstanding)} outstanding</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-md shadow-primary/25"><Plus className="h-4 w-4" /> Add Dealer</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <AddDealerForm onSubmit={v => add.mutate(v)} busy={add.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 text-white">
            <div className="text-2xl font-bold">{dealers.length}</div>
            <div className="text-sm text-white/80">Total Dealers</div>
          </div>
        </Card>
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white">
            <div className="text-xl font-bold truncate">{formatPKR(totalSales)}</div>
            <div className="text-sm text-white/80">Total Sales</div>
          </div>
        </Card>
        <Card className="border-0 shadow-md overflow-hidden col-span-2 md:col-span-1">
          <div className="bg-gradient-to-br from-orange-500 to-red-500 p-4 text-white">
            <div className="text-xl font-bold truncate">{formatPKR(totalOutstanding)}</div>
            <div className="text-sm text-white/80">Outstanding</div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search dealers by name or contact…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Dealer cards grid */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Card key={i} className="h-40 animate-pulse bg-muted border-0" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No dealers found</p>
            <Button variant="outline" className="mt-3" onClick={() => setOpen(true)}>Add first dealer</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((d, i) => {
            const pct = d.total > 0 ? Math.round(d.received / d.total * 100) : 100;
            const color = COLORS[i % COLORS.length];
            return (
              <Link key={d.id} to="/dealers/$id" params={{ id: d.id }}>
                <Card className="shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 cursor-pointer overflow-hidden border-0">
                  <div className="h-1.5" style={{ background: color }} />
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-md"
                        style={{ background: color }}>
                        {d.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">{d.name}</div>
                        <div className="space-y-0.5 mt-1">
                          {d.contact_number && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" /> {d.contact_number}
                            </div>
                          )}
                          {d.email && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" /> {d.email}
                            </div>
                          )}
                          {d.address && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" /> {d.address}
                            </div>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Payment progress</span>
                        <span className="font-semibold">{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Total: <span className="font-semibold text-foreground">{formatPKR(d.total)}</span></span>
                        <span className={d.remaining > 0 ? "text-orange-600 font-bold" : "text-emerald-600 font-bold"}>
                          {d.remaining > 0 ? `-${formatPKR(d.remaining)}` : "✓ Settled"}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Outstanding summary table */}
      {dealers.filter(d => d.remaining > 0).length > 0 && (
        <Card className="shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-5 w-5 text-orange-500" /> Outstanding Balances
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase text-muted-foreground">Dealer</th>
                  <th className="px-4 py-3 text-right font-semibold text-xs uppercase text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-right font-semibold text-xs uppercase text-muted-foreground">Received</th>
                  <th className="px-4 py-3 text-right font-semibold text-xs uppercase text-muted-foreground">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {dealers.filter(d => d.remaining > 0).sort((a, b) => b.remaining - a.remaining).map(d => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link to="/dealers/$id" params={{ id: d.id }} className="font-semibold hover:underline hover:text-primary">{d.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPKR(d.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{formatPKR(d.received)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-orange-600">{formatPKR(d.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AddDealerForm({ onSubmit, busy }: { onSubmit: (v: any) => void; busy: boolean }) {
  const [v, setV] = useState({ name: "", contact_number: "", email: "", address: "", notes: "" });
  const set = (k: keyof typeof v, val: string) => setV(s => ({ ...s, [k]: val }));
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(v); }} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Add Dealer</DialogTitle>
      </DialogHeader>
      <div>
        <Label className="font-semibold">Dealer Name *</Label>
        <Input required value={v.name} onChange={e => set("name", e.target.value)} className="mt-1" placeholder="Business or person name" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="font-semibold">Phone</Label>
          <Input value={v.contact_number} onChange={e => set("contact_number", e.target.value)} className="mt-1" placeholder="+92 300 …" />
        </div>
        <div>
          <Label className="font-semibold">Email</Label>
          <Input type="email" value={v.email} onChange={e => set("email", e.target.value)} className="mt-1" placeholder="Optional" />
        </div>
      </div>
      <div>
        <Label className="font-semibold">Address</Label>
        <Input value={v.address} onChange={e => set("address", e.target.value)} className="mt-1" placeholder="Optional" />
      </div>
      <div>
        <Label className="font-semibold">Notes</Label>
        <Textarea value={v.notes} onChange={e => set("notes", e.target.value)} className="mt-1" rows={2} placeholder="Optional notes…" />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={busy} className="w-full gap-2 shadow-md shadow-primary/25">
          {busy ? "Adding…" : "Add Dealer"}
        </Button>
      </DialogFooter>
    </form>
  );
}
