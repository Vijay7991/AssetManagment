"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api, AssetTypeRecord, Category, FieldSchemaItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/card";
import { Boxes, Plus, Tag as TagIcon, Trash2, X } from "lucide-react";

export default function AssetTypesPage() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  // trackByUnit defaults off — bulk consumables stay simple. Operators turn it
  // on for asset types where each physical instance has its own identity.
  const [form, setForm] = useState({ name: "", categoryId: "", trackByUnit: false });
  const [fields, setFields] = useState<FieldSchemaItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const types = useQuery({
    queryKey: ["asset-types"],
    queryFn: () => api.get<AssetTypeRecord[]>("/asset-types", accessToken),
    enabled: !!accessToken,
  });
  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories", accessToken),
    enabled: !!accessToken,
  });

  const create = useMutation({
    mutationFn: (body: any) => api.post<AssetTypeRecord>("/asset-types", body, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-types"] });
      setForm({ name: "", categoryId: "", trackByUnit: false });
      setFields([]);
      setErr(null);
    },
    onError: (e: any) => setErr(e?.message || "Could not create asset type."),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del<void>(`/asset-types/${id}`, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-types"] }),
    onError: (e: any) => setErr(e?.message || "Could not delete asset type."),
  });

  function addField() {
    setFields(f => [...f, { key: "", label: "", type: "string", required: false }]);
  }
  function updateField(i: number, patch: Partial<FieldSchemaItem>) {
    setFields(f => f.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  }
  function removeField(i: number) {
    setFields(f => f.filter((_, idx) => idx !== i));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.categoryId) return setErr("Name and category required.");
    const cleaned = fields
      .filter(f => f.key && f.label)
      .map(f => ({ ...f, key: f.key.trim(), label: f.label.trim() }));
    create.mutate({
      name: form.name,
      categoryId: form.categoryId,
      icon: null,
      trackByUnit: form.trackByUnit,
      fieldSchema: cleaned,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Asset types</h2>
        <p className="text-sm text-muted-foreground">
          Templates that define custom fields for an asset (e.g. Laptop, Forklift, Office Chair).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TagIcon className="h-5 w-5" /> All types</CardTitle>
          </CardHeader>
          <CardContent>
            {types.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {types.data && types.data.length === 0 && (
              <p className="text-sm text-muted-foreground">No types yet.</p>
            )}
            {types.data && types.data.length > 0 && (
              <ul className="divide-y">
                {types.data.map(t => {
                  const cat = cats.data?.find(c => c.id === t.categoryId);
                  const schema = (t as any).fieldSchema as FieldSchemaItem[] | null;
                  return (
                    <li key={t.id} className="flex items-start justify-between gap-2 py-3">
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          {t.name}
                          {t.trackByUnit && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <Boxes className="h-3 w-3" /> Unit-tracked
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{cat?.name}</div>
                        {schema && schema.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {schema.map(f => <Badge key={f.key} variant="outline">{f.label}</Badge>)}
                          </div>
                        )}
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => del.mutate(t.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add asset type</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="tn">Name</Label>
                <Input id="tn" required value={form.name}
                       onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tc">Category</Label>
                <Select id="tc" required value={form.categoryId}
                        onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                  <option value="">Select…</option>
                  {cats.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>

              <label className="flex items-start gap-3 rounded-md border p-3 hover:bg-accent cursor-pointer">
                <input type="checkbox" className="mt-1"
                       checked={form.trackByUnit}
                       onChange={e => setForm(f => ({ ...f, trackByUnit: e.target.checked }))} />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <Boxes className="h-4 w-4" /> Track each unit individually
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Turn this on for things like phones, laptops, or vehicles — each
                    physical instance gets its own barcode, IMEI/serial, warranty, and
                    check-out lifecycle. Leave off for consumables (paper, cables).
                  </p>
                </div>
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Custom fields</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addField}>
                    <Plus className="mr-1 h-3 w-3" /> Add field
                  </Button>
                </div>
                <div className="space-y-2">
                  {fields.map((f, i) => (
                    <div key={i} className="rounded-md border p-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Key (e.g. serial)" value={f.key}
                               onChange={e => updateField(i, { key: e.target.value })} />
                        <Input placeholder="Label" value={f.label}
                               onChange={e => updateField(i, { label: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={f.type} onChange={e => updateField(i, { type: e.target.value as any })}>
                          <option value="string">Text</option>
                          <option value="number">Number</option>
                          <option value="boolean">Yes/No</option>
                          <option value="date">Date</option>
                        </Select>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={!!f.required}
                                 onChange={e => updateField(i, { required: e.target.checked })} />
                          Required
                        </label>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeField(i)}>
                        <X className="mr-1 h-3 w-3" /> Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {err && <p className="text-sm text-destructive">{err}</p>}
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Adding…" : "Add type"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
