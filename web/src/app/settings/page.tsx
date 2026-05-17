"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { CheckCircle2, Smartphone } from "lucide-react";

const ANDROID_APK_URL =
  "https://expo.dev/accounts/vijayamni/projects/assethub-mobile/builds/39dee09e-342d-4112-b357-5ef8d7a8e2c7";

export default function SettingsPage() {
  const { user, activeTenant, accessToken, logout } = useAuth();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(null); setPwOk(false);
    if (pw.next.length < 8) { setPwErr("New password must be at least 8 characters."); return; }
    if (pw.next !== pw.confirm) { setPwErr("New passwords don't match."); return; }
    setPwBusy(true);
    try {
      await api.post("/auth/change-password",
        { currentPassword: pw.current, newPassword: pw.next }, accessToken);
      setPw({ current: "", next: "", confirm: "" });
      setPwOk(true);
    } catch (e: any) {
      setPwErr(e?.message || "Could not change password.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Account and workspace info.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your personal profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row label="Name">{user?.displayName}</Row>
          <Row label="Email">{user?.email}</Row>
          <Row label="Phone">{user?.phone || "—"}</Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Update the password used to sign in to AssetHub.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="cpw">Current password</Label>
              <Input id="cpw" type="password" required value={pw.current}
                     onChange={e => setPw(s => ({ ...s, current: e.target.value }))}
                     autoComplete="current-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="npw">New password</Label>
              <Input id="npw" type="password" required minLength={8} value={pw.next}
                     onChange={e => setPw(s => ({ ...s, next: e.target.value }))}
                     autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="npw2">Confirm new password</Label>
              <Input id="npw2" type="password" required minLength={8} value={pw.confirm}
                     onChange={e => setPw(s => ({ ...s, confirm: e.target.value }))}
                     autoComplete="new-password" />
            </div>
            {pwErr && <p className="text-sm text-destructive">{pwErr}</p>}
            {pwOk && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Password updated.</span>
              </div>
            )}
            <Button type="submit" disabled={pwBusy}>
              {pwBusy ? "Saving…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>The active tenant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row label="Name">{activeTenant?.name}</Row>
          <Row label="Slug"><span className="font-mono">{activeTenant?.slug}</span></Row>
          <Row label="Plan">{activeTenant?.plan}</Row>
          <Row label="Your role">{activeTenant?.role}</Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" /> Mobile app
          </CardTitle>
          <CardDescription>
            Get the AssetHub Android app to scan QR codes and manage assets on the go.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            Compatible with Android 8.0 and above.
          </div>
          <Button asChild>
            <a href={ANDROID_APK_URL} target="_blank" rel="noopener noreferrer">
              <Smartphone className="mr-2 h-4 w-4" /> Download APK
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign out</CardTitle>
          <CardDescription>End your current session.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={logout}>Sign out</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
