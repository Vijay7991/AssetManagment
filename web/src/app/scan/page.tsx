"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { api, AssetDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, ScanLine, Search } from "lucide-react";

export default function ScanPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scannerOn, setScannerOn] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<AssetDetail | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);

  // Lazy-load zxing only when scanner starts
  useEffect(() => {
    if (!scannerOn) return;
    let stopped = false;
    let reader: any = null;
    let controls: any = null;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(
          undefined, videoRef.current!,
          (result: any) => {
            if (!result || stopped) return;
            const text = result.getText();
            // Debounce duplicate scans
            const now = Date.now();
            const last = lastCodeRef.current;
            if (last && last.code === text && now - last.at < 1500) return;
            lastCodeRef.current = { code: text, at: now };
            handleScan(text);
          }
        );
      } catch (e: any) {
        setError(e?.message || "Could not start camera. Camera requires HTTPS.");
        setScannerOn(false);
      }
    })();

    return () => {
      stopped = true;
      try { controls?.stop(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerOn]);

  function extractCode(text: string): string {
    // Accept either a raw code or a /t/<code> URL
    try {
      const url = new URL(text);
      const m = url.pathname.match(/\/t\/([A-Z0-9]+)/i);
      if (m) return m[1].toUpperCase();
    } catch { /* not a URL */ }
    return text.trim().toUpperCase();
  }

  async function handleScan(text: string) {
    const code = extractCode(text);
    if (!code) return;
    try {
      const asset = await api.get<AssetDetail>(`/tags/scan/${code}`, accessToken);
      setLastScan(asset);
      setError(null);
      // Auto-navigate after a brief preview
      setTimeout(() => router.push(`/assets/${asset.id}`), 500);
    } catch (e: any) {
      if (e?.status === 404) setError(`No asset matches code "${code}" in this workspace.`);
      else setError(e?.message || "Lookup failed.");
    }
  }

  function onManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualCode.trim()) handleScan(manualCode.trim());
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Scan</h2>
        <p className="text-sm text-muted-foreground">Point your camera at a QR code, or enter the code manually.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" /> Camera
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="aspect-square w-full overflow-hidden rounded-md bg-black sm:aspect-video">
            {scannerOn ? (
              <video ref={videoRef} className="h-full w-full object-cover" playsInline autoPlay muted />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                Camera off
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {scannerOn ? (
              <Button variant="outline" onClick={() => setScannerOn(false)}>Stop</Button>
            ) : (
              <Button onClick={() => { setScannerOn(true); setError(null); }}>
                <Camera className="mr-2 h-4 w-4" /> Start camera
              </Button>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {lastScan && (
            <div className="rounded-md border bg-muted/50 p-3 text-sm">
              Found: <Link href={`/assets/${lastScan.id}`} className="font-medium underline">{lastScan.name}</Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" /> Manual entry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onManualSubmit} className="flex gap-2">
            <Input
              placeholder="e.g. A7F3K2P9X1"
              value={manualCode}
              onChange={e => setManualCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              className="font-mono uppercase tracking-wider"
            />
            <Button type="submit">Look up</Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tip: install Caddy's root cert on your phone for friction-free HTTPS — see README.
      </p>
    </div>
  );
}
