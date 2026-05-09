"use client";

// Tag short-link landing page. The QR code on a printed label encodes
//   https://<host>/t/<code>
// so even a stock camera app opens this URL. If the user is signed in
// and the code matches an asset in their tenant, redirect to the asset.
// Otherwise, send them through login first.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { api, AssetDetail } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxes } from "lucide-react";

export default function TagShortlinkPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<AssetDetail | null>(null);

  useEffect(() => {
    if (loading) return;
    const code = params.code?.toUpperCase();
    if (!code) return;
    if (!user) {
      // Stash where to go after login
      sessionStorage.setItem("postLoginRedirect", `/t/${code}`);
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const asset = await api.get<AssetDetail>(`/tags/scan/${code}`, accessToken);
        setResolved(asset);
        router.replace(`/assets/${asset.id}`);
      } catch (e: any) {
        setError(e?.status === 404
          ? `No asset matches code "${code}" in this workspace.`
          : "Could not look up that tag.");
      }
    })();
  }, [params.code, user, accessToken, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5" /> Tag {params.code?.toUpperCase()}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {!error && !resolved && <p>Looking up…</p>}
          {resolved && <p>Opening {resolved.name}…</p>}
          {error && (
            <>
              <p className="text-destructive">{error}</p>
              <p>
                <Link href="/scan" className="underline">Back to scanner</Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
