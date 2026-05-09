"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/card";
import { UserPlus, Users, X } from "lucide-react";
import { relativeTime } from "@/lib/utils";

type Member = { userId: string; email: string; displayName: string; role: string; joinedAt: string };
type Invite = { id: string; email: string; role: string; expiresAt: string; accepted: boolean };

export default function MembersPage() {
  const { accessToken, activeTenant } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: "", role: "Member" });
  const [err, setErr] = useState<string | null>(null);

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
    mutationFn: (body: any) => api.post("/tenant/invites", body, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      setForm({ email: "", role: "Member" });
      setErr(null);
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
              <form onSubmit={e => { e.preventDefault(); invite.mutate(form); }} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="iemail">Email</Label>
                  <Input id="iemail" type="email" required value={form.email}
                         onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
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
                  <UserPlus className="mr-2 h-4 w-4" />{invite.isPending ? "Sending…" : "Send invite"}
                </Button>
              </form>

              <div className="mt-6 space-y-2">
                <p className="text-sm font-medium">Pending invites</p>
                {invites.data && invites.data.length === 0 && (
                  <p className="text-xs text-muted-foreground">None.</p>
                )}
                <ul className="space-y-1">
                  {invites.data?.filter(i => !i.accepted).map(i => (
                    <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{i.email} <span className="text-muted-foreground">· {i.role}</span></span>
                      <Button size="icon" variant="ghost" onClick={() => revokeInvite.mutate(i.id)}>
                        <X className="h-3 w-3" />
                      </Button>
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
