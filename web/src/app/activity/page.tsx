"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api, AuditEvent, Paged } from "@/lib/api";
import { Card, CardContent, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";
import { relativeTime } from "@/lib/utils";

const VERB_TONE: Record<string, "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  Created: "success",
  Updated: "secondary",
  Deleted: "destructive",
  CheckedOut: "warning",
  CheckedIn: "success",
  Moved: "secondary",
  Imported: "outline",
  StatusChanged: "secondary",
};

export default function ActivityPage() {
  const { accessToken } = useAuth();
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const list = useQuery({
    queryKey: ["audit", page],
    queryFn: () => api.get<Paged<AuditEvent>>(`/audit?page=${page}&pageSize=${pageSize}`, accessToken),
    enabled: !!accessToken,
  });

  const totalPages = Math.max(1, Math.ceil((list.data?.total || 0) / pageSize));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Activity</h2>
        <p className="text-sm text-muted-foreground">Append-only log of changes in this workspace.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {list.isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
          {list.data && list.data.items.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Activity className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            </div>
          )}
          {list.data && list.data.items.length > 0 && (
            <ul className="divide-y">
              {list.data.items.map(e => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <Badge variant={VERB_TONE[e.verb] || "secondary"}>{e.verb}</Badge>
                  <div className="flex-1 min-w-0">
                    {e.entityType === "Asset" && e.entityId ? (
                      <Link href={`/assets/${e.entityId}`} className="font-medium hover:underline">
                        {e.summary}
                      </Link>
                    ) : (
                      <span className="font-medium">{e.summary}</span>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {e.entityType} · {e.actorEmail || "system"} · {relativeTime(e.at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {list.data && list.data.total > pageSize && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {list.data.page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
