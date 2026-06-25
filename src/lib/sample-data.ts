import { supabase } from "@/integrations/supabase/client";

const DEALERS = [
  { name: "Bismillah Computers", contact_number: "0300-1234567", email: "bismillah@example.pk", address: "Hall Road, Lahore" },
  { name: "Tech Galaxy Traders", contact_number: "0321-9876543", email: "galaxy@example.pk", address: "Saddar, Karachi" },
  { name: "City Laptop House", contact_number: "0345-5551122", email: "city@example.pk", address: "Blue Area, Islamabad" },
];

const ITEMS = [
  { category: "Laptop", brand: "Dell", model_name: "Latitude 7420", ram: "16GB", storage: "512GB SSD", screen_size: "14\"", cost: 95000, sale: 125000, qty: 4 },
  { category: "Laptop", brand: "HP", model_name: "EliteBook 840 G8", ram: "16GB", storage: "256GB SSD", screen_size: "14\"", cost: 88000, sale: 115000, qty: 3 },
  { category: "Laptop", brand: "Lenovo", model_name: "ThinkPad T14", ram: "8GB", storage: "256GB SSD", screen_size: "14\"", cost: 70000, sale: 92000, qty: 5 },
  { category: "Desktop", brand: "HP", model_name: "ProDesk 600 G6", ram: "16GB", storage: "512GB SSD", screen_size: "—", cost: 65000, sale: 85000, qty: 2 },
  { category: "Accessory", brand: "Logitech", model_name: "MX Master 3", ram: "", storage: "", screen_size: "", cost: 8500, sale: 12000, qty: 6 },
];

export type SeedProgress = (msg: string) => void;

export async function generateSampleData(onProgress?: SeedProgress) {
  const log = (m: string) => onProgress?.(m);

  // 1. Dealers
  log("Creating dealers…");
  const dealerIds: string[] = [];
  for (const d of DEALERS) {
    const { data, error } = await supabase
      .from("dealers")
      .insert(d)
      .select("id")
      .single();
    if (error) throw new Error(`Dealer ${d.name}: ${error.message}`);
    dealerIds.push(data.id);
  }

  // 2. Inventory (batched per model)
  log("Adding inventory…");
  const allItemIds: { id: string; sale: number }[] = [];
  for (const it of ITEMS) {
    const { data, error } = await supabase.rpc("add_inventory_batch", {
      _category: it.category,
      _brand: it.brand,
      _model_name: it.model_name,
      _ram: it.ram,
      _storage: it.storage,
      _screen_size: it.screen_size,
      _description: "",
      _serial_number: "",
      _unit_cost_price: it.cost,
      _unit_sale_price: it.sale,
      _photo_url: "",
      _quantity: it.qty,
    } as never);
    if (error) throw new Error(`Inventory ${it.model_name}: ${error.message}`);
    for (const row of (data ?? []) as { id: string }[]) {
      allItemIds.push({ id: row.id, sale: it.sale });
    }
  }

  // 3. Sales — sell ~half the stock across the dealers
  log("Creating sample sales…");
  const sellable = allItemIds.slice(0, Math.ceil(allItemIds.length / 2));
  // chunk into 3 invoices
  const chunks: { id: string; sale: number }[][] = [[], [], []];
  sellable.forEach((it, i) => chunks[i % 3].push(it));

  const invoiceIds: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.length === 0) continue;
    const subtotal = chunk.reduce((s, x) => s + x.sale, 0);
    // first invoice fully paid, second partial, third unpaid
    const received = i === 0 ? subtotal : i === 1 ? Math.floor(subtotal / 2) : 0;
    const { data, error } = await supabase.rpc("create_sale", {
      _dealer_id: dealerIds[i % dealerIds.length],
      _item_ids: chunk.map((x) => x.id),
      _unit_prices: chunk.map((x) => x.sale),
      _amount_received: received,
      _remarks: "Sample sale",
    } as never);
    if (error) throw new Error(`Sale ${i + 1}: ${error.message}`);
    if (data) invoiceIds.push(data as string);
  }

  // 4. Extra cash payment for dealer 0
  log("Recording sample payments…");
  await supabase.from("payments").insert({
    dealer_id: dealerIds[2],
    amount: 25000,
    method: "cash",
    remarks: "Partial cash on account",
  });

  log("Done.");
  return { dealers: dealerIds.length, items: allItemIds.length, invoices: invoiceIds.length };
}
