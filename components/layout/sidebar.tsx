"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  UtensilsCrossed,
  Plus,
  DollarSign,
  Component,
  User,
  LogOut,
  CreditCard,
  Package,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SERVICE_NAV_HREFS } from "@/lib/service-nav-map";
import Image from "next/image";
import { Pacifico, Baloo_2 } from "next/font/google";
import { useVertical } from "@/components/providers/vertical-provider";

const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["600", "700"],
});

const pacifico = Pacifico({
  subsets: ["latin"],
  weight: "400",
});

const navigation = [
  { name: "Pedidos", href: "/", icon: LayoutDashboard },
  { name: "Historial", href: "/historial", icon: ClipboardList },
  { name: "Rendimiento", href: "/rendimiento", icon: BarChart3 },
  { name: "Clientes", href: "/clientes", icon: User },
  { name: "Menú", href: "/menu", icon: UtensilsCrossed },
  // Combos is the first (and so far only) nav item gated by a
  // VerticalDefinition feature flag rather than a control-panel service
  // key — see requiresCombos below. hasCombos: false today only for sushi;
  // every other vertical still falls back to burgerVertical (hasCombos: true).
  { name: "Combos", href: "/combos", icon: Component, requiresCombos: true },
  { name: "Extras", href: "/extras", icon: Plus },
  { name: "Precios", href: "/precios", icon: DollarSign },
  // Gated by stock_management via SERVICE_NAV_HREFS (lib/service-nav-map.ts)
  // — hidden by isNavItemVisible below whenever that service is inactive,
  // same as web_orders-gated items above.
  { name: "Insumos", href: "/insumos", icon: Package },
  { name: "Mi Plan", href: "/plan", icon: CreditCard },
];

interface AppSidebarProps {
  /** Active service keys for sidebar gating; `null`/`undefined` disables gating (fail-open). */
  activeServiceKeys?: string[] | null;
}

function isNavItemVisible(href: string, activeServiceKeys?: string[] | null): boolean {
  if (!activeServiceKeys) return true; // fail-open: no gating info, show everything

  return !Object.entries(SERVICE_NAV_HREFS).some(
    ([serviceKey, hrefs]) => hrefs.includes(href) && !activeServiceKeys.includes(serviceKey)
  );
}

export function AppSidebar({ activeServiceKeys }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const vertical = useVertical();
  const visibleNavigation = navigation
    .filter((item) => isNavItemVisible(item.href, activeServiceKeys))
    .filter((item) => !item.requiresCombos || vertical.features.hasCombos);

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <Sidebar collapsible="icon" variant="floating" className="ios-sidebar">
      <SidebarHeader className="pb-2">
        <div className="flex items-center gap-3 px-1 py-2 transition-all duration-300 ease-in-out overflow-hidden group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
          <Image
            src="/placeholder-logo.png"
            alt="Logo"
            width={36}
            height={36}
            className="rounded-lg shrink-0 size-9 object-cover group-data-[collapsible=icon]:mx-auto"
          />
          <div
            className={cn(
              "flex flex-col leading-tight overflow-hidden",
              "transition-all duration-300 ease-in-out",
              "max-w-xs opacity-100",
              "group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0",
            )}
          >
            <span className={cn(baloo.className, "text-base font-bold tracking-wide whitespace-nowrap")}>
              Gastro
            </span>
            <span className={cn(pacifico.className, "text-sm text-(--color-brand) -mt-1 whitespace-nowrap")}>
              Dashboard
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.name}
                      className={cn(
                        "rounded-lg transition-all duration-200 h-9",
                        isActive
                          ? "nav-rail-active bg-primary/10 text-primary font-medium"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                    >
                      <Link href={item.href}>
                        <item.icon className={cn("size-4 shrink-0", isActive && "text-primary")} />
                        <span className="text-sm">{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              tooltip="Cerrar sesión"
              className="rounded-lg transition-all duration-200 h-9 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
            >
              <LogOut className="size-4 shrink-0" />
              <span className="text-sm">Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
