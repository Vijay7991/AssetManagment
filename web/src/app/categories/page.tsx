"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useCan } from "@/lib/auth-context";
import { api, Category } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTree, Plus, Trash2 } from "lucide-react";

export default function CategoriesPage() {
  const { accessToken } = useAuth();
  const canWrite = useCan("catalog:write");
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", parentId: "", icon: "", color: "" });
  const [err, setErr] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories", accessToken),
    enabled: !!accessToken,
  });

  const create = useMutation({
    mutationFn: (body: any) => api.post<Category>("/categories", body, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      setForm({ name: "", parentId: "", icon: "", color: "" });
      setErr(null);
    },
    onError: (e: any) => setErr(e?.message || "Could not create category."),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del<void>(`/categories/${id}`, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
    onError: (e: any) => setErr(e?.message || "Could not delete category."),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Categories</h2>
        <p className="text-sm text-muted-foreground">Organize assets into groups.</p>
      </div>

      <div className={`grid gap-4 ${canWrite ? "lg:grid-cols-3" : ""}`}>
        <Card className={canWrite ? "lg:col-span-2" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" /> All categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {list.data && list.data.length === 0 && (
              <p className="text-sm text-muted-foreground">No categories yet.</p>
            )}
            {list.data && list.data.length > 0 && (
              <ul className="divide-y">
                {list.data.map(c => (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      {c.parentId && <span className="text-muted-foreground">↳ </span>}
                      {c.name}
                    </span>
                    {canWrite && (
                      <Button size="icon" variant="ghost" onClick={() => del.mutate(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {canWrite && <Card>
          <CardHeader>
            <CardTitle>Add category</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={e => { e.preventDefault(); create.mutate({
                name: form.name,
                parentId: form.parentId || null,
                icon: form.icon || null,
                color: form.color || null,
              }); }}
              className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="cname">Name</Label>
                <Input id="cname" required value={form.name}
                       onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cparent">Parent (optional)</Label>
                <Select id="cparent" value={form.parentId}
                        onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}>
                  <option value="">None (top level)</option>
                  {list.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              {err && <p className="text-sm text-destructive">{err}</p>}
              <Button type="submit" disabled={create.isPending}>
                <Plus className="mr-2 h-4 w-4" />{create.isPending ? "Adding…" : "Add"}
              </Button>
            </form>
          </CardContent>
        </Card>}
      </div>
    </div>
  );
}
