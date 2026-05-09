"use client";

import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const { user, activeTenant, logout } = useAuth();

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
