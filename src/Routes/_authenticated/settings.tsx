import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRole } from "@/hooks/use-auth";
import { Settings, ShieldCheck, User, Store, Sparkles, Save } from "lucide-react";
import { generateSampleData } from "@/lib/sample-data";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { role, isAdmin } = useRole();

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shop_settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ shop_name: "", address: "", contact: "", logo_url: "" });
  useEffect(() => {
    if (settings) setForm({
      shop_name: settings.shop_name ?? "", address: settings.address ?? "",
      contact: settings.contact ?? "", logo_url: settings.logo_url ?? "",
    });
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shop_settings").update({ ...form, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("✅ Settings saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [seedStatus, setSeedStatus] = useState("");
  const seed = useMutation({
    mutationFn: async () => { setSeedStatus(""); return generateSampleData(setSeedStatus); },
    onSuccess: (r) => { toast.success(`Seeded ${r.dealers} dealers, ${r.items} items, ${r.invoices} sales`); qc.invalidateQueries(); setSeedStatus(""); },
    onError: (e: Error) => { toast.error(e.message); setSeedStatus(""); },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your shop profile and preferences</p>
      </div>

      {/* Role card */}
      <Card className={`border-0 shadow-md overflow-hidden`}>
        <div className={`bg-gradient-to-br ${isAdmin ? "from-emerald-500 to-teal-600" : "from-blue-500 to-indigo-600"} p-5 text-white`}>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
              {isAdmin ? <ShieldCheck className="h-6 w-6" /> : <User className="h-6 w-6" />}
            </div>
            <div>
              <div className="font-bold text-lg capitalize">{role} Account</div>
              <div className="text-white/70 text-sm">
                {isAdmin ? "Full access — you can edit all settings and manage users" : "Full access to inventory, sales, dealers, and reports"}
              </div>
            </div>
            <Badge className="ml-auto bg-white/20 text-white border-white/30 capitalize">{role}</Badge>
          </div>
        </div>
      </Card>

      {/* Shop info */}
      <Card className="shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" /> Shop Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="font-semibold">Shop Name</Label>
            <Input
              value={form.shop_name}
              onChange={e => setForm(s => ({ ...s, shop_name: e.target.value }))}
              className="mt-1"
              placeholder="Your shop name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="font-semibold">Contact Number</Label>
              <Input
                value={form.contact}
                onChange={e => setForm(s => ({ ...s, contact: e.target.value }))}
                className="mt-1"
                placeholder="+92 300 …"
              />
            </div>
            <div>
              <Label className="font-semibold">Logo URL</Label>
              <Input
                value={form.logo_url}
                onChange={e => setForm(s => ({ ...s, logo_url: e.target.value }))}
                className="mt-1"
                placeholder="https://…"
              />
            </div>
          </div>
          <div>
            <Label className="font-semibold">Address</Label>
            <Input
              value={form.address}
              onChange={e => setForm(s => ({ ...s, address: e.target.value }))}
              className="mt-1"
              placeholder="Shop address"
            />
          </div>
          <div className="pt-2">
            {form.logo_url && (
              <div className="mb-4 flex items-center gap-3 p-3 border rounded-xl bg-muted/30">
                <img src={form.logo_url} alt="Logo" className="h-12 w-12 rounded-lg object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <span className="text-sm text-muted-foreground">Logo preview</span>
              </div>
            )}
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2 shadow-md shadow-primary/25">
              <Save className="h-4 w-4" />
              {save.isPending ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dev tools — admin only */}
      {isAdmin && (
        <Card className="shadow-md border-dashed border-2 border-muted">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
              <Sparkles className="h-5 w-5" /> Developer Tools
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Generate sample dealers, inventory, and sales to test the dashboard and scan-to-sell flow.
            </p>
            <div className="flex items-center gap-3">
              <Button onClick={() => seed.mutate()} disabled={seed.isPending} variant="outline" className="gap-2">
                <Sparkles className="h-4 w-4" />
                {seed.isPending ? "Generating…" : "Generate Sample Data"}
              </Button>
              {seedStatus && <span className="text-xs text-muted-foreground">{seedStatus}</span>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
