"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label, PasswordInput } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordStrength, validatePassword } from "@/components/ui/password-strength";
import { Boxes, CheckCircle2 } from "lucide-react";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pwErr = validatePassword(password);
    if (pwErr) { setErr(pwErr); return; }
    if (password !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true); setErr(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (e: any) {
      setErr(e?.message || "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2 text-2xl font-semibold">
          <Boxes className="h-7 w-7" /> AssetHub
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Set a new password</CardTitle>
            <CardDescription>
              {done ? "Your password was updated." : "Choose a new password for your account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!token ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">
                  This page needs a reset token in the URL. The link may have been broken or already used.
                </p>
                <p className="text-sm">
                  <Link href="/forgot-password" className="font-medium underline">Request a new reset link</Link>
                </p>
              </div>
            ) : done ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-medium">Password updated.</p>
                    <p className="text-muted-foreground">Redirecting you to sign in…</p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pw">New password</Label>
                  <PasswordInput id="pw" required value={password}
                         onChange={e => setPassword(e.target.value)}
                         autoComplete="new-password" />
                  <PasswordStrength password={password} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw2">Confirm password</Label>
                  <PasswordInput id="pw2" required value={confirm}
                         onChange={e => setConfirm(e.target.value)}
                         autoComplete="new-password" />
                </div>
                {err && <p className="text-sm text-destructive">{err}</p>}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Saving…" : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
