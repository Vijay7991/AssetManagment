"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/card";
import { Copy, Mail, MessageCircle, UserPlus, Users, X } from "lucide-react";
import { relativeTime } from "@/lib/utils";

type Member = { userId: string; email: string; displayName: string; role: string; joinedAt: string };
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

export default function MembersPage() {
  const { accessToken, activeTenant } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: "", role: "Member", phone: "", channel: "Email" });
  const [err, setErr] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const isAdmin = activeTenant?.role === "Admin";

  const members = useQuery({
    queryKey: ["members"],
    queryFn: () => api.get<Member[]>("/tenant/members", accessToken),
    enabled: !!accessToken,
  });
  const invites = useQuery({
    queryKey: ["invites"],
    queryFn: () => api.get<Invite[]>("/tenant/invites", accessToken),
    enabled: !!accessToken && isAdmin,
  });

  const invite = useMutation({
    mutationFn: (body: any) => api.post<Invite>("/tenant/invites", body, accessToken),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      setForm({ email: "", role: "Member", phone: "", channel: form.channel });
      setErr(null);
      setLastInvite(created);
      // Open WhatsApp automatically when channel is WhatsApp
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
  });

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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Active members</CardTitle>
          </CardHeader>
          <CardContent>
            {members.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {members.data && (
              <ul className="divide-y">
                {members.data.map(m => (
                  <li key={m.userId} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {(m.displayName || m.email).slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium">{m.displayName}</div>
                        <div className="text-xs text-muted-foreground">{m.email} · joined {relativeTime(m.joinedAt)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{m.role}</Badge>
                      {isAdmin && (
                        <Button size="icon" variant="ghost" onClick={() => removeMember.mutate(m.userId)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
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
                      Include country code, no + or spaces. Indian number example: 91 then 10 digits.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="irole">Role</Label>
                  <Select id="irole" value={form.role}
                          onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option>Member</option>
                    <option>Manager</option>
                    <option>Admin</option>
                  </Select>
                </div>

                {err && <p className="text-sm text-destructive">{err}</p>}
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
    </div>
  );
}
