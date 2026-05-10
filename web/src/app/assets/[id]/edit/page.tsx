"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api, AssetDetail, AssetTypeRecord, Location } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function EditAssetPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { accessToken } = useAuth();

  const asset = useQuery({
    queryKey: ["asset", params.id],
    queryFn: () => api.get<AssetDetail>(`/assets/${params.id}`, accessToken),
    enabled: !!accessToken && !!params.id,
  });

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
    description: "",
    locationId: "",
    locationDetail: "",
    quantity: 1,
    status: "InService",
    purchasePrice: "",
    purchasedOn: "",
    warrantyUntil: "",
    assignedToUserId: "",
  });
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null);

  // Hydrate form when asset loads
  useEffect(() => {
    if (!asset.data) return;
    const a = asset.data;
    setForm({
      name: a.name,
      description: a.description || "",
      locationId: a.locationId || "",
      locationDetail: a.locationDetail || "",
      quantity: a.quantity,
      status: a.status,
      purchasePrice: a.purchasePrice != null ? String(a.purchasePrice) : "",
      purchasedOn: a.purchasedOn || "",
      warrantyUntil: a.warrantyUntil || "",
      assignedToUserId: a.assignedToUserId || "",
    });
    if (a.fieldValues) setFieldValues(a.fieldValues as Record<string, any>);
  }, [asset.data]);

  const update = useMutation({
    mutationFn: (body: any) => api.put<AssetDetail>(`/assets/${params.id}`, body, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset", params.id] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      router.push(`/assets/${params.id}`);
    },
    onError: (e: any) => setErr(e?.message || "Could not save changes."),
  });

  if (asset.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!asset.data) {
    return <p className="text-sm text-destructive">Asset not found.</p>;
  }
  const a = asset.data;
  const selectedType = types.data?.find(t => t.id === a.assetTypeId);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) { setErr("Name is required."); return; }
    setErr(null);
    update.mutate({
      name: form.name,
      description: form.description || null,
      locationId: form.locationId || null,
      locationDetail: form.locationDetail || null,
      quantity: Number(form.quantity) || 1,
      status: form.status,
      fieldValues: Object.keys(fieldValues).length ? fieldValues : null,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
      purchasedOn: form.purchasedOn || null,
      warrantyUntil: form.warrantyUntil || null,
      assignedToUserId: form.assignedToUserId || null,
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/assets/${params.id}`}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Edit asset</CardTitle>
          <p className="text-sm text-muted-foreground">{a.assetTypeName} · {a.categoryName}</p>
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
                <div className="text-sm font-medium">Custom fields</div>
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
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
