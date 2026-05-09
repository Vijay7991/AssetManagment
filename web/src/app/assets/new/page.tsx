"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api, AssetTypeRecord, AssetDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function NewAssetPage() {
  const router = useRouter();
  const { accessToken } = useAuth();

  const types = useQuery({
    queryKey: ["asset-types"],
    queryFn: () => api.get<AssetTypeRecord[]>("/asset-types", accessToken),
    enabled: !!accessToken,
  });

  const [form, setForm] = useState({
    name: "",
    assetTypeId: "",
    description: "",
    location: "",
    quantity: 1,
    status: "InService",
    purchasePrice: "",
    purchasedOn: "",
    warrantyUntil: "",
  });
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedType = types.data?.find(t => t.id === form.assetTypeId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.assetTypeId) {
      setErr("Name and asset type are required.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const payload = {
        name: form.name,
        assetTypeId: form.assetTypeId,
        description: form.description || null,
        location: form.location || null,
        quantity: Number(form.quantity) || 1,
        status: form.status,
        fieldValues: Object.keys(fieldValues).length ? fieldValues : null,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
        purchasedOn: form.purchasedOn || null,
        warrantyUntil: form.warrantyUntil || null,
      };
      const created = await api.post<AssetDetail>("/assets", payload, accessToken);
      router.push(`/assets/${created.id}`);
    } catch (e: any) {
      setErr(e?.message || "Could not create asset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/assets"><ArrowLeft className="mr-2 h-4 w-4" /> Back to assets</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>New asset</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" required value={form.name}
                       onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Asset type *</Label>
                <Select id="type" required value={form.assetTypeId}
                        onChange={e => { setForm(f => ({ ...f, assetTypeId: e.target.value })); setFieldValues({}); }}>
                  <option value="">Select…</option>
                  {types.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select id="status" value={form.status}
                        onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="InService">In Service</option>
                  <option value="InStorage">In Storage</option>
                  <option value="InRepair">In Repair</option>
                  <option value="Retired">Retired</option>
                  <option value="Lost">Lost</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" type="number" min={1} value={form.quantity}
                       onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" placeholder="e.g. Warehouse A — Shelf 3" value={form.location}
                       onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" rows={3} value={form.description}
                          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchasePrice">Purchase price</Label>
                <Input id="purchasePrice" type="number" step="0.01" value={form.purchasePrice}
                       onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchasedOn">Purchased on</Label>
                <Input id="purchasedOn" type="date" value={form.purchasedOn}
                       onChange={e => setForm(f => ({ ...f, purchasedOn: e.target.value }))} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="warrantyUntil">Warranty until</Label>
                <Input id="warrantyUntil" type="date" value={form.warrantyUntil}
                       onChange={e => setForm(f => ({ ...f, warrantyUntil: e.target.value }))} />
              </div>
            </div>

            {selectedType?.fieldSchema && selectedType.fieldSchema.length > 0 && (
              <div className="rounded-md border p-4 space-y-3">
                <div className="text-sm font-medium">Custom fields ({selectedType.name})</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedType.fieldSchema.map(f => (
                    <div key={f.key} className="space-y-2">
                      <Label htmlFor={f.key}>{f.label}{f.required && " *"}</Label>
                      {f.type === "number" ? (
                        <Input id={f.key} type="number" required={f.required}
                               value={fieldValues[f.key] ?? ""}
                               onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.valueAsNumber }))} />
                      ) : f.type === "date" ? (
                        <Input id={f.key} type="date" required={f.required}
                               value={fieldValues[f.key] ?? ""}
                               onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))} />
                      ) : f.type === "boolean" ? (
                        <Select id={f.key}
                                value={String(fieldValues[f.key] ?? "")}
                                onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value === "true" }))}>
                          <option value="">—</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </Select>
                      ) : f.type === "select" ? (
                        <Select id={f.key} required={f.required}
                                value={fieldValues[f.key] ?? ""}
                                onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))}>
                          <option value="">Select…</option>
                          {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                        </Select>
                      ) : (
                        <Input id={f.key} required={f.required}
                               value={fieldValues[f.key] ?? ""}
                               onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {err && <p className="text-sm text-destructive">{err}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create asset"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
