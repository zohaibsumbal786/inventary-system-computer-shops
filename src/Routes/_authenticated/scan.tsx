import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Camera, X, ScanLine, Plus, Trash2, RotateCcw,
  AlertTriangle, ShoppingCart, Package, Receipt, CheckCircle2,
} from "lucide-react";
import { formatPKR, formatDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/scan")({
  component: ScanPage,
});

type Item = {
  id: string; tag_code: string; brand: string | null; model_name: string | null;
  ram: string | null; storage: string | null; screen_size: string | null;
  status: string; unit_sale_price: number;
  invoice_items?: { invoice: { id: string; invoice_number: string; sale_date: string; dealer: { name: string } | null } | null }[];
};
type LookupError = { kind: "not_found" | "sold" | "reserved" | "error"; tag: string; message: string; item?: Item };

function ScanPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [scanned, setScanned] = useState<Map<string, { item: Item; price: number }>>(new Map());
  const [lookupError, setLookupError] = useState<LookupError | null>(null);
  const [dealerId, setDealerId] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [remarks, setRemarks] = useState("");
  const [newDealerName, setNewDealerName] = useState("");
  const [newDealerContact, setNewDealerContact] = useState("");
  const [cameraOn, setCameraOn] = useState(false);

  const { data: dealers = [] } = useQuery({
    queryKey: ["dealers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dealers").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => { inputRef.current?.focus(); }, []);

  const focusInput = () => { setCode(""); setLookupError(null); setTimeout(() => inputRef.current?.focus(), 0); };

  const lookup = async (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    setLookupError(null);

    const { data, error } = await supabase
      .from("inventory_items")
      .select("id,tag_code,brand,model_name,ram,storage,screen_size,status,unit_sale_price,invoice_items(invoice:invoices(id,invoice_number,sale_date,dealer:dealers(name)))")
      .eq("tag_code", tag)
      .maybeSingle();

    if (error) {
      setLookupError({ kind: "error", tag, message: error.message });
      toast.error(error.message);
      setCode(""); return;
    }
    if (!data) {
      setLookupError({ kind: "not_found", tag, message: `No item found for tag "${tag}". Check the label.` });
      toast.error(`Tag ${tag} not found`);
      setCode(""); return;
    }

    const item = data as unknown as Item;
    if (item.status === "sold") {
      setLookupError({ kind: "sold", tag, message: "This item is already sold.", item });
      toast.warning(`${item.tag_code} already sold`);
      setCode(""); return;
    }
    if (item.status === "reserved") {
      setLookupError({ kind: "reserved", tag, message: "This item is reserved.", item });
      toast.warning(`${item.tag_code} is reserved`);
      setCode(""); return;
    }

    setScanned(m => {
      if (m.has(item.id)) { toast.info("Already in cart"); return m; }
      const n = new Map(m);
      n.set(item.id, { item, price: Number(item.unit_sale_price) });
      toast.success(`✓ Added ${item.tag_code}`);
      return n;
    });
    setCode("");
  };

  useEffect(() => {
    if (!cameraOn) return;
    let scanner: any; let cancelled = false;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      scanner = new Html5Qrcode("qr-reader");
      try {
        await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 },
          (decoded: string) => { lookup(decoded); }, () => {});
      } catch {
        toast.error("Camera unavailable. Use USB scanner or type the tag.");
        setCameraOn(false);
      }
    })();
    return () => { cancelled = true; if (scanner?.isScanning) scanner.stop().catch(() => {}); };
  }, [cameraOn]);

  const removeFromCart = (id: string) => setScanned(m => { const n = new Map(m); n.delete(id); return n; });
  const updatePrice = (id: string, price: number) =>
    setScanned(m => { const n = new Map(m); const e = n.get(id); if (e) n.set(id, { ...e, price }); return n; });

  const subtotal = Array.from(scanned.values()).reduce((s, x) => s + x.price, 0);
  const received = Number(amountReceived) || 0;
  const remaining = Math.max(0, subtotal - received);

  const createSale = useMutation({
    mutationFn: async () => {
      let did = dealerId;
      if (did === "__new") {
        if (!newDealerName.trim()) throw new Error("Enter dealer name");
        const { data, error } = await supabase.from("dealers")
          .insert({ name: newDealerName.trim(), contact_number: newDealerContact || null })
          .select("id").single();
        if (error) throw error;
        did = data.id;
      }
      if (!did) throw new Error("Select a dealer first");
      const ids = Array.from(scanned.keys());
      const prices = Array.from(scanned.values()).map(x => x.price);
      const { data, error } = await supabase.rpc("create_sale", {
        _dealer_id: did, _item_ids: ids, _unit_prices: prices,
        _amount_received: received, _remarks: remarks || "",
      } as any);
      if (error) throw error;
      return data as string;
    },
    onSuccess: (invoiceId) => {
      toast.success("✅ Sale recorded successfully!");
      setScanned(new Map());
      setAmountReceived(""); setRemarks(""); setDealerId("");
      setNewDealerName(""); setNewDealerContact("");
      qc.invalidateQueries();
      if (invoiceId) router.navigate({ to: "/sales/$id", params: { id: invoiceId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cartItems = Array.from(scanned.values());

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScanLine className="h-6 w-6 text-primary" /> Scan & Sell
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Scan QR/barcode tags to build a sale</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Left: Scanner + Cart */}
        <div className="lg:col-span-3 space-y-4">
          {/* Scanner input */}
          <Card className="shadow-md border-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ScanLine className="h-5 w-5 text-primary" /> Scan Tag
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <form onSubmit={e => { e.preventDefault(); lookup(code); }} className="flex gap-2">
                <div className="relative flex-1">
                  <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    ref={inputRef} value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder="Scan or type tag code (e.g. INV-00001)…"
                    className="pl-10 h-12 text-base font-mono"
                    autoFocus
                  />
                </div>
                <Button type="submit" className="h-12 px-5 shadow-md shadow-primary/25">Look up</Button>
                <Button type="button" variant={cameraOn ? "destructive" : "outline"} className="h-12 px-4"
                  onClick={() => setCameraOn(c => !c)}>
                  {cameraOn ? <X className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
                </Button>
              </form>
              {cameraOn && (
                <div id="qr-reader" className="rounded-xl overflow-hidden bg-black mx-auto max-w-sm aspect-square" />
              )}
            </CardContent>
          </Card>

          {/* Lookup error */}
          {lookupError && (
            <Card className="border-0 shadow-md overflow-hidden">
              <div className={`h-1 ${lookupError.kind === "not_found" ? "bg-red-500" : lookupError.kind === "sold" ? "bg-purple-500" : "bg-orange-500"}`} />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">
                      {lookupError.kind === "not_found" && "Tag not found"}
                      {lookupError.kind === "sold" && "Already sold"}
                      {lookupError.kind === "reserved" && "Item reserved"}
                      {lookupError.kind === "error" && "Lookup failed"}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{lookupError.message}</div>
                    {lookupError.item && (
                      <div className="text-sm mt-1 font-medium">{lookupError.item.brand} {lookupError.item.model_name}</div>
                    )}
                    {lookupError.item?.invoice_items?.[0]?.invoice && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Sold {formatDate(lookupError.item.invoice_items[0].invoice.sale_date)} ·{" "}
                        <span className="font-mono">{lookupError.item.invoice_items[0].invoice.invoice_number}</span>
                        {lookupError.item.invoice_items[0].invoice.dealer?.name && ` · ${lookupError.item.invoice_items[0].invoice.dealer.name}`}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={focusInput} className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" /> Scan another
                  </Button>
                  {lookupError.item?.invoice_items?.[0]?.invoice?.id && (
                    <Button size="sm" variant="ghost" className="text-primary"
                      onClick={() => router.navigate({ to: "/sales/$id", params: { id: lookupError.item!.invoice_items![0]!.invoice!.id } })}>
                      View invoice →
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cart */}
          <Card className="shadow-md border-0">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="h-5 w-5 text-primary" /> Cart
                {cartItems.length > 0 && (
                  <Badge className="bg-primary text-white">{cartItems.length}</Badge>
                )}
              </CardTitle>
              <div className="text-xl font-bold text-primary">{formatPKR(subtotal)}</div>
            </CardHeader>
            <CardContent>
              {cartItems.length === 0 ? (
                <div className="py-10 text-center">
                  <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Scan items to add them here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cartItems.map(({ item, price }) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs font-bold text-primary">{item.tag_code}</div>
                        <div className="font-semibold text-sm truncate">{item.brand} {item.model_name}</div>
                        <div className="text-xs text-muted-foreground">{[item.ram, item.storage, item.screen_size].filter(Boolean).join(" · ")}</div>
                      </div>
                      <div className="w-32 shrink-0">
                        <Input
                          type="number" step="0.01" value={price}
                          onChange={e => updatePrice(item.id, Number(e.target.value))}
                          className="text-right font-semibold"
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeFromCart(item.id)}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Checkout panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card className={`shadow-md border-0 ${cartItems.length === 0 ? "opacity-60" : ""}`}>
            <div className="bg-gradient-to-br from-primary to-indigo-600 p-5 text-white rounded-t-xl">
              <div className="flex items-center gap-2 mb-4">
                <Receipt className="h-5 w-5" />
                <span className="font-bold">Checkout</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/70">Items</span>
                  <span className="font-semibold">{cartItems.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Subtotal</span>
                  <span className="font-bold text-base">{formatPKR(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Received</span>
                  <span className="font-semibold text-emerald-300">{formatPKR(received)}</span>
                </div>
                <div className="border-t border-white/20 pt-2 flex justify-between">
                  <span className="text-white/70">Remaining</span>
                  <span className={`font-bold text-lg ${remaining > 0 ? "text-orange-300" : "text-emerald-300"}`}>
                    {remaining > 0 ? formatPKR(remaining) : "✓ Paid"}
                  </span>
                </div>
              </div>
            </div>

            <CardContent className="p-4 space-y-4">
              {/* Dealer */}
              <div>
                <Label className="font-semibold text-sm">Dealer / Client *</Label>
                <Select value={dealerId} onValueChange={setDealerId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select dealer…" />
                  </SelectTrigger>
                  <SelectContent>
                    {dealers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    <SelectItem value="__new">
                      <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Add new dealer</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {dealerId === "__new" && (
                <div className="space-y-2 p-3 rounded-xl bg-muted/30 border">
                  <Label className="font-semibold text-xs uppercase text-muted-foreground">New Dealer</Label>
                  <Input placeholder="Dealer name *" value={newDealerName} onChange={e => setNewDealerName(e.target.value)} />
                  <Input placeholder="Contact number" value={newDealerContact} onChange={e => setNewDealerContact(e.target.value)} />
                </div>
              )}

              {/* Amount received */}
              <div>
                <Label className="font-semibold text-sm">Amount Received (PKR)</Label>
                <Input
                  type="number" step="0.01" className="mt-1"
                  value={amountReceived}
                  onChange={e => setAmountReceived(e.target.value)}
                  placeholder="0 = full credit"
                />
                {subtotal > 0 && (
                  <div className="flex gap-2 mt-2">
                    <Button type="button" size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => setAmountReceived(subtotal.toString())}>
                      Full ({formatPKR(subtotal)})
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => setAmountReceived((subtotal / 2).toFixed(0))}>
                      Half
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => setAmountReceived("0")}>
                      Credit
                    </Button>
                  </div>
                )}
              </div>

              {/* Remarks */}
              <div>
                <Label className="font-semibold text-sm">Remarks</Label>
                <Input className="mt-1" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional note…" />
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <Button
                  className="w-full h-11 gap-2 text-base shadow-lg shadow-primary/30"
                  onClick={() => createSale.mutate()}
                  disabled={createSale.isPending || cartItems.length === 0}
                >
                  {createSale.isPending ? (
                    <><div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Processing…</>
                  ) : (
                    <><CheckCircle2 className="h-5 w-5" /> Complete Sale · {formatPKR(subtotal)}</>
                  )}
                </Button>
                {cartItems.length > 0 && (
                  <Button variant="ghost" className="w-full text-sm text-muted-foreground" onClick={() => setScanned(new Map())}>
                    Clear cart
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
