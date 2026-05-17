"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useCan } from "@/lib/auth-context";
import { api, PERMISSIONS } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/card";
import { Copy, Crown, KeyRound, Mail, MessageCircle, Power, PowerOff, Shield, UserPlus, Users, X } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";

type Member = {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  isOwner: boolean;
  isActive: boolean;
  permissions: string[];
  extraPermissions: string[];
  joinedAt: string;
  // True when this user holds the platform-level root-admin flag. Used to
  // hide role/reset/deactivate/remove buttons in the UI; the API blocks the
  // operations server-side too.
  isRootAdmin: boolean;
};

type AdminResetResponse = { resetLink: string; expiresAt: string };
type Invite = {
  id: string;
  email: string;
  phone: string | null;
  role: string;
  expiresAt: string;
  accepted: boolean;
  inviteLink: string;
  whatsAppLink: string | null;
};

type MailHealth = { enabled: boolean; lastChecked: string; reason: string | null };

export default function MembersPage() {
  const { accessToken, activeTenant, user } = useAuth();
  const canManage = useCan("members:write");
  const qc = useQueryClient();
  // Channel defaults to WhatsApp only if mail is down — initial render uses
  // Email and we flip it once the probe answers.
  const [form, setForm] = useState({ email: "", role: "Member", phone: "", channel: "Email" });
  const [err, setErr] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [permsFor, setPermsFor] = useState<Member | null>(null);
  const [resetLink, setResetLink] = useState<{ email: string; link: string } | null>(null);

  // The mail probe is public, but we still pass the token so the standard
  // request helper doesn't trip on the credentials/CORS combo.
  const mailHealth = useQuery({
    queryKey: ["mail-health"],
    queryFn: () => api.get<MailHealth>("/health/mail", accessToken),
    enabled: !!accessToken && canManage,
    refetchInterval: 60_000,
  });
  const emailAvailable = mailHealth.data?.enabled !== false;  // assume yes until proven no

  // If the probe comes back negative and the form is still on Email, pivot to
  // WhatsApp so the admin doesn't try to send an invite that'll be rejected.
  useEffect(() => {
    if (mailHealth.data && !mailHealth.data.enabled) {
      setForm(f => f.channel === "Email" ? { ...f, channel: "WhatsApp" } : f);
    }
  }, [mailHealth.data]);

  const members = useQuery({
    queryKey: ["members"],
    queryFn: () => api.get<Member[]>("/tenant/members", accessToken),
    enabled: !!accessToken && canManage,
  });
  const invites = useQuery({
    queryKey: ["invites"],
    queryFn: () => api.get<Invite[]>("/tenant/invites", accessToken),
    enabled: !!accessToken && canManage,
  });

  const invite = useMutation({
    mutationFn: (body: any) => api.post<Invite>("/tenant/invites", body, accessToken),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      setForm({ email: "", role: "Member", phone: "", channel: form.channel });
      setErr(null);
      setLastInvite(created);
      if (created.whatsAppLink && form.channel === "WhatsApp") {
        window.open(created.whatsAppLink, "_blank", "noopener");
      }
    },
    onError: (e: any) => setErr(e?.message || "Could not create invite."),
  });

  const revokeInvite = useMutation({
    mutationFn: (id: string) => api.del(`/tenant/invites/${id}`, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites"] }),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.del(`/tenant/members/${userId}`, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
    onError: (e: any) => setErr(e?.message || "Could not remove member."),
  });

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.put(`/tenant/members/${userId}/role`, { role }, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
    onError: (e: any) => setErr(e?.message || "Could not change role."),
  });

  const setActive = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      api.put(`/tenant/members/${userId}/active`, { isActive }, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
    onError: (e: any) => setErr(e?.message || "Could not update account status."),
  });

  const resetPassword = useMutation({
    mutationFn: ({ userId }: { userId: string; email: string }) =>
      api.post<AdminResetResponse>(`/tenant/members/${userId}/reset-password`, {}, accessToken),
    onSuccess: (data, vars) => {
      setResetLink({ email: vars.email, link: data.resetLink });
      setErr(null);
    },
    onError: (e: any) => setErr(e?.message || "Could not send reset link."),
  });

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-2 text-center">
        <Users className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Access restricted</h2>
        <p className="text-sm text-muted-foreground">You need member management permission to view this page.</p>
      </div>
    );
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(c => c === key ? null : c), 2000);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Members</h2>
        <p className="text-sm text-muted-foreground">People who can access {activeTenant?.name}.</p>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Active members</CardTitle>
          </CardHeader>
          <CardContent>
            {members.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {members.data && (
              <ul className="divide-y">
                {members.data.map(m => {
                  const isSelf = user?.id === m.userId;
                  // The root admin's row is read-only for everyone except
                  // another root admin. Server enforces the same rule; this
                  // just hides the buttons so we don't dangle a 403-able UI.
                  const isProtectedRoot = m.isRootAdmin && !user?.isRootAdmin;
                  return (
                    <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                          m.isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {(m.displayName || m.email).slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-1.5">
                            <span className={cn(!m.isActive && "text-muted-foreground line-through")}>
                              {m.displayName}
                            </span>
                            {m.isOwner && (
                              <Badge variant="warning" className="gap-1">
                                <Crown className="h-3 w-3" /> Owner
                              </Badge>
                            )}
                            {isSelf && <Badge variant="outline">You</Badge>}
                            {m.isRootAdmin && (
                              <Badge variant="secondary" className="gap-1">
                                <Shield className="h-3 w-3" /> Root
                              </Badge>
                            )}
                            {!m.isActive && <Badge variant="destructive">Deactivated</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {m.email} · joined {relativeTime(m.joinedAt)}
                          </div>
                          {m.role === "Member" && m.extraPermissions.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {m.extraPermissions.map(p => (
                                <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {canManage && !m.isOwner && !isProtectedRoot ? (
                          <Select value={m.role} onChange={e => updateRole.mutate({ userId: m.userId, role: e.target.value })}
                                  className="w-32" disabled={!m.isActive}>
                            <option value="Member">Member</option>
                            <option value="Manager">Manager</option>
                            <option value="Admin">Admin</option>
                          </Select>
                        ) : (
                          <Badge variant="outline">{m.role}</Badge>
                        )}
                        {canManage && m.role === "Member" && !isProtectedRoot && (
                          <Button size="sm" variant="outline" onClick={() => setPermsFor(m)}>
                            <Shield className="mr-1 h-3 w-3" /> Permissions
                          </Button>
                        )}
                        {canManage && !isSelf && !isProtectedRoot && (
                          <Button size="sm" variant="outline"
                                  onClick={() => resetPassword.mutate({ userId: m.userId, email: m.email })}
                                  disabled={resetPassword.isPending}
                                  title="Email a password reset link">
                            <KeyRound className="mr-1 h-3 w-3" /> Reset password
                          </Button>
                        )}
                        {canManage && !isSelf && !m.isOwner && !isProtectedRoot && (
                          m.isActive ? (
                            <Button size="sm" variant="outline"
                                    onClick={() => {
                                      if (confirm(`Deactivate ${m.displayName}? They will be signed out immediately.`)) {
                                        setActive.mutate({ userId: m.userId, isActive: false });
                                      }
                                    }}
                                    title="Deactivate account">
                              <PowerOff className="mr-1 h-3 w-3" /> Deactivate
                            </Button>
                          ) : (
                            <Button size="sm"
                                    onClick={() => setActive.mutate({ userId: m.userId, isActive: true })}
                                    title="Reactivate account">
                              <Power className="mr-1 h-3 w-3" /> Activate
                            </Button>
                          )
                        )}
                        {canManage && !isSelf && !m.isOwner && !isProtectedRoot && (
                          <Button size="icon" variant="ghost"
                                  onClick={() => removeMember.mutate(m.userId)}
                                  title="Remove member">
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle>Invite teammate</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={e => {
                e.preventDefault();
                if (form.channel === "WhatsApp" && !form.phone) {
                  setErr("Phone number required for WhatsApp.");
                  return;
                }
                invite.mutate({
                  email: form.email,
                  role: form.role,
                  phone: form.phone || null,
                  channel: form.channel,
                });
              }} className="space-y-3">
                <div className="space-y-2">
                  <Label>Channel</Label>
                  {emailAvailable ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" size="sm"
                        variant={form.channel === "Email" ? "default" : "outline"}
                        onClick={() => setForm(f => ({ ...f, channel: "Email" }))}>
                        <Mail className="mr-2 h-4 w-4" /> Email
                      </Button>
                      <Button type="button" size="sm"
                        variant={form.channel === "WhatsApp" ? "default" : "outline"}
                        onClick={() => setForm(f => ({ ...f, channel: "WhatsApp" }))}>
                        <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-2">
                        <Button type="button" size="sm" variant="default">
                          <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {mailHealth.data?.reason?.includes("disabled by an administrator")
                          ? <>
                              Email delivery is disabled.{" "}
                              {user?.isRootAdmin
                                ? <a href="/admin" className="underline text-primary">Enable it in Admin → Settings.</a>
                                : "Contact your platform administrator to enable it."}
                            </>
                          : "Email delivery isn't reachable from the server right now — invites can only be sent via WhatsApp."
                        }
                      </p>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="iemail">Email{form.channel === "WhatsApp" ? " (optional)" : ""}</Label>
                  <Input id="iemail" type="email" required={form.channel !== "WhatsApp"}
                         value={form.email}
                         onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>

                {form.channel === "WhatsApp" && (
                  <div className="space-y-2">
                    <Label htmlFor="iphone">Phone (with country code, digits only)</Label>
                    <Input id="iphone" placeholder="e.g. 919876543210" value={form.phone}
                           onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, "") }))} />
                    <p className="text-xs text-muted-foreground">
                      Include country code, no + or spaces.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="irole">Role</Label>
                  <Select id="irole" value={form.role}
                          onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="Member">Member (read-only by default)</option>
                    <option value="Manager">Manager (manage assets)</option>
                    <option value="Admin">Admin (full access)</option>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Members start with read-only access. Grant specific permissions afterward.
                  </p>
                </div>

                <Button type="submit" disabled={invite.isPending}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {invite.isPending ? "Sending…" : "Create invite"}
                </Button>
              </form>

              {lastInvite && (
                <div className="mt-4 rounded-md border p-3 text-xs space-y-2">
                  <p className="font-medium text-foreground text-sm">Invite created.</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground">{lastInvite.inviteLink}</span>
                    <Button size="sm" variant="outline"
                            onClick={() => copy(lastInvite.inviteLink, "link")}>
                      <Copy className="mr-1 h-3 w-3" />{copied === "link" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  {lastInvite.whatsAppLink && (
                    <Button asChild size="sm" className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                      <a href={lastInvite.whatsAppLink} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="mr-2 h-4 w-4" /> Open WhatsApp
                      </a>
                    </Button>
                  )}
                </div>
              )}

              <div className="mt-6 space-y-2">
                <p className="text-sm font-medium">Pending invites</p>
                {invites.data && invites.data.length === 0 && (
                  <p className="text-xs text-muted-foreground">None.</p>
                )}
                <ul className="space-y-2">
                  {invites.data?.filter(i => !i.accepted).map(i => (
                    <li key={i.id} className="flex flex-col gap-1 rounded-md border p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {i.email || i.phone}
                          <span className="text-muted-foreground"> · {i.role}</span>
                        </span>
                        <Button size="icon" variant="ghost" onClick={() => revokeInvite.mutate(i.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => copy(i.inviteLink, `link-${i.id}`)}>
                          <Copy className="mr-1 h-3 w-3" />
                          {copied === `link-${i.id}` ? "Copied" : "Copy link"}
                        </Button>
                        {i.whatsAppLink && (
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                            <a href={i.whatsAppLink} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="mr-1 h-3 w-3" /> WhatsApp
                            </a>
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {permsFor && (
        <PermissionsModal
          member={permsFor}
          onClose={() => setPermsFor(null)}
          onSaved={() => { setPermsFor(null); qc.invalidateQueries({ queryKey: ["members"] }); }}
        />
      )}

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
                <Button size="sm" variant="outline"
                        onClick={() => copy(resetLink.link, "reset-link")}>
                  <Copy className="mr-1 h-3 w-3" />
                  {copied === "reset-link" ? "Copied" : "Copy"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function PermissionsModal({ member, onClose, onSaved }: {
  member: Member;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { accessToken } = useAuth();
  const [selected, setSelected] = useState<string[]>(member.extraPermissions || []);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.put<Member>(`/tenant/members/${member.userId}/permissions`, {
      extraPermissions: selected,
    }, accessToken),
    onSuccess: () => onSaved(),
    onError: (e: any) => setErr(e?.message || "Could not save permissions."),
  });

  function toggle(key: string) {
    setSelected(s => s.includes(key) ? s.filter(p => p !== key) : [...s, key]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Permissions for {member.displayName}</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Members are read-only by default. Tick what you want them to be able to do.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {PERMISSIONS.filter(p => p.key !== "members:write").map(p => (
              <label key={p.key} className="flex items-start gap-3 rounded-md border p-3 hover:bg-accent cursor-pointer">
                <input type="checkbox" className="mt-1"
                       checked={selected.includes(p.key)}
                       onChange={() => toggle(p.key)} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs font-mono text-muted-foreground">{p.key}</div>
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Note: changes take effect when the member next signs in or refreshes their session
            (within ~60 minutes for active sessions).
          </p>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
