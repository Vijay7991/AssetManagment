"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/card";
import {
  Building2, Copy, Crown, KeyRound, Mail, MailCheck, MailX,
  Power, PowerOff, Search, Settings, Shield, ShieldCheck, ShieldOff,
  Trash2, Users, X,
} from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";

type RootUser = {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  isActive: boolean;
  isRootAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  deactivatedAt: string | null;
  memberships: { tenantId: string; tenantName: string; role: string; isOwner: boolean }[];
};

type RootTenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: string;
  memberCount: number;
  assetCount: number;
};

type RootResetResponse = { resetLink: string; expiresAt: string };
type MailSettings = {
  enabled: boolean;
  updatedAt: string | null;
  updatedByUserId: string | null;
  categories: Record<string, boolean>;
};

const MAIL_CATEGORIES: { key: string; label: string; description: string }[] = [
  { key: "invites",       label: "Invitations",          description: "Workspace invite emails sent to new members" },
  { key: "assets",        label: "Asset assignment",      description: "Notifies users when an asset is assigned to them" },
  { key: "maintenance",   label: "Maintenance updates",  description: "Ticket completed / cancelled notifications" },
  { key: "notifications", label: "In-app notifications", description: "Email copy of in-app activity notifications" },
  { key: "warranty",      label: "Warranty expiry",      description: "Bundled weekly warnings for expiring warranties" },
];

