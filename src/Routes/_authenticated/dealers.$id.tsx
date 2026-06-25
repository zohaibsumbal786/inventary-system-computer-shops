import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPKR, formatDate } from "@/lib/format";
import { ArrowLeft, Plus, Printer, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { downloadCSV, toCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/dealers/$id")({
  component: DealerDetail,
});

function DealerDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["dealer", id],
    queryFn: async () => {
      const [d, inv, pay] = await Promise.all([
        supabase.from("dealers").select("*").eq("id", id).single(),
        supabase.from("invoices").select("*, invoice_items(*, item:inventory_items(*))").eq("dealer_id", id).order("sale_date", { ascending: false }),
        supabase.from("payments").select("*").eq("dealer_id", id).order("payment_date", { ascending: false }),
      ]);
      if (d.error) throw d.error;
      if (inv.error) throw inv.error;
      if (pay.error) throw pay.error;
      return { dealer: d.data, invoices: inv.data, payments: pay.data };
    },
  });

  const addPay = useMutation({
    mutationFn: async (v: { amount: string; method: string; invoice_id: string; remarks: string }) => {
      const { error } = await supabase.from("payments").insert({
        dealer_id: id, amount: Number(v.amount), method: v.method,
        invoice_id: v.invoice_id === "__auto" ? null : v.invoice_id,
        remarks: v.remarks || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Payment recorded"); setPayOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return (
    <div className="flex items-center justify-center min-h-48">
      <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  const total = data.invoices.reduce((s, i) => s + Number(i.subtotal), 0);
  const received = data.invoices.reduce((s, i) => s + Number(i.amount_received), 0);
  const remaining = total - received;

  const exportStatement = () => {
    const rows: Record<string, unknown>[] = [];
    for (const inv of data.invoices) {
      for (const li of (inv as any).invoice_items) {
        rows.push({
          Date: formatDate(inv.sale_date),
          Invoice: inv.invoice_number,
          Tag: li.item?.tag_code ?? "",
          Category: li.item?.category ?? "",
          Brand: li.item?.brand ?? "",
          Model: li.item?.model_name ?? "",
          RAM: li.item?.ram ?? "",
          Storage: li.item?.storage ?? "",
          Screen: li.item?.screen_size ?? "",
          Qty: li.quantity,
          UnitPrice: Number(li.unit_price),
          LineTotal: Number(li.line_total),
          InvoiceTotal: Number(inv.subtotal),
          InvoiceReceived: Number(inv.amount_received),
          InvoiceRemaining: Number(inv.subtotal) - Number(inv.amount_received),
          Status: inv.status,
        });
      }
    }
    for (const p of data.payments) {
      rows.push({
        Date: formatDate(p.payment_date),
        Invoice: "PAYMENT",
        Tag: "",
        Category: "",
        Brand: "",
        Model: `Payment via ${p.method}`,
        RAM: "",
        Storage: "",
        Screen: "",
        Qty: "",
        UnitPrice: "",
        LineTotal: "",
        InvoiceTotal: "",
        InvoiceReceived: Number(p.amount),
        InvoiceRemaining: "",
        Status: p.remarks ?? "",
      });
    }
    const slug = data.dealer.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadCSV(`statement-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/dealers"><Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">{data.dealer.name}</h1>
            <p className="text-sm text-muted-foreground">{data.dealer.contact_number ?? "—"} · {data.dealer.email ?? "—"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportStatement}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
          <Dialog open={payOpen} onOpenChange={setPayOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Record Payment</Button></DialogTrigger>
            <DialogContent><PaymentForm invoices={data.invoices} onSubmit={(v) => addPay.mutate(v)} busy={addPay.isPending} /></DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Total Business" value={formatPKR(total)} />
        <SummaryCard label="Received" value={formatPKR(received)} tone="success" />
        <SummaryCard label="Remaining" value={formatPKR(remaining)} tone={remaining > 0 ? "destructive" : "success"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Ledger</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground bg-muted/30 border-b">
              <tr>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Invoice</th>
                <th className="px-2 py-2 text-left">Category</th>
                <th className="px-2 py-2 text-left">Brand</th>
                <th className="px-2 py-2 text-left">Model</th>
                <th className="px-2 py-2 text-left">RAM</th>
                <th className="px-2 py-2 text-left">Storage</th>
                <th className="px-2 py-2 text-left">Screen</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Unit</th>
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-right">Received</th>
                <th className="px-2 py-2 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.flatMap((inv) =>
                inv.invoice_items.map((li, idx) => {
                  const remain = idx === 0 ? Number(inv.subtotal) - Number(inv.amount_received) : null;
                  const rec = idx === 0 ? Number(inv.amount_received) : null;
                  const tot = idx === 0 ? Number(inv.subtotal) : null;
                  return (
                    <tr key={li.id} className="border-b last:border-0">
                      <td className="px-2 py-1.5">{idx === 0 ? formatDate(inv.sale_date) : ""}</td>
                      <td className="px-2 py-1.5 font-mono">
                        {idx === 0 ? (
                          <Link to="/sales/$id" params={{ id: inv.id }} className="text-primary hover:underline">{inv.invoice_number}</Link>
                        ) : ""}
                      </td>
                      <td className="px-2 py-1.5">{li.item?.category}</td>
                      <td className="px-2 py-1.5">{li.item?.brand}</td>
                      <td className="px-2 py-1.5">{li.item?.model_name}</td>
                      <td className="px-2 py-1.5">{li.item?.ram}</td>
                      <td className="px-2 py-1.5">{li.item?.storage}</td>
                      <td className="px-2 py-1.5">{li.item?.screen_size}</td>
                      <td className="px-2 py-1.5 text-right">{li.quantity}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatPKR(li.unit_price)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{tot !== null ? formatPKR(tot) : ""}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{rec !== null ? formatPKR(rec) : ""}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${remain !== null && remain > 0 ? "text-destructive" : "text-success"}`}>{remain !== null ? formatPKR(remain) : ""}</td>
                    </tr>
                  );
                })
              )}
              {data.invoices.length === 0 && (
                <tr><td colSpan={13} className="py-8 text-center text-muted-foreground">No invoices yet</td></tr>
              )}
            </tbody>
            {data.invoices.length > 0 && (
              <tfoot className="font-semibold bg-muted/40">
                <tr>
                  <td colSpan={10} className="px-2 py-2 text-right">Totals</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatPKR(total)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatPKR(received)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${remaining > 0 ? "text-destructive" : "text-success"}`}>{formatPKR(remaining)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground bg-muted/30 border-b">
              <tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Method</th><th className="px-3 py-2 text-left">Remarks</th><th className="px-3 py-2 text-right">Amount</th></tr>
            </thead>
            <tbody>
              {data.payments.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No payments</td></tr>}
              {data.payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{formatDate(p.payment_date)}</td>
                  <td className="px-3 py-2 capitalize">{p.method}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.remarks ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-success">{formatPKR(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "destructive" }) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "";
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </CardContent></Card>
  );
}

function PaymentForm({ invoices, onSubmit, busy }: { invoices: any[]; onSubmit: (v: any) => void; busy: boolean }) {
  const [v, setV] = useState({ amount: "", method: "cash", invoice_id: "__auto", remarks: "" });
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(v); }} className="space-y-3">
      <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
      <div><Label>Amount (PKR) *</Label><Input required type="number" step="0.01" value={v.amount} onChange={(e) => set("amount", e.target.value)} /></div>
      <div>
        <Label>Method</Label>
        <Select value={v.method} onValueChange={(x) => set("method", x)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent>
        </Select>
      </div>
      <div>
        <Label>Apply To</Label>
        <Select value={v.invoice_id} onValueChange={(x) => set("invoice_id", x)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto">Auto (oldest unpaid first)</SelectItem>
            {invoices.filter((i) => Number(i.amount_received) < Number(i.subtotal)).map((i) => (
              <SelectItem key={i.id} value={i.id}>{i.invoice_number} · remaining {formatPKR(Number(i.subtotal) - Number(i.amount_received))}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Remarks</Label><Input value={v.remarks} onChange={(e) => set("remarks", e.target.value)} /></div>
      <DialogFooter><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Record"}</Button></DialogFooter>
    </form>
  );
}
