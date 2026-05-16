"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxes, CheckCircle2, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      // The backend always 200s regardless of whether the address exists so we
      // can't tell the user whether the email matched — just show a confirmation.
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (e: any) {
      setErr(e?.message || "Could not send reset email.");
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
            <CardTitle>Reset your password</CardTitle>
            <CardDescription>
              {sent
                ? "Check your email for a reset link."
                : "Enter your account email and we'll send you a link to set a new password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                  <div className="space-y-1">
                    <p className="font-medium">If that email is on file, a reset link is on its way.</p>
                    <p className="text-muted-foreground">
                      The link expires in 1 hour. Check your spam folder if you don't see it.
                    </p>
                  </div>
                </div>
                <p className="text-center text-sm">
                  <Link href="/login" className="font-medium underline">Back to sign in</Link>
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email}
                         onChange={e => setEmail(e.target.value)} autoComplete="email" />
                </div>
                {err && <p className="text-sm text-destructive">{err}</p>}
                <Button type="submit" className="w-full" disabled={busy}>
                  <Mail className="mr-2 h-4 w-4" />
                  {busy ? "Sending…" : "Send reset link"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Remembered it?{" "}
                  <Link href="/login" className="font-medium text-foreground underline">Sign in</Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
