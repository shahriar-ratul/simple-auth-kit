"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon, ContactIcon, GlobeIcon, LanguagesIcon, LayoutDashboardIcon, ScrollTextIcon, ShieldCheckIcon, UserPlusIcon, UsersIcon, UsersRoundIcon } from "lucide-react";
import { NavUser } from "@/components/nav-user";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { PERMISSIONS, ROLES_SCREEN_PERMISSIONS, hasAnyPermission, type AppAbility, type PermissionKey } from "@/lib/ability";
import { useWorkspaceStore } from "@/lib/stores/store-context";

/**
 * `requires` lists the permissions that each open the screen on their own — same seam as
 * `nav.tsx` before it. `needsWorkspace` marks the links that are scoped to the active workspace;
 * "Members" carries no `requires` because it is gated on membership itself, not an administrative
 * capability (see `nav.tsx`'s original comment). "Dashboard" needs neither: its cards are
 * individually permission- and workspace-gated on the page itself. "Users" expands into
 * `children` — `Add user` needs `usersManage`, a strict superset of `All users`'s `usersRead`, so
 * it can be hidden on its own without collapsing the parent.
 */
const LINKS: Array<{
  href: string;
  label: string;
  icon: typeof UsersIcon;
  requires?: readonly PermissionKey[];
  needsWorkspace?: boolean;
  children?: Array<{ href: string; label: string; requires?: readonly PermissionKey[] }>;
}> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  {
    href: "/users",
    label: "Users",
    icon: UsersIcon,
    requires: [PERMISSIONS.usersRead],
    needsWorkspace: true,
    children: [
      { href: "/users", label: "All users", requires: [PERMISSIONS.usersRead] },
      { href: "/users/new", label: "Add user", requires: [PERMISSIONS.usersManage] },
    ],
  },
  { href: "/members", label: "Members", icon: UsersRoundIcon, needsWorkspace: true },
  { href: "/roles", label: "Roles & permissions", icon: ShieldCheckIcon, requires: ROLES_SCREEN_PERMISSIONS, needsWorkspace: true },
  { href: "/permissions", label: "Permissions", icon: ShieldCheckIcon, requires: [PERMISSIONS.permissionsRead], needsWorkspace: true },
  { href: "/audit-log", label: "Audit log", icon: ScrollTextIcon, requires: [PERMISSIONS.auditLogRead], needsWorkspace: true },
  {
    href: "/customers",
    label: "Customers",
    icon: ContactIcon,
    requires: [PERMISSIONS.customersRead],
    needsWorkspace: true,
    children: [
      { href: "/customers", label: "All customers", requires: [PERMISSIONS.customersRead] },
      { href: "/customers/new", label: "Add customer", requires: [PERMISSIONS.customersManage] },
    ],
  },
  {
    href: "/countries",
    label: "Countries",
    icon: GlobeIcon,
    requires: [PERMISSIONS.countriesRead],
    needsWorkspace: true,
    children: [
      { href: "/countries", label: "All countries", requires: [PERMISSIONS.countriesRead] },
      { href: "/countries/new", label: "Add country", requires: [PERMISSIONS.countriesManage] },
    ],
  },
  {
    href: "/languages",
    label: "Languages",
    icon: LanguagesIcon,
    requires: [PERMISSIONS.languagesRead],
    needsWorkspace: true,
    children: [
      { href: "/languages", label: "All languages", requires: [PERMISSIONS.languagesRead] },
      { href: "/languages/new", label: "Add language", requires: [PERMISSIONS.languagesManage] },
    ],
  },
];

export const AppSidebar = observer(function AppSidebar() {
  const ability = useAbility<AppAbility>();
  const workspaces = useWorkspaceStore();
  const pathname = usePathname();

  const hasWorkspace = workspaces.activeWorkspaceId !== null;
  const links = LINKS.filter((link) => (!link.needsWorkspace || hasWorkspace) && (!link.requires || hasAnyPermission(ability, link.requires)))
    .map((link) => ({ ...link, children: link.children?.filter((child) => !child.requires || hasAnyPermission(ability, child.requires)) }))
    // A parent with every child hidden by permissions collapses to a plain link.
    .map((link) => (link.children && link.children.length <= 1 ? { ...link, children: undefined } : link));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <ShieldCheckIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">easy-auth</span>
                  <span className="truncate text-xs text-muted-foreground">admin console</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Console</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {links.map((link) =>
                link.children ? (
                  <Collapsible key={link.href} asChild defaultOpen={pathname.startsWith(link.href)} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={link.label} isActive={pathname === link.href}>
                          <link.icon />
                          <span>{link.label}</span>
                          <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {link.children.map((child) => (
                            <SidebarMenuSubItem key={child.href}>
                              <SidebarMenuSubButton asChild isActive={pathname === child.href}>
                                <Link href={child.href}>
                                  {child.href === "/users/new" ? <UserPlusIcon /> : null}
                                  <span>{child.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton asChild isActive={pathname === link.href} tooltip={link.label}>
                      <Link href={link.href}>
                        <link.icon />
                        <span>{link.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
});
