"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useCan } from "@/lib/auth-context";
import { api, UnitDetail, Movement } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/card";
import {
  ArrowLeft, ArrowRight, History, MapPin, Save, Trash2, UserCheck, UserMinus, X,
} from "lucide-react";
import { formatDate, formatDateTime, relativeTime } from "@/lib/utils";
import { StatusBadge } from "@/components/status";

export default function UnitDetailPage() {
  const params = useParams<{ id: string; unitId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { accessToken } = useAuth();
  const canWrite = useCan("assets:write");
  const canCheckout = useCan("assets:checkout");

  const unit = useQuery({
    queryKey: ["unit", params.unitId],
    queryFn: () => api.get<UnitDetail>(`/units/${params.unitId}`, accessToken),
    enabled: !!accessToken && !!params.unitId,
  });

  // The movements endpoint is per-asset, so we fetch them all and filter to
  // this unit. Cheaper than spinning up a new endpoint just for per-unit views.
  const allMovements = useQuery({
    queryKey: ["movements", params.id],
    queryFn: () => api.get<(Movement & { unitId?: string | null })[]>(
      `/assets/${params.id}/movements`, accessToken),
    enabled: !!accessToken && !!params.id,
  });

  const [form, setForm] = useState({
    serialNumber: "", status: "InService",
    locationDetail: "", warrantyUntil: "", purchasedOn: "",
  });
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [movementForm, setMovementForm] = useState<null | "out" | "in">(null);

  // Reset the form whenever the unit refetches so the inputs reflect the
  // latest values (e.g. after a check-out updates location).
  useEffect(() => {
    if (unit.data) {
      setForm({
        serialNumber: unit.data.serialNumber ?? "",
        status: unit.data.status,
        locationDetail: unit.data.locationDetail ?? "",
        warrantyUntil: unit.data.warrantyUntil ?? "",
        purchasedOn: unit.data.purchasedOn ?? "",
      });
    }
  }, [unit.data]);

  const save = useMutation({
    mutationFn: () => api.put<UnitDetail>(`/units/${params.unitId}`, {
      serialNumber: form.serialNumber || null,
      status: form.status,
      locationId: unit.data?.locationId ?? null,
      locationDetail: form.locationDetail || null,
      fieldValues: unit.data?.fieldValues ?? null,
      purchasePrice: unit.data?.purchasePrice ?? null,
      purchasedOn: form.purchasedOn || null,
      warrantyUntil: form.warrantyUntil || null,
    }, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unit", params.unitId] });
      qc.invalidateQueries({ queryKey: ["units", params.id] });
      setSaveErr(null);
    },
    onError: (e: any) => setSaveErr(e?.message || "Could not save."),
  });

  const del = useMutation({
    mutationFn: () => api.del<void>(`/units/${params.unitId}`, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units", params.id] });
      qc.invalidateQueries({ queryKey: ["asset", params.id] });
      router.push(`/assets/${params.id}`);
    },
  });

  if (unit.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (unit.isError || !unit.data) return <p className="text-sm text-destructive">Unit not found.</p>;

  const u = unit.data;
  const unitMovements = (allMovements.data ?? []).filter(m => (m as any).unitId === u.id);
  const primaryTag = u.tags.find(t => t.status === "Active") || u.tags[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/assets/${params.id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to {u.assetName}
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {canCheckout && (u.assignedToUserId ? (
            <Button variant="outline" size="sm" onClick={() => setMovementForm("in")}>
              <UserMinus className="mr-2 h-4 w-4" /> Check in
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setMovementForm("out")}>
              <UserCheck className="mr-2 h-4 w-4" /> Check out
            </Button>
          ))}
          {canWrite && (
            <Button variant="destructive" size="sm" disabled={!!u.assignedToUserId || del.isPending}
                    onClick={() => {
                      if (confirm(`Delete unit #${u.unitNumber}?`)) del.mutate();
                    }}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete unit
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">
                {u.assetName} <span className="font-mono text-muted-foreground">#{u.unitNumber}</span>
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {u.serialNumber || <span className="italic">No serial number yet</span>}
              </p>
            </div>
            <StatusBadge status={u.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="sn">Serial / IMEI</Label>
              <Input id="sn" disabled={!canWrite} value={form.serialNumber}
                     onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st">Status</Label>
              <Select id="st" disabled={!canWrite} value={form.status}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="InService">In Service</option>
                <option value="InStorage">In Storage</option>
                <option value="InRepair">In Repair</option>
                <option value="Retired">Retired</option>
                <option value="Lost">Lost</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lc">Location detail</Label>
              <Input id="lc" disabled={!canWrite} value={form.locationDetail}
                     onChange={e => setForm(f => ({ ...f, locationDetail: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pd">Purchased on</Label>
              <Input id="pd" type="date" disabled={!canWrite} value={form.purchasedOn}
                     onChange={e => setForm(f => ({ ...f, purchasedOn: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wu">Warranty until</Label>
              <Input id="wu" type="date" disabled={!canWrite} value={form.warrantyUntil}
                     onChange={e => setForm(f => ({ ...f, warrantyUntil: e.target.value }))} />
            </div>
            {canWrite && (
              <div className="sm:col-span-2 flex items-center justify-between gap-2">
                {saveErr && <p className="text-sm text-destructive">{saveErr}</p>}
                <Button type="submit" disabled={save.isPending} className="ml-auto">
                  <Save className="mr-2 h-4 w-4" />
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            )}
          </form>

          <dl className="grid gap-3 text-sm sm:grid-cols-2 border-t pt-4">
            <Field label="Assigned to">{u.assignedToName || "Unassigned"}</Field>
            <Field label="Location">
              {u.locationName ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {u.locationName}
                </span>
              ) : "—"}
              {u.locationDetail && (
                <span className="ml-1 text-xs text-muted-foreground">· {u.locationDetail}</span>
              )}
            </Field>
            <Field label="Purchased on">{formatDate(u.purchasedOn)}</Field>
            <Field label="Warranty until">{formatDate(u.warrantyUntil)}</Field>
            <Field label="Created">{formatDateTime(u.createdAt)}</Field>
            <Field label="Updated">{formatDateTime(u.updatedAt)}</Field>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> History</CardTitle>
        </CardHeader>
        <CardContent>
          {unitMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements yet.</p>
          ) : (
            <ul className="space-y-3">
              {unitMovements.map(m => (
                <li key={m.id} className="flex items-start gap-3 text-sm">
                  <Badge variant={
                    m.kind === "CheckOut" ? "warning" :
                    m.kind === "CheckIn" ? "success" : "secondary"
                  }>{m.kind}</Badge>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      {m.kind === "CheckOut" && m.toUserName &&
                        <>to <span className="font-medium">{m.toUserName}</span></>}
                      {m.kind === "CheckIn" && m.fromUserName &&
                        <>from <span className="font-medium">{m.fromUserName}</span></>}
                      {(m.fromLocation || m.toLocation) && m.kind === "Move" && (
                        <>
                          <span className="text-muted-foreground">{m.fromLocation || "—"}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="font-medium">{m.toLocation || "—"}</span>
                        </>
                      )}
                    </div>
                    {m.notes && <p className="text-xs text-muted-foreground mt-0.5">{m.notes}</p>}
                    <p className="text-xs text-muted-foreground">
                      {m.performedByName || "—"} · {relativeTime(m.performedAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {primaryTag && (
        <Card>
          <CardHeader><CardTitle>Tag</CardTitle></CardHeader>
          <CardContent className="text-center space-y-3">
            <img src={primaryTag.qrUrl} alt={`QR ${primaryTag.code}`}
                 className="mx-auto h-48 w-48 rounded border bg-white p-3" />
            <div className="font-mono text-lg font-medium tracking-wider">{primaryTag.code}</div>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print label
            </Button>
          </CardContent>
        </Card>
      )}

      {movementForm && (
        <UnitMovementModal
          mode={movementForm}
          unitId={params.unitId}
          assetId={params.id}
          currentLocation={u.locationDetail}
          currentAssigneeName={u.assignedToName}
          onClose={() => setMovementForm(null)}
          onDone={() => {
            setMovementForm(null);
            qc.invalidateQueries({ queryKey: ["unit", params.unitId] });
            qc.invalidateQueries({ queryKey: ["units", params.id] });
            qc.invalidateQueries({ queryKey: ["asset", params.id] });
            qc.invalidateQueries({ queryKey: ["movements", params.id] });
          }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/// Single-unit checkout/checkin modal — same UX as the asset-level movement
/// dialog but talks to the unit endpoints.
function UnitMovementModal({
  mode, unitId, assetId, currentLocation, currentAssigneeName, onClose, onDone,
}: {
  mode: "out" | "in";
  unitId: string;
  assetId: string;
  currentLocation: string | null;
  currentAssigneeName: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { accessToken } = useAuth();
  const [toLocation, setToLocation] = useState(currentLocation || "");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["members"],
    queryFn: () => api.get<{ userId: string; displayName: string; email: string }[]>("/tenant/members", accessToken),
    enabled: !!accessToken && mode === "out",
  });
  const [toUserId, setToUserId] = useState("");

  const submit = useMutation({
    mutationFn: () => mode === "out"
      ? api.post(`/units/${unitId}/check-out`,
          { toUserId: toUserId || null, toLocation: toLocation || null, notes: notes || null },
          accessToken)
      : api.post(`/units/${unitId}/check-in`,
          { toLocation: toLocation || null, notes: notes || null }, accessToken),
    onSuccess: () => onDone(),
    onError: (e: any) => setErr(e?.message || "Action failed."),
  });

  const title = mode === "out" ? "Check out unit" : "Check in unit";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={e => { e.preventDefault(); submit.mutate(); }} className="space-y-3">
            {mode === "out" && (
              <div className="space-y-2">
                <Label htmlFor="u-to">Check out to</Label>
                <select id="u-to" value={toUserId}
                        onChange={e => setToUserId(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Myself</option>
                  {members.data?.map(m => (
                    <option key={m.userId} value={m.userId}>{m.displayName} ({m.email})</option>
                  ))}
                </select>
              </div>
            )}
            {mode === "in" && currentAssigneeName && (
              <p className="text-sm text-muted-foreground">
                Currently with <span className="font-medium">{currentAssigneeName}</span>.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="u-loc">Location</Label>
              <Input id="u-loc" value={toLocation}
                     onChange={e => setToLocation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-notes">Notes</Label>
              <Textarea id="u-notes" rows={2} value={notes}
                        onChange={e => setNotes(e.target.value)} />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={submit.isPending}>
                {submit.isPending ? "Saving…" : title}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
