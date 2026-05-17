"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api, Notification } from "@/lib/api";
import { cn, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Boxes, ScanLine, Tag as TagIcon, FolderTree,
  Users, Settings, LogOut, Sun, Moon, Menu, X, ChevronDown, Activity,
  Wrench, Bell, MapPin, Shield, Smartphone,
} from "lucide-react";

const ANDROID_APK_URL =
  "https://expo.dev/accounts/vijayamni/projects/assethub-mobile/builds/39dee09e-342d-4112-b357-5ef8d7a8e2c7";

const NAV: { label: string; href: string; icon: typeof LayoutDashboard; rootOnly?: boolean; permission?: string }[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Assets", href: "/assets", icon: Boxes },
  { label: "Scan", href: "/scan", icon: ScanLine },
  { label: "Maintenance", href: "/maintenance", icon: Wrench },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Locations", href: "/locations", icon: MapPin, permission: "catalog:write" },
  { label: "Categories", href: "/categories", icon: FolderTree, permission: "catalog:write" },
  { label: "Asset Types", href: "/asset-types", icon: TagIcon, permission: "catalog:write" },
  { label: "Members", href: "/members", icon: Users, permission: "members:write" },
  { label: "Settings", href: "/settings", icon: Settings },
  // Only visible to platform-level root admins — guarded both here and server-side.
  { label: "Admin", href: "/admin", icon: Shield, rootOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, activeTenant, tenants, logout, switchTenant, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 -translate-x-full border-r bg-card transition-transform md:translate-x-0",
        sidebarOpen && "translate-x-0"
      )}>
        <div className="flex h-14 items-center justify-between border-b px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <Boxes className="h-5 w-5" /> AssetHub
          </Link>
          <Button variant="ghost" size="icon" className="md:hidden"
                  onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <TenantSwitcher
          activeTenant={activeTenant}
          tenants={tenants}
          onSelect={async (id) => { await switchTenant(id); setSidebarOpen(false); }}
        />
        <nav className="flex flex-col gap-1 p-2">
          {NAV.filter(item => {
            if (item.rootOnly && !user.isRootAdmin) return false;
            if (item.permission && !activeTenant?.permissions?.includes(item.permission)) return false;
            return true;
          }).map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link key={href} href={href} onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}>
                <Icon className="h-4 w-4" /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t">
          <a
            href={ANDROID_APK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors border-b"
          >
            <Smartphone className="h-3.5 w-3.5 shrink-0" />
            <span>Download Android app</span>
          </a>
          <div className="p-3">
            <UserMenu user={user} onLogout={logout} />
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col md:ml-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-medium text-muted-foreground">{titleFor(pathname)}</h1>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function titleFor(path: string) {
  const item = NAV.find(n => path === n.href || (n.href !== "/dashboard" && path.startsWith(n.href)));
  return item?.label || "";
}

function TenantSwitcher({ activeTenant, tenants, onSelect }: {
  activeTenant: ReturnType<typeof useAuth>["activeTenant"];
  tenants: ReturnType<typeof useAuth>["tenants"];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!activeTenant) return null;
  return (
    <div className="border-b p-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground">
          {activeTenant.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex flex-1 flex-col items-start truncate">
          <span className="truncate font-medium">{activeTenant.name}</span>
          <span className="text-xs text-muted-foreground">{activeTenant.role} · {activeTenant.plan}</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && tenants.length > 1 && (
        <div className="mt-1 space-y-0.5">
          {tenants.filter(t => t.id !== activeTenant.id).map(t => (
            <button key={t.id} onClick={() => onSelect(t.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs">
                {t.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="truncate">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user, onLogout }: {
  user: { displayName: string; email: string };
  onLogout: () => void | Promise<void>;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {(user.displayName || user.email).slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 truncate">
        <div className="truncate text-sm font-medium">{user.displayName}</div>
        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
      </div>
      <Button variant="ghost" size="icon" onClick={onLogout} title="Sign out">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}

function NotificationBell() {
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);

  const unread = useQuery({
    queryKey: ["notif-unread"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count", accessToken),
    enabled: !!accessToken,
    refetchInterval: 30_000,
  });

  const items = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<Notification[]>("/notifications", accessToken),
    enabled: !!accessToken && open,
  });

  async function markAllRead() {
    await api.post("/notifications/read-all", undefined, accessToken);
    unread.refetch(); items.refetch();
  }

  const count = unread.data?.count || 0;

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => setOpen(o => !o)} aria-label="Notifications">
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-md border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b p-3">
              <span className="text-sm font-medium">Notifications</span>
              {count > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllRead}>Mark all read</Button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.data && items.data.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">Nothing here yet.</p>
              )}
              {items.data?.map(n => (
                <Link key={n.id} href={n.link || "#"}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex flex-col gap-0.5 border-b p-3 hover:bg-accent",
                        !n.readAt && "bg-accent/30"
                      )}>
                  <span className="text-sm font-medium">{n.title}</span>
                  {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                  <span className="text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const dark = theme === "dark";
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
