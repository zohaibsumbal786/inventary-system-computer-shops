import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";
import { formatPKR, formatDate } from "@/lib/format";
import { makeQrDataUrl } from "@/lib/qr";

export const Route = createFileRoute("/_authenticated/sales/$id")({
  component: InvoicePage,
});

function InvoicePage() {
  const { id } = Route.useParams();
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const [inv, shop] = await Promise.all([
        supabase
          .from("invoices")
          .select("*, dealer:dealers(name, contact_number, address, email), invoice_items(*, item:inventory_items(tag_code, brand, model_name, category, ram, storage, screen_size, serial_number))")
          .eq("id", id)
          .single(),
        supabase.from("shop_settings").select("*").eq("id", 1).maybeSingle(),
      ]);
      if (inv.error) throw inv.error;
      return { invoice: inv.data, shop: shop.data };
    },
  });

  useEffect(() => {
    if (!data) return;
    (async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        data.invoice.invoice_items.map(async (li: any) => {
          if (li.item?.tag_code) map[li.item.tag_code] = await makeQrDataUrl(li.item.tag_code);
        })
      );
      setQrMap(map);
    })();
  }, [data]);

  if (isLoading || !data) return (
    <div className="flex items-center justify-center min-h-48">
      <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  const inv = data.invoice;
  const shop = data.shop;
  const remaining = Number(inv.subtotal) - Number(inv.amount_received);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/sales"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button></Link>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
      </div>

      <Card className="print:shadow-none print:border-0">
        <CardContent className="p-8 space-y-6 print:p-4">
          {/* Header */}
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h1 className="text-2xl font-bold">{shop?.shop_name || "TechStock"}</h1>
              {shop?.address && <div className="text-sm text-muted-foreground">{shop.address}</div>}
              {shop?.contact && <div className="text-sm text-muted-foreground">{shop.contact}</div>}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase text-muted-foreground">Invoice</div>
              <div className="font-mono font-bold">{inv.invoice_number}</div>
              <div className="text-sm text-muted-foreground mt-1">{formatDate(inv.sale_date)}</div>
            </div>
          </div>

          {/* Dealer */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Billed To</div>
              <div className="font-semibold">{inv.dealer?.name}</div>
              {inv.dealer?.contact_number && <div className="text-muted-foreground">{inv.dealer.contact_number}</div>}
              {inv.dealer?.address && <div className="text-muted-foreground">{inv.dealer.address}</div>}
              {inv.dealer?.email && <div className="text-muted-foreground">{inv.dealer.email}</div>}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase text-muted-foreground mb-1">Status</div>
              <div className="font-semibold capitalize">{inv.status}</div>
            </div>
          </div>

          {/* Items */}
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2">Tag</th>
                <th className="text-left py-2">Item</th>
                <th className="text-left py-2">Specs</th>
                <th className="text-right py-2">Qty</th>
                <th className="text-right py-2">Unit</th>
                <th className="text-right py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {inv.invoice_items.map((li: any) => (
                <tr key={li.id} className="border-b last:border-0">
                  <td className="py-2 align-top">
                    <div className="flex items-start gap-2">
                      {li.item?.tag_code && qrMap[li.item.tag_code] && (
                        <img src={qrMap[li.item.tag_code]} alt={li.item.tag_code} className="h-14 w-14" />
                      )}
                      <div className="font-mono text-[10px] mt-1">{li.item?.tag_code}</div>
                    </div>
                  </td>
                  <td className="py-2 align-top">
                    <div className="font-medium">{li.item?.brand} {li.item?.model_name}</div>
                    <div className="text-xs text-muted-foreground">{li.item?.category}</div>
                    {li.item?.serial_number && <div className="text-xs text-muted-foreground">S/N: {li.item.serial_number}</div>}
                  </td>
                  <td className="py-2 align-top text-xs text-muted-foreground">
                    {[li.item?.ram, li.item?.storage, li.item?.screen_size].filter(Boolean).join(" · ")}
                  </td>
                  <td className="py-2 align-top text-right">{li.quantity}</td>
                  <td className="py-2 align-top text-right tabular-nums">{formatPKR(li.unit_price)}</td>
                  <td className="py-2 align-top text-right tabular-nums">{formatPKR(li.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={5} className="text-right py-2">Subtotal</td><td className="text-right tabular-nums py-2">{formatPKR(inv.subtotal)}</td></tr>
              <tr><td colSpan={5} className="text-right py-1 text-success">Received</td><td className="text-right tabular-nums py-1 text-success">{formatPKR(inv.amount_received)}</td></tr>
              <tr className="font-bold text-base border-t">
                <td colSpan={5} className="text-right py-2">Balance Due</td>
                <td className={`text-right tabular-nums py-2 ${remaining > 0 ? "text-destructive" : "text-success"}`}>{formatPKR(remaining)}</td>
              </tr>
            </tfoot>
          </table>

          {inv.remarks && (
            <div className="text-sm border-t pt-3">
              <div className="text-xs uppercase text-muted-foreground">Remarks</div>
              <div>{inv.remarks}</div>
            </div>
          )}

          <div className="text-center text-xs text-muted-foreground pt-6 border-t">
            Thank you for your business.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