export default function RootAdminPage() {
  const { accessToken, user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"users" | "tenants" | "settings">("users");
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const isRoot = !!user?.isRootAdmin;

  const users = useQuery({
    queryKey: ["root-users"],
    queryFn: () => api.get<RootUser[]>("/root/users", accessToken),
    enabled: !!accessToken && isRoot,
  });

  const tenants = useQuery({
    queryKey: ["root-tenants"],
    queryFn: () => api.get<RootTenant[]>("/root/tenants", accessToken),
    enabled: !!accessToken && isRoot && tab === "tenants",
  });

  const mailSettings = useQuery({
    queryKey: ["root-mail-settings"],
    queryFn: () => api.get<MailSettings>("/root/settings/mail", accessToken),
    enabled: !!accessToken && isRoot,
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/root/users/${id}/active`, { isActive }, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["root-users"] }),
    onError: (e: any) => setErr(e?.message || "Could not update account."),
  });

  const setRoot = useMutation({
    mutationFn: ({ id, isRoot }: { id: string; isRoot: boolean }) =>
      api.put(`/root/users/${id}/root`, { isActive: isRoot }, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["root-users"] }),
    onError: (e: any) => setErr(e?.message || "Could not change root status."),
  });

  const resetPassword = useMutation({
    mutationFn: ({ id }: { id: string; email: string }) =>
      api.post<RootResetResponse>(`/root/users/${id}/reset-password`, {}, accessToken),
    onSuccess: (data, vars) => {
      setResetLink({ email: vars.email, link: data.resetLink });
      setErr(null);
    },
    onError: (e: any) => setErr(e?.message || "Could not send reset link."),
  });

  const removeUser = useMutation({
    mutationFn: (id: string) => api.del(`/root/users/${id}`, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["root-users"] }),
    onError: (e: any) => setErr(e?.message || "Could not delete user."),
  });

  const toggleMail = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<MailSettings>("/root/settings/mail", { enabled }, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["root-mail-settings"] });
      qc.invalidateQueries({ queryKey: ["mail-health"] });
      setErr(null);
    },
    onError: (e: any) => setErr(e?.message || "Could not update mail settings."),
  });

  const toggleCategory = useMutation({
    mutationFn: ({ category, enabled }: { category: string; enabled: boolean }) =>
      api.put<MailSettings>(`/root/settings/mail/categories/${category}`, { enabled }, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["root-mail-settings"] }),
    onError: (e: any) => setErr(e?.message || "Could not update category."),
  });

  const filteredUsers = useMemo(() => {
    if (!users.data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return users.data;
    return users.data.filter(u =>
      u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.memberships.some(m => m.tenantName.toLowerCase().includes(q))
    );
  }, [users.data, query]);

  const filteredTenants = useMemo(() => {
    if (!tenants.data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return tenants.data;
    return tenants.data.filter(t =>
      t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
  }, [tenants.data, query]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(c => c === key ? null : c), 2000);
    });
  }

  if (!isRoot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not authorized</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The platform admin console is only available to the root admin. If you
            need access, ask the operator to set <code>RootAdmin__Email</code>
            in their environment file.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Shield className="h-6 w-6" /> Platform admin
          </h2>
          <p className="text-sm text-muted-foreground">
            Every account and workspace on this install.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={tab === "users" ? "default" : "outline"} onClick={() => setTab("users")}>
            <Users className="mr-2 h-4 w-4" /> Users
          </Button>
          <Button size="sm" variant={tab === "tenants" ? "default" : "outline"} onClick={() => setTab("tenants")}>
            <Building2 className="mr-2 h-4 w-4" /> Workspaces
          </Button>
          <Button size="sm" variant={tab === "settings" ? "default" : "outline"} onClick={() => setTab("settings")}>
            <Settings className="mr-2 h-4 w-4" /> Settings
          </Button>
        </div>
      </div>

      {tab !== "settings" && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={tab === "users" ? "Filter by email, name, workspace…" : "Filter workspaces…"}
                 value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      )}

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </div>
      )}

      {/* ── Users tab ── */}
      {tab === "users" && (
        <Card>
          <CardHeader>
            <CardTitle>All users ({users.data?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {users.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {users.data && (
              <ul className="divide-y">
                {filteredUsers.map(u => {
                  const isSelf = user?.id === u.id;
                  return (
                    <li key={u.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={cn(
                          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          u.isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {(u.displayName || u.email).slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 font-medium">
                            <span className={cn(!u.isActive && "text-muted-foreground line-through")}>
                              {u.displayName || u.email}
                            </span>
                            {u.isRootAdmin && (
                              <Badge variant="warning" className="gap-1">
                                <Crown className="h-3 w-3" /> Root
                              </Badge>
                            )}
                            {isSelf && <Badge variant="outline">You</Badge>}
                            {!u.isActive && <Badge variant="destructive">Deactivated</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                          <div className="text-xs text-muted-foreground">
                            Joined {relativeTime(u.createdAt)}
                            {u.lastLoginAt && <> · Last login {relativeTime(u.lastLoginAt)}</>}
                          </div>
                          {u.memberships.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {u.memberships.map(m => (
                                <Badge key={m.tenantId} variant="secondary" className="text-xs">
                                  {m.isOwner && <Crown className="mr-1 h-3 w-3" />}
                                  {m.tenantName} · {m.role}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline"
                                disabled={resetPassword.isPending}
                                onClick={() => resetPassword.mutate({ id: u.id, email: u.email })}
                                title="Email a reset link">
                          <KeyRound className="mr-1 h-3 w-3" /> Reset
                        </Button>
                        {!isSelf && (
                          u.isRootAdmin ? (
                            <Button size="sm" variant="outline"
                                    onClick={() => {
                                      if (confirm(`Demote ${u.displayName} from root admin?`)) {
                                        setRoot.mutate({ id: u.id, isRoot: false });
                                      }
                                    }}>
                              <ShieldOff className="mr-1 h-3 w-3" /> Demote
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline"
                                    onClick={() => {
                                      if (confirm(`Promote ${u.displayName} to root admin? They will see every workspace.`)) {
                                        setRoot.mutate({ id: u.id, isRoot: true });
                                      }
                                    }}>
                              <ShieldCheck className="mr-1 h-3 w-3" /> Make root
                            </Button>
                          )
                        )}
                        {!isSelf && (
                          u.isActive ? (
                            <Button size="sm" variant="outline"
                                    onClick={() => {
                                      if (confirm(`Deactivate ${u.displayName}? They will be signed out immediately.`)) {
                                        setActive.mutate({ id: u.id, isActive: false });
                                      }
                                    }}>
                              <PowerOff className="mr-1 h-3 w-3" /> Deactivate
                            </Button>
                          ) : (
                            <Button size="sm"
                                    onClick={() => setActive.mutate({ id: u.id, isActive: true })}>
                              <Power className="mr-1 h-3 w-3" /> Activate
                            </Button>
                          )
                        )}
                        {!isSelf && !u.isRootAdmin && !u.memberships.some(m => m.isOwner) && (
                          <Button size="icon" variant="ghost"
                                  onClick={() => {
                                    if (confirm(`Permanently delete ${u.email}? This cannot be undone.`)) {
                                      removeUser.mutate(u.id);
                                    }
                                  }}
                                  title="Delete user">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <li className="py-6 text-center text-sm text-muted-foreground">No users match that filter.</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Workspaces tab ── */}
      {tab === "tenants" && (
        <Card>
          <CardHeader>
            <CardTitle>All workspaces ({tenants.data?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {tenants.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {tenants.data && (
              <ul className="divide-y">
                {filteredTenants.map(t => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{t.slug}</span> · Created {relativeTime(t.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <Badge variant="secondary">{t.plan}</Badge>
                      <Badge variant={t.status === "Active" ? "secondary" : "destructive"}>{t.status}</Badge>
                      <span className="text-muted-foreground">{t.memberCount} members · {t.assetCount} assets</span>
                    </div>
                  </li>
                ))}
                {filteredTenants.length === 0 && (
                  <li className="py-6 text-center text-sm text-muted-foreground">No workspaces match that filter.</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Settings tab ── */}
      {tab === "settings" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" /> Email delivery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {mailSettings.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {mailSettings.data && (
                <>
                  {/* Global toggle */}
                  <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="flex items-center gap-3">
                      {mailSettings.data.enabled ? (
                        <MailCheck className="h-8 w-8 text-green-500 flex-shrink-0" />
                      ) : (
                        <MailX className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                      )}
                      <div>
                        <div className="font-medium">
                          {mailSettings.data.enabled ? "Email delivery is enabled" : "Email delivery is disabled"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {mailSettings.data.enabled
                            ? "Master switch is on. Use the category toggles below to control which emails are sent."
                            : "No emails will be sent regardless of category settings."}
                        </div>
                        {mailSettings.data.updatedAt && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Last changed {relativeTime(mailSettings.data.updatedAt)}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant={mailSettings.data.enabled ? "outline" : "default"}
                      disabled={toggleMail.isPending}
                      onClick={() => toggleMail.mutate(!mailSettings.data!.enabled)}
                      className="flex-shrink-0"
                    >
                      {toggleMail.isPending ? "Saving…" : mailSettings.data.enabled ? "Disable all" : "Enable"}
                    </Button>
                  </div>

                  {/* Per-category toggles */}
                  {mailSettings.data.enabled && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                        Email categories — disable to save quota
                      </p>
                      <p className="text-xs text-muted-foreground px-1">
                        Auth emails (password reset, welcome, email verification) are always sent and cannot be disabled.
                      </p>
                      <div className="divide-y rounded-lg border">
                        {MAIL_CATEGORIES.map(cat => {
                          const isOn = mailSettings.data!.categories[cat.key] !== false;
                          const pending = toggleCategory.isPending &&
                            (toggleCategory.variables as any)?.category === cat.key;
                          return (
                            <div key={cat.key}
                                 className="flex items-center justify-between gap-4 px-4 py-3">
                              <div>
                                <div className="text-sm font-medium">{cat.label}</div>
                                <div className="text-xs text-muted-foreground">{cat.description}</div>
                              </div>
                              <Button size="sm"
                                variant={isOn ? "outline" : "secondary"}
                                disabled={pending}
                                onClick={() => toggleCategory.mutate({ category: cat.key, enabled: !isOn })}
                                className="flex-shrink-0 min-w-[72px]"
                              >
                                {pending ? "…" : isOn ? "On" : "Off"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Requirements for email to work:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li><code>RESEND_API_KEY</code> must be set in your environment file</li>
                      <li>Sending domain must be verified in your Resend account</li>
                      <li>Email delivery must be enabled above (currently <b>{mailSettings.data.enabled ? "on" : "off"}</b>)</li>
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Reset link modal ── */}
      {resetLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
             onClick={() => setResetLink(null)}>
          <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Reset link created</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setResetLink(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                We emailed a reset link to <b className="text-foreground">{resetLink.email}</b>.
                You can also share the link directly — it expires in 1 hour and is single-use.
              </p>
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2">
                <span className="truncate font-mono text-xs">{resetLink.link}</span>
                <Button size="sm" variant="outline" onClick={() => copy(resetLink.link, "reset")}>
                  <Copy className="mr-1 h-3 w-3" />
                  {copied === "reset" ? "Copied" : "Copy"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
