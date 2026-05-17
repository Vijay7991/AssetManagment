"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api, AssetTypeRecord, AssetDetail, Location } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Boxes } from "lucide-react";

type UnitSeed = { serialNumber: string; warrantyUntil: string };

export default function NewAssetPage() {
  const router = useRouter();
  const { accessToken } = useAuth();

  const types = useQuery({
    queryKey: ["asset-types"],
    queryFn: () => api.get<AssetTypeRecord[]>("/asset-types", accessToken),
    enabled: !!accessToken,
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<Location[]>("/locations", accessToken),
    enabled: !!accessToken,
  });

  const [form, setForm] = useState({
    name: "",
    assetTypeId: "",
    description: "",
    locationId: "",
    locationDetail: "",
    quantity: 1,
    status: "InService",
    purchasePrice: "",
    currency: "USD",
    purchasedOn: "",
    warrantyUntil: "",
  });
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  // null = inherit from the AssetType's TrackByUnit. true/false = explicit override.
  const [isUnitTrackedOverride, setIsUnitTrackedOverride] = useState<boolean | null>(null);
  const [unitSeeds, setUnitSeeds] = useState<UnitSeed[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedType = types.data?.find(t => t.id === form.assetTypeId);

  // Resolved unit-tracking flag. If the user hasn't explicitly chosen, fall back
  // to the AssetType's default — for new types created before this feature
  // existed, trackByUnit is undefined → treat as false.
  const isUnitTracked = isUnitTrackedOverride ?? !!selectedType?.trackByUnit;

  // Keep the seed array in lockstep with quantity when unit tracking is on. We
  // don't want stale rows hanging around if the user dialled quantity back down.
  useEffect(() => {
    if (!isUnitTracked) { setUnitSeeds([]); return; }
    setUnitSeeds(prev => {
      const next = prev.slice(0, form.quantity);
      while (next.length < form.quantity) {
        next.push({ serialNumber: "", warrantyUntil: "" });
      }
      return next;
    });
  }, [isUnitTracked, form.quantity]);

  function updateSeed(i: number, patch: Partial<UnitSeed>) {
    setUnitSeeds(s => s.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.assetTypeId) {
      setErr("Name and asset type are required.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      // Map the inline grid to the backend's UnitSeed shape. Empty strings are
      // sent as null so the unit lands with no identity rather than "" — much
      // easier to filter on later.
      const units = isUnitTracked
        ? unitSeeds.map(s => ({
            serialNumber: s.serialNumber.trim() || null,
            warrantyUntil: s.warrantyUntil || null,
            fieldValues: null,
          }))
        : null;

      const payload = {
        name: form.name,
        assetTypeId: form.assetTypeId,
        description: form.description || null,
        locationId: form.locationId || null,
        locationDetail: form.locationDetail || null,
        quantity: Number(form.quantity) || 1,
        status: form.status,
        fieldValues: Object.keys(fieldValues).length ? fieldValues : null,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
        currency: form.currency,
        purchasedOn: form.purchasedOn || null,
        warrantyUntil: form.warrantyUntil || null,
        // Send the override only when the user actually toggled it — null lets
        // the backend honour the AssetType's default.
        isUnitTracked: isUnitTrackedOverride,
        units,
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
                <Label htmlFor="locationId">Location</Label>
                <Select id="locationId" value={form.locationId}
                        onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}>
                  <option value="">— None —</option>
                  {locations.data?.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}{l.city ? ` (${l.city})` : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="locationDetail">Spot / sub-location</Label>
                <Input id="locationDetail" placeholder="e.g. Aisle 3 — Shelf B" value={form.locationDetail}
                       onChange={e => setForm(f => ({ ...f, locationDetail: e.target.value }))} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" rows={3} value={form.description}
                          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchasePrice">Purchase price</Label>
                <div className="flex gap-2">
                  <select
                    value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium">
                    <option value="USD">$ USD</option>
                    <option value="INR">₹ INR</option>
                  </select>
                  <Input id="purchasePrice" type="number" step="0.01" value={form.purchasePrice}
                         onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))} />
                </div>
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

            {selectedType && (
              <div className="rounded-md border p-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-1"
                         checked={isUnitTracked}
                         onChange={e => setIsUnitTrackedOverride(e.target.checked)} />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      <Boxes className="h-4 w-4" /> Track each unit individually
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedType.trackByUnit
                        ? `Default for ${selectedType.name}. Each of the ${form.quantity} unit${form.quantity === 1 ? "" : "s"} will get its own barcode and identity.`
                        : `Override the default off-setting for ${selectedType.name}.`}
                    </p>
                  </div>
                </label>

                {isUnitTracked && form.quantity > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Optional: fill in identity for each unit now, or leave blank
                      and edit from each unit's page later. Skipping is fine —
                      every unit gets a barcode either way.
                    </p>
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-2 py-1.5 text-left w-12">#</th>
                            <th className="px-2 py-1.5 text-left">Serial / IMEI</th>
                            <th className="px-2 py-1.5 text-left w-44">Warranty until</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unitSeeds.map((row, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                              <td className="px-2 py-1">
                                <Input value={row.serialNumber}
                                       placeholder="(blank = fill in later)"
                                       onChange={e => updateSeed(i, { serialNumber: e.target.value })} />
                              </td>
                              <td className="px-2 py-1">
                                <Input type="date" value={row.warrantyUntil}
                                       onChange={e => updateSeed(i, { warrantyUntil: e.target.value })} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

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
