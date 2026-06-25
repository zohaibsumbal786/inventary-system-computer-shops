import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPKR, formatDateTime, formatDate } from "@/lib/format";
import { makeQrDataUrl } from "@/lib/qr";
import { useEffect, useState } from "react";
import { ArrowLeft, Package, Tag, ShoppingCart, Banknote, FileText, Pencil, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventory/$id")({
  component: ItemDetailPage,
});

type ActivityRow = {
  id: string;
  action: string;
  created_at: string;
  details: Record<string, unknown> | null;
  performed_by: string | null;
  invoice_id: string | null;
  dealer_id: string | null;
};

function actionMeta(action: string) {
  switch (action) {
    case "added": return { icon: Package, color: "text-primary", label: "Added to inventory" };
    case "sold": return { icon: ShoppingCart, color: "text-success", label: "Sold" };
    case "invoice_created": return { icon: FileText, color: "text-primary", label: "Invoice created" };
    case "payment_received": return { icon: Banknote, color: "text-success", label: "Payment received" };
    case "status_changed": return { icon: AlertCircle, color: "text-warning", label: "Status changed" };
    case "price_updated": return { icon: Pencil, color: "text-warning", label: "Price updated" };
    default: return { icon: Tag, color: "text-muted-foreground", label: action.replace(/_/g, " ") };
  }
}

function ItemDetailPage() {
  const { id } = Route.useParams();
  const [qr, setQr] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["item", id],
    queryFn: async () => {
      const [item, line] = await Promise.all([
        supabase.from("inventory_items").select("*").eq("id", id).single(),
        supabase
          .from("invoice_items")
          .select("*, invoice:invoices(id, invoice_number, sale_date, subtotal, amount_received, status, remarks, dealer:dealers(id, name, contact_number))")
          .eq("inventory_item_id", id)
          .maybeSingle(),
      ]);
      if (item.error) throw item.error;

      // Activity log — may be restricted by RLS to own entries only; don't throw on permission errors
      const activity = await supabase
        .from("activity_log")
        .select("*")
        .eq("inventory_item_id", id)
        .order("created_at", { ascending: false });

      return {
        item: item.data,
        activity: (activity.data ?? []) as ActivityRow[],
        line: line.data,
      };
    },
  });

  useEffect(() => {
    if (data?.item.tag_code) makeQrDataUrl(data.item.tag_code).then(setQr);
  }, [data?.item.tag_code]);

  if (isLoading || !data) return (
    <div className="flex items-center justify-center min-h-48">
      <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  const item = data.item;
  const line = data.line;
  const invoice = (line as any)?.invoice;
  const remaining = invoice ? Number(invoice.subtotal) - Number(invoice.amount_received) : 0;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/inventory"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back to inventory</Button></Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}>Print label</Button>
      </div>

      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-[160px_1fr] gap-6">
          {qr && (
            <div className="text-center">
              <img src={qr} alt={item.tag_code} className="h-40 w-40 mx-auto border rounded-md p-2" />
              <div className="font-mono text-xs mt-2">{item.tag_code}</div>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">{item.brand} {item.model_name}</h1>
                <p className="text-sm text-muted-foreground">{item.category}</p>
              </div>
              <Badge variant={item.status === "in_stock" ? "default" : item.status === "sold" ? "secondary" : "outline"} className="capitalize">
                {item.status.replace("_", " ")}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm pt-2">
              <Spec k="RAM" v={item.ram} />
              <Spec k="Storage" v={item.storage} />
              <Spec k="Screen" v={item.screen_size} />
              <Spec k="Serial #" v={item.serial_number} />
              <Spec k="Cost" v={formatPKR(item.unit_cost_price)} />
              <Spec k="Sale" v={formatPKR(item.unit_sale_price)} />
              <Spec k="Added" v={formatDate(item.date_added)} />
            </div>
            {item.description && (
              <div className="text-sm pt-2 border-t mt-2">
                <div className="text-xs uppercase text-muted-foreground mb-1">Description</div>
                {item.description}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {invoice && (
        <Card>
          <CardHeader><CardTitle className="text-base">Sale</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Invoice</div>
                <Link to="/sales/$id" params={{ id: invoice.id }} className="font-mono text-primary hover:underline">
                  {invoice.invoice_number}
                </Link>
                <div className="text-xs text-muted-foreground">{formatDate(invoice.sale_date)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Dealer</div>
                <Link to="/dealers/$id" params={{ id: invoice.dealer?.id }} className="text-primary hover:underline">
                  {invoice.dealer?.name}
                </Link>
                <div className="text-xs text-muted-foreground">{invoice.dealer?.contact_number ?? "—"}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2 border-t">
              <div><div className="text-xs text-muted-foreground">Unit price</div><div className="font-semibold">{formatPKR(line!.unit_price)}</div></div>
              <div><div className="text-xs text-muted-foreground">Invoice received</div><div className="font-semibold text-success">{formatPKR(invoice.amount_received)}</div></div>
              <div><div className="text-xs text-muted-foreground">Invoice remaining</div><div className={`font-semibold ${remaining > 0 ? "text-destructive" : "text-success"}`}>{formatPKR(remaining)}</div></div>
            </div>
            <Badge variant={invoice.status === "paid" ? "default" : invoice.status === "partial" ? "secondary" : "destructive"} className="capitalize">
              {invoice.status}
            </Badge>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Activity Timeline</CardTitle></CardHeader>
        <CardContent>
          {data.activity.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">No activity yet</div>}
          <ol className="relative border-l-2 border-border ml-2 space-y-4 pl-6">
            {data.activity.map((a) => {
              const m = actionMeta(a.action);
              const Icon = m.icon;
              return (
                <li key={a.id} className="relative">
                  <span className={`absolute -left-[34px] top-0 h-7 w-7 rounded-full bg-background border-2 border-border flex items-center justify-center ${m.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="font-medium text-sm">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</div>
                  </div>
                  <DetailLine action={a.action} details={a.details} />
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function Spec({ k, v }: { k: string; v: string | number | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-medium">{v || "—"}</div>
    </div>
  );
}

function DetailLine({ action, details }: { action: string; details: Record<string, unknown> | null }) {
  if (!details) return null;
  if (action === "sold") {
    return (
      <div className="text-xs text-muted-foreground">
        Invoice {String(details.invoice_number ?? "")} · {formatPKR(Number(details.unit_price))}
      </div>
    );
  }
  if (action === "status_changed") {
    return <div className="text-xs text-muted-foreground">{String(details.from)} → <span className="font-medium">{String(details.to)}</span></div>;
  }
  if (action === "price_updated") {
    return (
      <div className="text-xs text-muted-foreground">
        Sale {formatPKR(Number(details.sale_from))} → {formatPKR(Number(details.sale_to))}
      </div>
    );
  }
  if (action === "added") {
    return <div className="text-xs text-muted-foreground">Tag {String(details.tag_code ?? "")}</div>;
  }
  return null;
}
