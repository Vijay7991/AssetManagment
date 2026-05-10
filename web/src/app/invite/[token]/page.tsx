"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxes, CheckCircle2 } from "lucide-react";

type InvitePreview = {
  tenantName: string;
  email: string;
  role: string;
};

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [form, setForm] = useState({ displayName: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!params.token) return;
    api.get<InvitePreview>(`/invites/preview/${params.token}`)
      .then(setPreview)
      .catch((e: any) => setPreviewError(e?.status === 404
        ? "This invite link is invalid, expired, or already used."
        : "Could not load invite."));
  }, [params.token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.post("/invites/accept", {
        token: params.token,
        password: form.password,
        displayName: form.displayName || preview?.email,
      });
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (e: any) {
      setErr(e?.message || "Could not accept invite.");
    } finally {
      setBusy(false);
    }
  }

  if (previewError) {
    return (
      <Wrapper>
        <Card>
          <CardHeader>
            <CardTitle>Invite link not valid</CardTitle>
            <CardDescription>{previewError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/login">Go to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </Wrapper>
    );
  }

  if (!preview) {
    return (
      <Wrapper>
        <p className="text-center text-sm text-muted-foreground">Loading invite…</p>
      </Wrapper>
    );
  }

  if (done) {
    return (
      <Wrapper>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> You're in
            </CardTitle>
            <CardDescription>
              Welcome to <span className="font-medium">{preview.tenantName}</span>. Redirecting you to sign in…
            </CardDescription>
          </CardHeader>
        </Card>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Card>
        <CardHeader>
          <CardTitle>Join {preview.tenantName}</CardTitle>
          <CardDescription>
            You've been invited as <span className="font-medium">{preview.role}</span> with email{" "}
            <span className="font-mono text-xs">{preview.email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dn">Your name</Label>
              <Input id="dn" required value={form.displayName}
                     onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">Choose a password (min 8 chars)</Label>
              <Input id="pw" type="password" required minLength={8} value={form.password}
                     onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              <p className="text-xs text-muted-foreground">
                If you already have an AssetHub account with this email, sign in instead — the invite will attach automatically.
              </p>
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Joining…" : `Join ${preview.tenantName}`}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-foreground underline">Sign in</Link>
              {" "}then return to this link.
            </p>
          </form>
        </CardContent>
      </Card>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2 text-2xl font-semibold">
          <Boxes className="h-7 w-7" /> AssetHub
        </div>
        {children}
      </div>
    </div>
  );
}
