import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Printer, Search, QrCode, Package, Filter, X } from "lucide-react";
import { formatPKR } from "@/lib/format";
import { toast } from "sonner";
import { makeQrDataUrl } from "@/lib/qr";

export const Route = createFileRoute("/_authenticated/inventory")({
  component: InventoryPage,
});

const CATEGORIES = ["Laptop", "Desktop", "Accessory", "Other"];

type PrintLabel = { tag_code: string; brand: string | null; model_name: string | null; qr: string };

const STATUS_STYLES: Record<string, string> = {
  in_stock: "bg-emerald-100 text-emerald-700 border-emerald-200",
  sold:     "bg-purple-100 text-purple-700 border-purple-200",
  reserved: "bg-orange-100 text-orange-700 border-orange-200",
};

function InventoryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printItems, setPrintItems] = useState<PrintLabel[] | null>(null);
  const [printing, setPrinting] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items").select("*").order("date_added", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = items.filter((i) => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!`${i.tag_code} ${i.brand} ${i.model_name} ${i.serial_number ?? ""}`.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const inStock  = items.filter(i => i.status === "in_stock").length;
  const sold     = items.filter(i => i.status === "sold").length;
  const reserved = items.filter(i => i.status === "reserved").length;

  const allFilteredSelected = filtered.length > 0 && filtered.every(i => selected.has(i.id));
  const toggleAll = () => setSelected(s => {
    const n = new Set(s);
    allFilteredSelected ? filtered.forEach(i => n.delete(i.id)) : filtered.forEach(i => n.add(i.id));
    return n;
  });
  const toggleOne = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const addItem = useMutation({
    mutationFn: async (vals: Record<string, string>) => {
      const { data, error } = await supabase.rpc("add_inventory_batch", {
        _category: vals.category, _brand: vals.brand || "",
        _model_name: vals.model_name || "", _ram: vals.ram || "",
        _storage: vals.storage || "", _screen_size: vals.screen_size || "",
        _description: vals.description || "", _serial_number: vals.serial_number || "",
        _unit_cost_price: Number(vals.unit_cost_price) || 0,
        _unit_sale_price: Number(vals.unit_sale_price) || 0,
        _photo_url: vals.photo_url || "", _quantity: Number(vals.quantity) || 1,
      } as any);
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: async (rows) => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`✅ Added ${rows.length} item(s)`);
      setOpen(false);
      const withQr = await Promise.all(rows.map(async (r: any) => ({
        tag_code: r.tag_code, brand: r.brand, model_name: r.model_name,
        qr: await makeQrDataUrl(r.tag_code),
      })));
      setPrintItems(withQr);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const printSelected = async () => {
    const chosen = items.filter(i => selected.has(i.id));
    if (!chosen.length) return;
    setPrinting(true);
    try {
      const labels = await Promise.all(chosen.map(async (it) => ({
        tag_code: it.tag_code, brand: it.brand, model_name: it.model_name,
        qr: await makeQrDataUrl(it.tag_code),
      })));
      setPrintItems(labels);
    } finally { setPrinting(false); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" /> Inventory
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} items shown{selected.size > 0 ? ` · ${selected.size} selected` : ""}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.size > 0 && (
            <>
              <Button variant="outline" onClick={printSelected} disabled={printing} className="gap-2">
                <QrCode className="h-4 w-4" /> {printing ? "Preparing…" : `Print ${selected.size} Label${selected.size > 1 ? "s" : ""}`}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="gap-1">
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            </>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-md shadow-primary/25">
                <Plus className="h-4 w-4" /> Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <AddItemForm onSubmit={(v) => addItem.mutate(v)} busy={addItem.isPending} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "In Stock", count: inStock, color: "from-emerald-500 to-teal-600" },
          { label: "Sold", count: sold, color: "from-purple-500 to-indigo-600" },
          { label: "Reserved", count: reserved, color: "from-orange-500 to-amber-600" },
        ].map(s => (
          <Card key={s.label} className="overflow-hidden border-0 shadow-sm cursor-pointer"
            onClick={() => setStatusFilter(s.label.toLowerCase().replace(" ", "_") === statusFilter ? "all" : s.label.toLowerCase().replace(" ", "_"))}>
            <div className={`bg-gradient-to-br ${s.color} p-4 text-white`}>
              <div className="text-2xl font-bold">{s.count}</div>
              <div className="text-sm text-white/80">{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[220px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search tag, brand, model, serial…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in_stock">In Stock</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="reserved">Reserved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 w-10">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} />
                </th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Tag</th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Category</th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Brand / Model</th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground hidden md:table-cell">Specs</th>
                <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground">Cost</th>
                <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground">Sale Price</th>
                <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wide text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    Loading inventory…
                  </div>
                </td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} className="py-16 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-muted-foreground">No items found</p>
                </td></tr>
              )}
              {filtered.map((it) => (
                <tr key={it.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggleOne(it.id)} />
                  </td>
                  <td className="px-4 py-3">
                    <Link to="/inventory/$id" params={{ id: it.id }} className="font-mono text-xs font-bold text-primary hover:underline">
                      {it.tag_code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{it.category}</td>
                  <td className="px-4 py-3">
                    <Link to="/inventory/$id" params={{ id: it.id }} className="font-semibold hover:underline hover:text-primary transition-colors">
                      {it.brand} {it.model_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                    {[it.ram, it.storage, it.screen_size].filter(Boolean).join(" · ")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-sm">{formatPKR(it.unit_cost_price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-sm">{formatPKR(it.unit_sale_price)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="outline" className={`text-xs ${STATUS_STYLES[it.status] ?? ""}`}>
                      {it.status.replace("_", " ")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Print labels dialog */}
      <Dialog open={!!printItems} onOpenChange={o => !o && setPrintItems(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Labels ({printItems?.length ?? 0})</DialogTitle></DialogHeader>
          <div id="print-area" className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-2">
            {printItems?.map(p => (
              <div key={p.tag_code} className="border-2 rounded-xl p-4 text-center shadow-sm">
                <img src={p.qr} alt={p.tag_code} className="mx-auto h-28 w-28" />
                <div className="font-mono text-xs font-bold mt-2 text-primary">{p.tag_code}</div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{p.brand} {p.model_name}</div>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPrintItems(null)}>Close</Button>
            <Button onClick={() => window.print()} className="gap-2">
              <Printer className="h-4 w-4" /> Print Labels
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddItemForm({ onSubmit, busy }: { onSubmit: (v: Record<string, string>) => void; busy: boolean }) {
  const [v, setV] = useState<Record<string, string>>({
    category: "Laptop", brand: "", model_name: "", ram: "", storage: "",
    screen_size: "", description: "", serial_number: "",
    unit_cost_price: "", unit_sale_price: "", photo_url: "", quantity: "1",
  });
  const set = (k: string, val: string) => setV(s => ({ ...s, [k]: val }));
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(v); }} className="space-y-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <Package className="h-5 w-5 text-primary" /> Add Inventory Item
        </DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-semibold">Category *</Label>
            <Select value={v.category} onValueChange={x => set("category", x)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm font-semibold">Quantity</Label>
            <Input type="number" min={1} value={v.quantity} onChange={e => set("quantity", e.target.value)} className="mt-1" placeholder="1" />
          </div>
        </div>
        <div>
          <Label className="text-sm font-semibold">Brand</Label>
          <Input value={v.brand} onChange={e => set("brand", e.target.value)} className="mt-1" placeholder="e.g. Dell, HP, Lenovo" />
        </div>
        <div>
          <Label className="text-sm font-semibold">Model / Item Name *</Label>
          <Input value={v.model_name} onChange={e => set("model_name", e.target.value)} className="mt-1" placeholder="e.g. Latitude 5520" />
        </div>
        <div>
          <Label className="text-sm font-semibold">RAM</Label>
          <Input value={v.ram} onChange={e => set("ram", e.target.value)} className="mt-1" placeholder="e.g. 16GB DDR4" />
        </div>
        <div>
          <Label className="text-sm font-semibold">Storage</Label>
          <Input value={v.storage} onChange={e => set("storage", e.target.value)} className="mt-1" placeholder="e.g. 512GB SSD" />
        </div>
        <div>
          <Label className="text-sm font-semibold">Screen Size</Label>
          <Input value={v.screen_size} onChange={e => set("screen_size", e.target.value)} className="mt-1" placeholder='e.g. 15.6"' />
        </div>
        <div>
          <Label className="text-sm font-semibold">Serial Number</Label>
          <Input value={v.serial_number} onChange={e => set("serial_number", e.target.value)} className="mt-1" placeholder="Optional" />
        </div>
        <div>
          <Label className="text-sm font-semibold">Cost Price (PKR) *</Label>
          <Input type="number" step="0.01" value={v.unit_cost_price} onChange={e => set("unit_cost_price", e.target.value)} className="mt-1" placeholder="0.00" />
        </div>
        <div>
          <Label className="text-sm font-semibold">Sale Price (PKR) *</Label>
          <Input type="number" step="0.01" value={v.unit_sale_price} onChange={e => set("unit_sale_price", e.target.value)} className="mt-1" placeholder="0.00" />
        </div>
        <div className="col-span-2">
          <Label className="text-sm font-semibold">Photo URL</Label>
          <Input value={v.photo_url} onChange={e => set("photo_url", e.target.value)} className="mt-1" placeholder="https://..." />
        </div>
        <div className="col-span-2">
          <Label className="text-sm font-semibold">Description</Label>
          <Textarea value={v.description} onChange={e => set("description", e.target.value)} className="mt-1" rows={3} placeholder="Additional details…" />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={busy} className="w-full sm:w-auto gap-2 shadow-md shadow-primary/25">
          {busy ? "Adding…" : "Add & Generate QR Tags"}
        </Button>
      </DialogFooter>
    </form>
  );
}
