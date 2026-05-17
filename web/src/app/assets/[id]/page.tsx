"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useCan } from "@/lib/auth-context";
import { api, AssetDetail, MaintenanceTicket, Movement, UnitListItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/card";
import {
  ArrowLeft, ArrowRight, Boxes, Camera, ChevronRight, Hash, History,
  MapPin, Pencil, Plus, Printer, Trash2, UserCheck, UserMinus, Wrench, X,
} from "lucide-react";
import { formatDate, formatDateTime, relativeTime } from "@/lib/utils";
import { StatusBadge } from "@/components/status";

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { accessToken } = useAuth();
  const canWrite = useCan("assets:write");
  const canCheckout = useCan("assets:checkout");
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [movementForm, setMovementForm] = useState<null | { kind: "CheckOut" | "CheckIn" | "Move" }>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);

  const asset = useQuery({
    queryKey: ["asset", params.id],
    queryFn: () => api.get<AssetDetail>(`/assets/${params.id}`, accessToken),
    enabled: !!accessToken && !!params.id,
  });

  const movements = useQuery({
    queryKey: ["movements", params.id],
    queryFn: () => api.get<Movement[]>(`/assets/${params.id}/movements`, accessToken),
    enabled: !!accessToken && !!params.id,
  });

  const tickets = useQuery({
    queryKey: ["tickets-by-asset", params.id],
    queryFn: () => api.get<MaintenanceTicket[]>(`/maintenance/by-asset/${params.id}`, accessToken),
    enabled: !!accessToken && !!params.id,
  });

  const units = useQuery({
    queryKey: ["units", params.id],
    queryFn: () => api.get<UnitListItem[]>(`/assets/${params.id}/units`, accessToken),
    enabled: !!accessToken && !!params.id && !!asset.data?.isUnitTracked,
  });

  // For unit-tracked assets we open a different modal (multi-select + scan).
  const [unitCheckout, setUnitCheckout] = useState<"out" | "in" | null>(null);

  const addUnit = useMutation({
    mutationFn: () => api.post<unknown>(`/assets/${params.id}/units`, {}, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units", params.id] });
      qc.invalidateQueries({ queryKey: ["asset", params.id] });
    },
  });

  const del = useMutation({
    mutationFn: () => api.del<void>(`/assets/${params.id}`, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      router.push("/assets");
    },
  });

  const newTag = useMutation({
    mutationFn: () => api.post(`/tags/by-asset/${params.id}`, undefined, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset", params.id] }),
  });

  async function uploadPhoto(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      await api.upload(`/assets/${params.id}/photos`, file, accessToken);
      await qc.invalidateQueries({ queryKey: ["asset", params.id] });
    } finally {
      setUploading(false);
    }
  }

  if (asset.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (asset.isError || !asset.data) {
    return <p className="text-sm text-destructive">Asset not found.</p>;
  }
  const a = asset.data;
  const primaryTag = a.tags.find(t => t.status === "Active") || a.tags[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/assets"><ArrowLeft className="mr-2 h-4 w-4" /> Back to assets</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {canCheckout && (
            a.isUnitTracked ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setUnitCheckout("out")}>
                  <UserCheck className="mr-2 h-4 w-4" /> Check out units
                </Button>
                <Button variant="outline" size="sm" onClick={() => setUnitCheckout("in")}>
                  <UserMinus className="mr-2 h-4 w-4" /> Check in units
                </Button>
              </>
            ) : (
              a.assignedToUserId ? (
                <Button variant="outline" size="sm" onClick={() => setMovementForm({ kind: "CheckIn" })}>
                  <UserMinus className="mr-2 h-4 w-4" /> Check in
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setMovementForm({ kind: "CheckOut" })}>
                  <UserCheck className="mr-2 h-4 w-4" /> Check out
                </Button>
              )
            )
          )}
          {canCheckout && (
            <Button variant="outline" size="sm" onClick={() => setMovementForm({ kind: "Move" })}>
              <MapPin className="mr-2 h-4 w-4" /> Move
            </Button>
          )}
          {canWrite && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/assets/${params.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowPrintDialog(true)}>
            <Printer className="mr-2 h-4 w-4" /> Print labels
          </Button>
          {canWrite && (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDel(true)}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      {confirmDel && (
        <Card className="border-destructive print-hide">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <p className="text-sm">Delete <span className="font-medium">{a.name}</span>? This soft-deletes — data is retained.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDel(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={() => del.mutate()} disabled={del.isPending}>
                {del.isPending ? "Deleting…" : "Confirm delete"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showPrintDialog && (
        <PrintLabelDialog
          assetId={params.id}
          assetName={a.name}
          quantity={a.quantity || 1}
          hasTags={a.tags.some(t => t.status === "Active")}
          onClose={() => setShowPrintDialog(false)}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">{a.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {a.categoryName} · {a.assetTypeName}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {a.description && <p className="text-sm">{a.description}</p>}
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Field label="Quantity">{a.quantity}</Field>
                <Field label="Location">
                  {a.locationName ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {a.locationName}
                    </span>
                  ) : "—"}
                  {a.locationDetail && (
                    <span className="ml-1 text-xs text-muted-foreground">· {a.locationDetail}</span>
                  )}
                </Field>
                <Field label="Assigned to">{a.assignedToName || "Unassigned"}</Field>
                <Field label="Purchase price">
                  {a.purchasePrice != null ? `$${a.purchasePrice.toFixed(2)}` : "—"}
                </Field>
                <Field label="Purchased on">{formatDate(a.purchasedOn)}</Field>
                <Field label="Warranty until">{formatDate(a.warrantyUntil)}</Field>
                <Field label="Created">{formatDateTime(a.createdAt)}</Field>
                <Field label="Updated">{formatDateTime(a.updatedAt)}</Field>
              </dl>

              {a.fieldValues && Object.keys(a.fieldValues).length > 0 && (
                <div className="rounded-md border p-4">
                  <div className="mb-2 text-sm font-medium">Custom fields</div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    {Object.entries(a.fieldValues).map(([k, v]) => (
                      <Field key={k} label={k}>{String(v ?? "—")}</Field>
                    ))}
                  </dl>
                </div>
              )}
            </CardContent>
          </Card>

          {a.isUnitTracked && (
            <Card className="print-hide">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Boxes className="h-5 w-5" /> Units
                  <span className="text-sm font-normal text-muted-foreground">
                    ({a.availableUnitCount} of {a.unitCount} available)
                  </span>
                </CardTitle>
                {canWrite && (
                  <Button size="sm" variant="outline" disabled={addUnit.isPending}
                          onClick={() => addUnit.mutate()}>
                    <Plus className="mr-1 h-3 w-3" /> Add unit
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {units.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                {units.data && units.data.length === 0 && (
                  <p className="text-sm text-muted-foreground">No units yet.</p>
                )}
                {units.data && units.data.length > 0 && (
                  <ul className="divide-y">
                    {units.data.map(u => (
                      <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <Link href={`/assets/${params.id}/units/${u.id}`}
                              className="flex flex-1 items-center gap-3 min-w-0 hover:bg-accent rounded-md p-2 -m-2">
                          <div className="font-mono text-sm font-medium w-12">#{u.unitNumber}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {u.serialNumber || <span className="text-muted-foreground italic">No serial</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <StatusBadge status={u.status} />
                              {u.assignedToName && (
                                <span>· checked out to <b className="text-foreground">{u.assignedToName}</b></span>
                              )}
                              {u.primaryTagCode && <span className="font-mono">· {u.primaryTagCode}</span>}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="print-hide">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> History</CardTitle>
            </CardHeader>
            <CardContent>
              {movements.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {movements.data && movements.data.length === 0 && (
                <p className="text-sm text-muted-foreground">No movements yet.</p>
              )}
              {movements.data && movements.data.length > 0 && (
                <ul className="space-y-3">
                  {movements.data.map(m => (
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
                          {(m.fromLocation || m.toLocation) && m.kind !== "CheckOut" && m.kind !== "CheckIn" && (
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

          {tickets.data && tickets.data.length > 0 && (
            <Card className="print-hide">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> Maintenance</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {tickets.data.map(t => (
                    <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-muted-foreground">{t.kind} · {relativeTime(t.createdAt)}</div>
                      </div>
                      <Badge variant={
                        t.status === "Done" ? "success" :
                        t.status === "Open" ? "warning" :
                        t.status === "Cancelled" ? "destructive" : "secondary"
                      }>{t.status}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card className="print-hide">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Photos ({a.photos.length})</CardTitle>
              <div>
                <input ref={fileInput} type="file" accept="image/*" className="hidden"
                       onChange={e => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
                <Button size="sm" variant="outline" disabled={uploading}
                        onClick={() => fileInput.current?.click()}>
                  <Camera className="mr-2 h-4 w-4" />
                  {uploading ? "Uploading…" : "Add photo"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {a.photos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No photos yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {a.photos.map(p => (
                    <img key={p.id} src={p.url}
                         className="aspect-square w-full rounded object-cover" alt="" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Movement modal (non-unit assets) */}
        {movementForm && (
          <MovementModal
            kind={movementForm.kind}
            assetId={params.id}
            currentLocation={a.locationDetail}
            currentAssigneeName={a.assignedToName}
            onClose={() => setMovementForm(null)}
            onDone={() => {
              setMovementForm(null);
              qc.invalidateQueries({ queryKey: ["asset", params.id] });
              qc.invalidateQueries({ queryKey: ["movements", params.id] });
              qc.invalidateQueries({ queryKey: ["assets"] });
            }}
          />
        )}

        {/* Unit checkout/checkin modal */}
        {unitCheckout && units.data && (
          <UnitCheckoutModal
            mode={unitCheckout}
            assetId={params.id}
            units={units.data}
            onClose={() => setUnitCheckout(null)}
            onDone={() => {
              setUnitCheckout(null);
              qc.invalidateQueries({ queryKey: ["asset", params.id] });
              qc.invalidateQueries({ queryKey: ["units", params.id] });
              qc.invalidateQueries({ queryKey: ["movements", params.id] });
            }}
          />
        )}

        {/* Side: tag/QR */}
        <div className="space-y-4">
          <Card className="print-sheet">
            <CardHeader className="flex flex-row items-center justify-between print-hide">
              <CardTitle>Tag</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => newTag.mutate()} disabled={newTag.isPending}>
                {newTag.isPending ? "…" : "New tag"}
              </Button>
            </CardHeader>
            <CardContent className="text-center">
              {primaryTag ? (
                <div className="space-y-3">
                  <img
                    src={primaryTag.qrUrl}
                    alt={`QR code ${primaryTag.code}`}
                    className="mx-auto h-48 w-48 rounded border bg-white p-3"
                  />
                  <div>
                    <div className="font-mono text-lg font-medium tracking-wider">{primaryTag.code}</div>
                    <div className="text-xs text-muted-foreground print-hide">{a.name}</div>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1 print-hide">
                    {a.tags.map(t => (
                      <Badge key={t.id} variant={t.status === "Active" ? "outline" : "secondary"}>
                        {t.code}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No tag assigned.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PrintLabelDialog({ assetId, assetName, quantity, hasTags, onClose }: {
  assetId: string;
  assetName: string;
  quantity: number;
  hasTags: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [count, setCount] = useState(Math.max(1, quantity));

  function handlePrint() {
    onClose();
    router.push(`/print/${assetId}?count=${count}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print-hide"
         onClick={onClose}>
      <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> Print QR labels
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasTags && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This asset has no active QR tag. Generate one first using the "New tag" button.
            </p>
          )}
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium">{assetName}</span>
            {quantity > 1 && (
              <span className="ml-2 text-muted-foreground">· {quantity} units</span>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lbl-count" className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" /> Number of labels to print
            </Label>
            <Input
              id="lbl-count"
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={e => setCount(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
            />
            {quantity > 1 && (
              <p className="text-xs text-muted-foreground">
                Tip: print {quantity} labels — one for each unit.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handlePrint} disabled={!hasTags}>
              <Printer className="mr-2 h-4 w-4" />
              Print {count} label{count !== 1 ? "s" : ""}
            </Button>
          </div>
        </CardContent>
      </Card>
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

function MovementModal({
  kind, assetId, currentLocation, currentAssigneeName, onClose, onDone,
}: {
  kind: "CheckOut" | "CheckIn" | "Move";
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

  // For CheckOut: pick a recipient. We list members of the tenant.
  const members = useQuery({
    queryKey: ["members"],
    queryFn: () => api.get<{ userId: string; displayName: string; email: string }[]>("/tenant/members", accessToken),
    enabled: !!accessToken && kind === "CheckOut",
  });
  const [toUserId, setToUserId] = useState("");

  const submit = useMutation({
    mutationFn: () => {
      if (kind === "CheckOut") {
        return api.post(`/assets/${assetId}/check-out`, {
          toUserId: toUserId || null,
          toLocation: toLocation || null,
          notes: notes || null,
        }, accessToken);
      }
      if (kind === "CheckIn") {
        return api.post(`/assets/${assetId}/check-in`, {
          toLocation: toLocation || null,
          notes: notes || null,
        }, accessToken);
      }
      return api.post(`/assets/${assetId}/move`, {
        toLocation,
        notes: notes || null,
      }, accessToken);
    },
    onSuccess: () => onDone(),
    onError: (e: any) => setErr(e?.message || "Action failed."),
  });

  const title = kind === "CheckOut" ? "Check out asset"
              : kind === "CheckIn" ? "Check in asset"
              : "Move asset";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print-hide"
         onClick={onClose}>
      <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={e => {
            e.preventDefault();
            if (kind === "Move" && !toLocation) { setErr("Destination required."); return; }
            submit.mutate();
          }} className="space-y-3">
            {kind === "CheckOut" && (
              <div className="space-y-2">
                <Label htmlFor="m-to">Check out to</Label>
                <select id="m-to" value={toUserId}
                        onChange={e => setToUserId(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Myself</option>
                  {members.data?.map(m => (
                    <option key={m.userId} value={m.userId}>{m.displayName} ({m.email})</option>
                  ))}
                </select>
              </div>
            )}
            {kind === "CheckIn" && currentAssigneeName && (
              <p className="text-sm text-muted-foreground">
                Currently with <span className="font-medium">{currentAssigneeName}</span>.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="m-loc">{kind === "Move" ? "New location *" : "Location"}</Label>
              <Input id="m-loc" value={toLocation} required={kind === "Move"}
                     onChange={e => setToLocation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-notes">Notes</Label>
              <Textarea id="m-notes" rows={2} value={notes}
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

/// Batch check-out / check-in for a unit-tracked asset. Two ways to add units
/// to the basket: tick them in the pick-list, or paste/scan a barcode and let
/// it resolve via the tag API. The same modal does both checkout and checkin
/// because the UX is identical — only the eligible units differ.
function UnitCheckoutModal({
  mode, assetId, units, onClose, onDone,
}: {
  mode: "out" | "in";
  assetId: string;
  units: UnitListItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { accessToken } = useAuth();
  // Available list depends on the mode: for check-out we want unassigned units,
  // for check-in we want only checked-out ones.
  const eligible = units.filter(u =>
    mode === "out" ? !u.assignedToUserId : !!u.assignedToUserId);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [scanCode, setScanCode] = useState("");
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [toLocation, setToLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Member dropdown for the check-out recipient — same source as the
  // non-unit modal above.
  const members = useQuery({
    queryKey: ["members"],
    queryFn: () => api.get<{ userId: string; displayName: string; email: string }[]>("/tenant/members", accessToken),
    enabled: !!accessToken && mode === "out",
  });
  const [toUserId, setToUserId] = useState("");

  function toggle(unitId: string) {
    setPicked(s => {
      const next = new Set(s);
      next.has(unitId) ? next.delete(unitId) : next.add(unitId);
      return next;
    });
  }

  async function handleScan() {
    if (!scanCode.trim()) return;
    setScanErr(null);
    try {
      // Tag scan returns a kind=Asset|Unit envelope. We only care about Unit
      // matches that belong to this asset and are eligible for this action.
      const result = await api.get<any>(`/tags/scan/${scanCode.trim()}`, accessToken);
      if (result?.kind !== "Unit" || !result.unit) {
        setScanErr("That code doesn't belong to a unit.");
        return;
      }
      const u = result.unit;
      if (u.assetId !== assetId) {
        setScanErr("That unit belongs to a different asset.");
        return;
      }
      const matching = eligible.find(e => e.id === u.id);
      if (!matching) {
        setScanErr(mode === "out"
          ? "That unit is already checked out."
          : "That unit isn't checked out.");
        return;
      }
      setPicked(s => new Set(s).add(u.id));
      setScanCode("");
    } catch {
      setScanErr("Couldn't find that code in this workspace.");
    }
  }

  const submit = useMutation({
    mutationFn: () => {
      if (picked.size === 0) throw new Error("Pick at least one unit.");
      const body = mode === "out"
        ? { unitIds: Array.from(picked), toUserId: toUserId || null, toLocation: toLocation || null, notes: notes || null }
        : { unitIds: Array.from(picked), toLocation: toLocation || null, notes: notes || null };
      const path = mode === "out"
        ? `/assets/${assetId}/units/check-out-batch`
        : `/assets/${assetId}/units/check-in-batch`;
      return api.post(path, body, accessToken);
    },
    onSuccess: () => onDone(),
    onError: (e: any) => setErr(e?.message || "Action failed."),
  });

  const title = mode === "out" ? "Check out units" : "Check in units";
  const verb = mode === "out" ? "Check out" : "Check in";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print-hide"
         onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-card border-b">
          <CardTitle>{title}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={e => { e.preventDefault(); submit.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scan">Scan or paste barcode</Label>
              <div className="flex gap-2">
                <Input id="scan" placeholder="Enter unit's barcode…" value={scanCode}
                       onChange={e => setScanCode(e.target.value)}
                       onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleScan(); } }} />
                <Button type="button" variant="outline" onClick={handleScan}>
                  <ScanLine className="mr-1 h-4 w-4" /> Add
                </Button>
              </div>
              {scanErr && <p className="text-xs text-destructive">{scanErr}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Or pick from the list ({eligible.length} eligible)</Label>
                {picked.size > 0 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
                    Clear ({picked.size})
                  </Button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {eligible.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    {mode === "out" ? "No units available to check out." : "No units to check in."}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {eligible.map(u => (
                      <li key={u.id}>
                        <label className="flex items-center gap-3 p-2 hover:bg-accent cursor-pointer">
                          <input type="checkbox" checked={picked.has(u.id)}
                                 onChange={() => toggle(u.id)} />
                          <div className="font-mono text-sm w-12">#{u.unitNumber}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">
                              {u.serialNumber || <span className="text-muted-foreground italic">No serial</span>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {u.assignedToName ? `Out with ${u.assignedToName}` : "Available"}
                              {u.primaryTagCode && ` · ${u.primaryTagCode}`}
                            </div>
                          </div>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

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
              <Button type="submit" disabled={submit.isPending || picked.size === 0}>
                {submit.isPending ? "Saving…" : `${verb} ${picked.size || ""} unit${picked.size === 1 ? "" : "s"}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
