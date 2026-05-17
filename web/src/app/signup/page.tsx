"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input, Label, PasswordInput } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxes } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [form, setForm] = useState({
    displayName: "",
    workspaceName: "",
    email: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await signup(form);
      router.push("/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Could not create your account.");
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
            <CardTitle>Create your workspace</CardTitle>
            <CardDescription>Free for individuals. No credit card.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Your name</Label>
                <Input id="displayName" required value={form.displayName}
                       onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspaceName">Workspace name <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="workspaceName" value={form.workspaceName}
                       placeholder="e.g. Acme Construction"
                       onChange={e => setForm(f => ({ ...f, workspaceName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={form.email}
                       onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password <span className="text-muted-foreground">(min 8 chars)</span></Label>
                <PasswordInput id="password" required minLength={8} value={form.password}
                       onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              {err && <p className="text-sm text-destructive">{err}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creating…" : "Create account"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-foreground underline">Sign in</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
