"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api, AssetListItem, Paged } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Boxes, Plus, ScanLine, ShieldAlert, TrendingUp } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { StatusBadge, prettyStatus } from "@/components/status";

type Stats = {
  total: number;
  byStatus: { status: string; count: number }[];
  recentlyAdded: { id: string; name: string; createdAt: string }[];
  warrantyExpiringSoon: number;
};

export default function DashboardPage() {
  const { accessToken } = useAuth();

  const stats = useQuery({
    queryKey: ["asset-stats"],
    queryFn: () => api.get<Stats>("/assets/stats", accessToken),
    enabled: !!accessToken,
  });

  const recent = useQuery({
    queryKey: ["asset-list-recent"],
    queryFn: () => api.get<Paged<AssetListItem>>("/assets?page=1&pageSize=8", accessToken),
    enabled: !!accessToken,
  });

  const inService = stats.data?.byStatus.find(s => s.status === "InService")?.count || 0;
  const inRepair = stats.data?.byStatus.find(s => s.status === "InRepair")?.count || 0;
  const retired = stats.data?.byStatus.find(s => s.status === "Retired")?.count || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Overview of your workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/scan"><ScanLine className="mr-2 h-4 w-4" /> Scan</Link>
          </Button>
          <Button asChild>
            <Link href="/assets/new"><Plus className="mr-2 h-4 w-4" /> New asset</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total assets" value={stats.data?.total ?? "—"} icon={Boxes} />
        <KpiCard title="In service" value={inService} icon={TrendingUp} />
        <KpiCard title="In repair" value={inRepair} icon={ShieldAlert} variant="warning" />
        <KpiCard title="Warranty expiring (30d)" value={stats.data?.warrantyExpiringSoon ?? 0} icon={ShieldAlert} variant="destructive" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recently added</CardTitle>
              <CardDescription>Latest assets created in this workspace.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/assets">View all →</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recent.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {recent.data?.items.length === 0 && (
              <EmptyState
                title="No assets yet"
                description="Create your first asset to get started."
                cta={<Button asChild><Link href="/assets/new"><Plus className="mr-2 h-4 w-4" />New asset</Link></Button>}
              />
            )}
            {recent.data && recent.data.items.length > 0 && (
              <div className="divide-y">
                {recent.data.items.map(a => (
                  <Link key={a.id} href={`/assets/${a.id}`}
                        className="flex items-center gap-3 py-3 hover:bg-accent/50 -mx-6 px-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                      {a.coverPhotoUrl
                        ? <img src={a.coverPhotoUrl} alt="" className="h-10 w-10 rounded object-cover" />
                        : <Boxes className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.assetType} · {relativeTime(a.createdAt)}
                      </div>
                    </div>
                    <StatusBadge status={a.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status breakdown</CardTitle>
            <CardDescription>Where your assets stand.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.data?.byStatus.map(s => (
              <div key={s.status} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{prettyStatus(s.status)}</span>
                <span className="font-medium">{s.count}</span>
              </div>
            ))}
            {(!stats.data || stats.data.byStatus.length === 0) && (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, variant = "default" }: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  variant?: "default" | "warning" | "destructive";
}) {
  const tone = {
    default: "text-foreground",
    warning: "text-amber-600 dark:text-amber-400",
    destructive: "text-destructive",
  }[variant];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${tone}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold ${tone}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, description, cta }: { title: string; description: string; cta?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Boxes className="h-10 w-10 text-muted-foreground" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {cta}
    </div>
  );
}
