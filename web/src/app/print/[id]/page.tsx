"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api, AssetDetail } from "@/lib/api";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrintPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
      <PrintContent />
    </Suspense>
  );
}

function PrintContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken, loading } = useAuth();

  const count = Math.min(200, Math.max(1, parseInt(searchParams.get("count") || "1", 10)));

  const asset = useQuery({
    queryKey: ["asset-print", params.id],
    queryFn: () => api.get<AssetDetail>(`/assets/${params.id}`, accessToken),
    enabled: !!accessToken && !!params.id,
  });

  // Auto-trigger print once asset data arrives
  useEffect(() => {
    if (!asset.data) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [asset.data]);

  // Navigate back after the print dialog closes
  useEffect(() => {
    const onAfterPrint = () => router.back();
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [router]);

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!loading && !accessToken) router.replace("/login");
  }, [loading, accessToken, router]);

  if (loading || !accessToken) return null;

  if (asset.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading asset…
      </div>
    );
  }

  if (asset.isError || !asset.data) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-3">
        <p className="text-sm text-destructive">Asset not found.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/assets"><ArrowLeft className="mr-2 h-4 w-4" /> Back to assets</Link>
        </Button>
      </div>
    );
  }

  const a = asset.data;
  const primaryTag = a.tags.find(t => t.status === "Active") || a.tags[0];

  if (!primaryTag) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-3">
        <p className="text-sm text-muted-foreground">No active QR tag found for this asset.</p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/assets/${params.id}`}><ArrowLeft className="mr-2 h-4 w-4" /> Back to asset</Link>
        </Button>
      </div>
    );
  }

  // Prefer SVG for crisp print quality
  const qrSvgUrl = primaryTag.qrUrl.replace("/qr.png", "/qr.svg");
  const labels = Array.from({ length: count });

  return (
    <div className="min-h-screen bg-white">
      {/* Screen-only toolbar — hidden when printing */}
      <div className="print-hide sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-2 shadow-sm">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/assets/${params.id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to asset
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground flex-1">
          Printing <strong>{count}</strong> label{count !== 1 ? "s" : ""} for&nbsp;
          <strong>{a.name}</strong>
        </span>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
      </div>

      {/* Label grid — shown on screen as preview; printed as-is */}
      <div className="print-label-grid">
        {labels.map((_, i) => (
          <div key={i} className="print-label-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSvgUrl}
              alt={`QR ${primaryTag.code}`}
              className="print-label-qr"
            />
            <div className="print-label-name">{a.name}</div>
            <div className="print-label-code">{primaryTag.code}</div>
            {a.locationName && (
              <div className="print-label-location">{a.locationName}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
