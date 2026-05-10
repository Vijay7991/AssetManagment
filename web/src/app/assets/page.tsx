"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useCan } from "@/lib/auth-context";
import { api, AssetListItem, ImportResult, Location, Paged } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, Badge } from "@/components/ui/card";
import { Boxes, Download, MapPin, Plus, Search, Upload } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { StatusBadge, prettyStatus } from "@/components/status";

const STATUSES = ["InService", "InStorage", "InRepair", "Retired", "Lost"];

export default function AssetsPage() {
  const { accessToken } = useAuth();
  const canWrite = useCan("assets:write");
  const canImport = useCan("import:write");
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [locationId, setLocationId] = useState("");
  const [page, setPage] = useState(1);

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<Location[]>("/locations", accessToken),
    enabled: !!accessToken,
  });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const pageSize = 25;

  const importMut = useMutation({
    mutationFn: (file: File) => api.upload<ImportResult>("/assets/import", file, accessToken),
    onSuccess: (r) => {
      setImportResult(r);
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  function downloadExport() {
    // Browser navigation triggers download; pass token via fetch + blob to keep auth
    fetch((process.env.NEXT_PUBLIC_API_BASE_URL || "/api") + "/assets/export.csv", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `assets-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  const list = useQuery({
    queryKey: ["assets", q, status, locationId, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      if (locationId) params.set("locationId", locationId);
      return api.get<Paged<AssetListItem>>(`/assets?${params}`, accessToken);
    },
    enabled: !!accessToken,
  });

  const totalPages = Math.max(1, Math.ceil((list.data?.total || 0) / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Assets</h2>
          <p className="text-sm text-muted-foreground">
            {list.data ? `${list.data.total} total` : "Loading…"}
          </p>
        </div>
        <div className="flex gap-2">
          {canImport && (
            <>
              <input ref={importInput} type="file" accept=".csv,text/csv" className="hidden"
                     onChange={e => e.target.files?.[0] && importMut.mutate(e.target.files[0])} />
              <Button variant="outline" size="sm" onClick={() => importInput.current?.click()} disabled={importMut.isPending}>
                <Upload className="mr-2 h-4 w-4" /> {importMut.isPending ? "Importing…" : "Import CSV"}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={downloadExport}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          {canWrite && (
            <Button asChild>
              <Link href="/assets/new"><Plus className="mr-2 h-4 w-4" /> New asset</Link>
            </Button>
          )}
        </div>
      </div>

      {importResult && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm">
              Imported <span className="font-medium">{importResult.imported}</span>,
              skipped <span className="font-medium">{importResult.skipped}</span>.
              {importResult.errors.length > 0 && (
                <span className="ml-2 text-muted-foreground">
                  ({importResult.errors.length} errors — first: {importResult.errors[0]})
                </span>
              )}
              <Button variant="ghost" size="sm" className="ml-2" onClick={() => setImportResult(null)}>
                Dismiss
              </Button>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Locations quick-filter strip */}
      {locations.data && locations.data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setLocationId(""); setPage(1); }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              locationId === ""
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent"
            }`}>
            <MapPin className="h-3 w-3" /> All locations
            <span className="text-muted-foreground">
              ({locations.data.reduce((s, l) => s + l.assetCount, 0)})
            </span>
          </button>
          {locations.data.map(l => (
            <button
              key={l.id}
              onClick={() => { setLocationId(l.id); setPage(1); }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                locationId === l.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent"
              }`}>
              <MapPin className="h-3 w-3" />
              {l.name}
              {l.city && <span className="opacity-70">· {l.city}</span>}
              <span className={locationId === l.id ? "" : "text-muted-foreground"}>({l.assetCount})</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search assets…"
            className="pl-9"
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-44">
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{prettyStatus(s)}</option>)}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {list.isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
          {list.data && list.data.items.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Boxes className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No assets match.</p>
                <p className="text-sm text-muted-foreground">
                  {q || status ? "Try clearing your filters." : "Create your first asset."}
                </p>
              </div>
              {!q && !status && (
                <Button asChild>
                  <Link href="/assets/new"><Plus className="mr-2 h-4 w-4" /> New asset</Link>
                </Button>
              )}
            </div>
          )}
          {list.data && list.data.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Asset</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Qty</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Tag</th>
                    <th className="px-4 py-3 font-medium">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.data.items.map(a => (
                    <tr key={a.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <Link href={`/assets/${a.id}`} className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted">
                            {a.coverPhotoUrl
                              ? <img src={a.coverPhotoUrl} alt="" className="h-9 w-9 rounded object-cover" />
                              : <Boxes className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <span className="font-medium">{a.name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.assetType}</td>
                      <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{a.quantity}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.locationName ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {a.locationName}
                            {a.locationDetail && <span className="text-xs opacity-70">· {a.locationDetail}</span>}
                          </span>
                        ) : (a.locationDetail || "—")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{a.primaryTagCode || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{relativeTime(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {list.data && list.data.total > pageSize && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {list.data.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
