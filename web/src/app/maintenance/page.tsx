"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api, AssetListItem, MaintenanceTicket, Paged } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/card";
import { Plus, Wrench, X } from "lucide-react";
import { formatDate, relativeTime } from "@/lib/utils";

const STATUS_TONE: Record<string, "secondary" | "warning" | "success" | "destructive"> = {
  Open: "warning",
  InProgress: "secondary",
  Done: "success",
  Cancelled: "destructive",
};
const PRIORITY_TONE: Record<string, "secondary" | "warning" | "destructive"> = {
  Low: "secondary",
  Medium: "secondary",
  High: "warning",
  Critical: "destructive",
};

export default function MaintenancePage() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ["maintenance", statusFilter],
    queryFn: () => {
      const p = new URLSearchParams({ pageSize: "50" });
      if (statusFilter) p.set("status", statusFilter);
      return api.get<Paged<MaintenanceTicket>>(`/maintenance?${p}`, accessToken);
    },
    enabled: !!accessToken,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.post(`/maintenance/${id}/status`, { status, cost: null, notes: null }, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Maintenance</h2>
          <p className="text-sm text-muted-foreground">Tickets and work orders.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> New ticket
        </Button>
      </div>

      <div className="flex gap-2">
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-44">
          <option value="">All statuses</option>
          <option value="Open">Open</option>
          <option value="InProgress">In Progress</option>
          <option value="Done">Done</option>
          <option value="Cancelled">Cancelled</option>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {list.isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
          {list.data && list.data.items.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Wrench className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No tickets.</p>
            </div>
          )}
          {list.data && list.data.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Ticket</th>
                    <th className="px-4 py-3 font-medium">Asset</th>
                    <th className="px-4 py-3 font-medium">Kind</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Assignee</th>
                    <th className="px-4 py-3 font-medium">Scheduled</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.data.items.map(t => (
                    <tr key={t.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3 font-medium">{t.title}</td>
                      <td className="px-4 py-3"><Link href={`/assets/${t.assetId}`} className="underline">{t.assetName}</Link></td>
                      <td className="px-4 py-3 text-muted-foreground">{t.kind}</td>
                      <td className="px-4 py-3"><Badge variant={PRIORITY_TONE[t.priority] || "secondary"}>{t.priority}</Badge></td>
                      <td className="px-4 py-3"><Badge variant={STATUS_TONE[t.status] || "secondary"}>{t.status}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground">{t.assignedToName || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(t.scheduledFor)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{relativeTime(t.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Select value={t.status} onChange={e => setStatus.mutate({ id: t.id, status: e.target.value })}>
                          <option>Open</option><option>InProgress</option><option>Done</option><option>Cancelled</option>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {creating && (
        <CreateTicketModal
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); qc.invalidateQueries({ queryKey: ["maintenance"] }); }}
        />
      )}
    </div>
  );
}

function CreateTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState({
    assetId: "",
    title: "",
    description: "",
    kind: "Corrective",
    priority: "Medium",
    scheduledFor: "",
  });
  const [err, setErr] = useState<string | null>(null);

  const assets = useQuery({
    queryKey: ["asset-search-for-ticket"],
    queryFn: () => api.get<Paged<AssetListItem>>("/assets?pageSize=200", accessToken),
    enabled: !!accessToken,
  });

  const create = useMutation({
    mutationFn: () => api.post<MaintenanceTicket>("/maintenance", {
      assetId: form.assetId,
      title: form.title,
      description: form.description || null,
      kind: form.kind,
      priority: form.priority,
      assignedToUserId: null,
      scheduledFor: form.scheduledFor ? new Date(form.scheduledFor).toISOString() : null,
      cost: null,
    }, accessToken),
    onSuccess: () => onCreated(),
    onError: (e: any) => setErr(e?.message || "Could not create ticket."),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
         onClick={onClose}>
      <Card className="w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>New maintenance ticket</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={e => { e.preventDefault(); if (!form.assetId || !form.title) { setErr("Asset and title required."); return; } create.mutate(); }}
                className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="ta">Asset</Label>
              <Select id="ta" required value={form.assetId}
                      onChange={e => setForm(f => ({ ...f, assetId: e.target.value }))}>
                <option value="">Select…</option>
                {assets.data?.items.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tt">Title</Label>
              <Input id="tt" required value={form.title}
                     onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="td">Description</Label>
              <Textarea id="td" rows={3} value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tk">Kind</Label>
                <Select id="tk" value={form.kind}
                        onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>
                  <option>Corrective</option><option>Preventive</option><option>Inspection</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp">Priority</Label>
                <Select id="tp" value={form.priority}
                        onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ts">Scheduled for</Label>
              <Input id="ts" type="datetime-local" value={form.scheduledFor}
                     onChange={e => setForm(f => ({ ...f, scheduledFor: e.target.value }))} />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create ticket"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
