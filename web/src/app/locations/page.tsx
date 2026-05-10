"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useCan } from "@/lib/auth-context";
import { api, Location } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/card";
import { MapPin, Plus, Trash2, X } from "lucide-react";

export default function LocationsPage() {
  const { accessToken } = useAuth();
  const canWrite = useCan("catalog:write");
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<Location[]>("/locations?includeInactive=true", accessToken),
    enabled: !!accessToken,
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del<void>(`/locations/${id}`, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
    onError: (e: any) => setErr(e?.message || "Could not delete."),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put<Location>(`/locations/${id}`, { name: undefined, isActive }, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Locations</h2>
          <p className="text-sm text-muted-foreground">
            Warehouses, offices, sites — anywhere your assets live.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> New location
          </Button>
        )}
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <Card>
        <CardContent className="p-0">
          {list.isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
          {list.data && list.data.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <MapPin className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No locations yet.</p>
              {canWrite && (
                <Button onClick={() => setCreating(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add your first location
                </Button>
              )}
            </div>
          )}
          {list.data && list.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">City</th>
                    <th className="px-4 py-3 font-medium">Region / Country</th>
                    <th className="px-4 py-3 font-medium">Address</th>
                    <th className="px-4 py-3 font-medium">Assets</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {canWrite && <th className="px-4 py-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.data.map(l => (
                    <tr key={l.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/assets?locationId=${l.id}`} className="inline-flex items-center gap-1 hover:underline">
                          <MapPin className="h-3 w-3" /> {l.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{l.code || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{l.city || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {[l.region, l.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{l.address || "—"}</td>
                      <td className="px-4 py-3">
                        <Link href={`/assets?locationId=${l.id}`} className="font-medium hover:underline">
                          {l.assetCount}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={l.isActive ? "success" : "secondary"}>
                          {l.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost"
                                    onClick={() => toggleActive.mutate({ id: l.id, isActive: !l.isActive })}>
                              {l.isActive ? "Deactivate" : "Activate"}
                            </Button>
                            <Button size="icon" variant="ghost"
                                    onClick={() => l.assetCount === 0 && del.mutate(l.id)}
                                    disabled={l.assetCount > 0}
                                    title={l.assetCount > 0 ? "Cannot delete — has assets. Deactivate instead." : "Delete"}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {creating && canWrite && (
        <CreateLocationModal
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); qc.invalidateQueries({ queryKey: ["locations"] }); }}
        />
      )}
    </div>
  );
}

function CreateLocationModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState({
    name: "", code: "", city: "", region: "", country: "", address: "",
  });
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post<Location>("/locations", {
      name: form.name,
      code: form.code || null,
      city: form.city || null,
      region: form.region || null,
      country: form.country || null,
      address: form.address || null,
    }, accessToken),
    onSuccess: () => onCreated(),
    onError: (e: any) => setErr(e?.message || "Could not create location."),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>New location</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={e => { e.preventDefault(); if (!form.name) { setErr("Name required."); return; } create.mutate(); }}
                className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="ln">Name *</Label>
                <Input id="ln" required placeholder="Mumbai Warehouse" value={form.name}
                       onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lc">Code</Label>
                <Input id="lc" placeholder="MUM-01" value={form.code}
                       onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lcity">City</Label>
                <Input id="lcity" placeholder="Mumbai" value={form.city}
                       onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lreg">Region / State</Label>
                <Input id="lreg" placeholder="Maharashtra" value={form.region}
                       onChange={e => setForm(f => ({ ...f, region: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lcountry">Country</Label>
                <Input id="lcountry" placeholder="India" value={form.country}
                       onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="laddr">Address</Label>
                <Input id="laddr" value={form.address}
                       onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create location"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
