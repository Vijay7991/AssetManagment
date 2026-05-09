import { Badge } from "@/components/ui/card";

export function prettyStatus(s: string) {
  return s.replace(/([A-Z])/g, " $1").trim();
}

export function StatusBadge({ status }: { status: string }) {
  const variant: Parameters<typeof Badge>[0]["variant"] =
    status === "InService" ? "success" :
    status === "InRepair" ? "warning" :
    status === "Lost" || status === "Retired" ? "destructive" :
    "secondary";
  return <Badge variant={variant}>{prettyStatus(status)}</Badge>;
}
