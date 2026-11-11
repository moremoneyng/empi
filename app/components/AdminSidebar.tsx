"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  Package,
  PackagePlus,
  Truck,
  LineChart,
  WalletCards,
  FileText,
  Mail,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  ExternalLink,
} from "lucide-react";
import { useAdmin } from "@/app/context/AdminContext";
import { hasPermission } from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, useSidebar } from "@/components/ui/sidebar";

type BadgeKey = "pendingOrders" | "registeredCustomers" | "totalProducts";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tab?: string;
  permission?: Permission;
  badgeKey?: BadgeKey;
  badgeTone?: "alert" | "muted";
  exact?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { name: "Dashboard", href: "/admin/dashboard?tab=dashboard", icon: LayoutDashboard, tab: "dashboard", permission: "view_dashboard" },
    ],
  },
  {
    title: "Sales",
    items: [
      { name: "Orders", href: "/admin/dashboard?tab=pending", icon: ShoppingBag, tab: "pending", permission: "view_orders", badgeKey: "pendingOrders", badgeTone: "alert" },
      { name: "Customers", href: "/admin/dashboard?tab=users", icon: Users, tab: "users", permission: "view_users", badgeKey: "registeredCustomers", badgeTone: "muted" },
      { name: "Invoices", href: "/admin/invoices", icon: FileText, permission: "view_invoices" },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { name: "Products", href: "/admin/dashboard?tab=products", icon: Package, tab: "products", permission: "view_products", badgeKey: "totalProducts", badgeTone: "muted" },
      { name: "Add product", href: "/admin/upload", icon: PackagePlus, permission: "view_products", exact: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { name: "Logistics", href: "/admin/logistics", icon: Truck, permission: "view_logistics" },
      { name: "Mail Room", href: "/admin/mail-room", icon: Mail, permission: "view_mail_room" },
    ],
  },
  {
    title: "Finance",
    items: [
      { name: "Finance & VAT", href: "/admin/finance", icon: LineChart, permission: "view_finance" },
      { name: "Payroll", href: "/admin/payroll", icon: WalletCards, permission: "view_finance" },
    ],
  },
  {
    title: "System",
    items: [
      { name: "Settings", href: "/admin/settings", icon: Settings, permission: "view_settings" },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  finance_admin: "Finance",
  logistics_admin: "Logistics",
  sales_admin: "Sales",
};

function initials(name?: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state, isMobile, openMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const { logout, admin } = useAdmin();
  const [badges, setBadges] = useState<Record<BadgeKey, number>>({ pendingOrders: 0, registeredCustomers: 0, totalProducts: 0 });
  // Tab clicked in this session; only trusted while the URL hasn't changed since the click
  const [tabOverride, setTabOverride] = useState<{ tab: string; search: string } | null>(null);

  const collapsed = !isMobile && state === "collapsed";
  const onDashboard = pathname === "/admin" || pathname === "/admin/dashboard";
  const search = searchParams?.toString() || "";
  const currentTab = (tabOverride && tabOverride.search === search ? tabOverride.tab : null) || searchParams?.get("tab") || "dashboard";

  // Keep in step with tab changes made inside the dashboard
  useEffect(() => {
    const onTab = (e: Event) => {
      const tab = (e as CustomEvent).detail?.tab;
      if (tab) setTabOverride({ tab, search: window.location.search.replace(/^\?/, "") });
    };
    window.addEventListener("adminTabChange", onTab);
    return () => window.removeEventListener("adminTabChange", onTab);
  }, []);

  const loadBadges = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard?summary=badges", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setBadges({
        pendingOrders: Number(data.pendingOrders) || 0,
        registeredCustomers: Number(data.registeredCustomers) || 0,
        totalProducts: Number(data.totalProducts) || 0,
      });
    } catch {
      /* badges are optional */
    }
  }, []);

  // Refresh badges on navigation and every minute while visible
  useEffect(() => {
    const t = window.setTimeout(loadBadges, 0);
    return () => window.clearTimeout(t);
  }, [loadBadges, pathname]);
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") loadBadges();
    }, 60_000);
    return () => window.clearInterval(t);
  }, [loadBadges]);

  const isActive = (item: NavItem) => {
    if (item.tab) return onDashboard && currentTab === item.tab;
    const base = item.href.split("?")[0];
    return item.exact ? pathname === base : pathname === base || pathname.startsWith(base + "/");
  };

  const canSee = (item: NavItem) =>
    !item.permission || admin?.role === "super_admin" || hasPermission(admin?.permissions, item.permission);

  const handleLogout = async () => {
    await logout();
    setTimeout(() => router.push("/admin/login"), 300);
  };

  const activeName = NAV.flatMap((g) => g.items).find((i) => isActive(i))?.name || "Admin";

  return (
    <>
      {/* Mobile top bar - the only way to open the menu on a phone */}
      {isMobile && (
        <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white/90 px-4 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setOpenMobile(!openMobile)}
            className="-ml-1.5 rounded-lg p-1.5 text-gray-700 hover:bg-gray-100"
            aria-label={openMobile ? "Close menu" : "Open menu"}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image src="/logo/EMPI-2k24-LOGO-1.PNG" alt="EMPI" width={60} height={50} className="h-7 w-auto object-contain" />
          <span className="truncate text-sm font-semibold text-gray-900">{activeName}</span>
          {badges.pendingOrders > 0 && (
            <Link
              href="/admin/dashboard?tab=pending"
              className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800"
            >
              {badges.pendingOrders} pending
            </Link>
          )}
        </div>
      )}

      <Sidebar
        collapsible="icon"
        className={`border-r border-gray-200 bg-white text-gray-700 transition-[width] duration-200 ${
          isMobile ? "w-72 shadow-2xl" : collapsed ? "w-[68px]" : "w-64"
        }`}
      >
        {/* Brand */}
        <SidebarHeader className={`h-16 flex-row items-center justify-between border-b border-gray-100 bg-white py-0 ${collapsed ? "px-3" : "px-4"}`}>
          {!collapsed && (
            <Link href="/admin/dashboard?tab=dashboard" className="flex min-w-0 items-center gap-2.5" onClick={() => isMobile && setOpenMobile(false)}>
              <Image src="/logo/EMPI-2k24-LOGO-1.PNG" alt="EMPI Costumes" width={80} height={68} className="h-8 w-auto shrink-0 object-contain" priority />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-semibold text-gray-900">EMPI Costumes</span>
                <span className="text-[11px] font-medium text-gray-500">Admin console</span>
              </span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => (isMobile ? setOpenMobile(false) : toggleSidebar())}
            className={`rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 ${collapsed ? "mx-auto" : ""}`}
            aria-label={isMobile ? "Close menu" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isMobile ? "Close menu" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isMobile ? <X className="h-4.5 w-4.5" /> : collapsed ? <PanelLeftOpen className="h-4.5 w-4.5" /> : <PanelLeftClose className="h-4.5 w-4.5" />}
          </button>
        </SidebarHeader>

        {/* Navigation */}
        <SidebarContent className={`gap-0 py-3 ${collapsed ? "px-2" : "px-3"}`}>
          <nav aria-label="Admin" className="space-y-5">
            {NAV.map((group, groupIndex) => {
              const items = group.items.filter(canSee);
              if (items.length === 0) return null;
              return (
                <div key={group.title}>
                  {collapsed ? (
                    groupIndex > 0 && <div className="mx-auto mb-2 h-px w-6 bg-gray-200" aria-hidden />
                  ) : (
                    <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">{group.title}</p>
                  )}
                  <ul className="space-y-0.5">
                    {items.map((item) => {
                      const active = isActive(item);
                      const Icon = item.icon;
                      const count = item.badgeKey ? badges[item.badgeKey] : 0;
                      return (
                        <li key={item.name} className="relative">
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            title={collapsed ? `${item.name}${count ? ` (${count})` : ""}` : undefined}
                            onClick={() => {
                              if (item.tab) {
                                setTabOverride({ tab: item.tab, search });
                                window.dispatchEvent(new CustomEvent("adminTabChange", { detail: { tab: item.tab } }));
                              }
                              if (isMobile) setOpenMobile(false);
                            }}
                            className={`group relative flex items-center gap-3 rounded-lg text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lime-500 ${
                              collapsed ? "h-10 justify-center" : "h-9 px-2.5"
                            } ${active ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
                          >
                            {active && <span className={`absolute ${collapsed ? "-left-2" : "-left-3"} top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-lime-500`} aria-hidden />}
                            <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-gray-900" : "text-gray-400 group-hover:text-gray-600"}`} />
                            {!collapsed && <span className="flex-1 truncate">{item.name}</span>}
                            {count > 0 && !collapsed && (
                              <span
                                className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-[10.5px] font-semibold tabular-nums ${
                                  item.badgeTone === "alert" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                {count > 999 ? "999+" : count}
                              </span>
                            )}
                            {count > 0 && collapsed && item.badgeTone === "alert" && (
                              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" aria-label={`${count} pending`} />
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
        </SidebarContent>

        {/* Footer */}
        <SidebarFooter className={`gap-1 border-t border-gray-100 bg-white ${collapsed ? "px-2 py-3" : "p-3"}`}>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            title={collapsed ? "View store" : undefined}
            className={`flex items-center gap-3 rounded-lg text-[13px] font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 ${collapsed ? "h-10 justify-center" : "h-9 px-2.5"}`}
          >
            <ExternalLink className="h-[18px] w-[18px] shrink-0 text-gray-400" />
            {!collapsed && <span>View store</span>}
          </a>

          {collapsed ? (
            <button
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
              className="flex h-10 items-center justify-center rounded-lg text-gray-500 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          ) : (
            <div className="mt-1 flex items-center gap-2.5 rounded-xl border border-gray-200 p-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-xs font-semibold text-lime-400">
                {initials(admin?.fullName || admin?.email)}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-semibold text-gray-900">{admin?.fullName || admin?.email || "Admin"}</p>
                <p className="truncate text-[11px] text-gray-500">{ROLE_LABEL[admin?.role || ""] || "Admin"}</p>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
