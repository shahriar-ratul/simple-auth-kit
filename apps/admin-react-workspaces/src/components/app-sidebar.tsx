import { observer } from "mobx-react-lite";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronRightIcon, ContactIcon, GlobeIcon, LanguagesIcon, LayoutDashboardIcon, ScrollTextIcon, ShieldCheckIcon, UserPlusIcon, UsersIcon } from "lucide-react";
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
import { canAny, PERMISSIONS, useAbility, type AppAbility } from "@/lib/ability";
import { useWorkspaceStore } from "@/stores/store-context";

/**
 * `requires` lists the permissions that open the screen on their own — a link the caller can't
 * open is hidden rather than shown-then-403'd, reading the same keys the routes behind it check
 * (see `App.tsx`). `needsWorkspace` mirrors the old `AppShell` nav exactly: everything except
 * Dashboard is scoped to the active workspace (its routes name it in `X-Workspace-Id` and answer
 * 403 without one), so those links disappear until there is one. Members is gated on workspace
 * membership alone — any member may see who else is in it, so it carries no `requires`.
 * `children` mirrors `requires` one level down — "Add user" needs `users:manage`, not merely the
 * `users:read` that opens the group.
 */
const LINKS: Array<{
  to: string;
  label: string;
  icon: typeof UsersIcon;
  requires?: readonly string[];
  needsWorkspace?: boolean;
  children?: Array<{ to: string; label: string; requires?: readonly string[] }>;
}> = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  {
    to: "/users",
    label: "Users",
    icon: UsersIcon,
    requires: [PERMISSIONS.usersRead],
    needsWorkspace: true,
    children: [
      { to: "/users", label: "All users", requires: [PERMISSIONS.usersRead] },
      { to: "/users/new", label: "Add user", requires: [PERMISSIONS.usersManage] },
    ],
  },
  { to: "/members", label: "Members", icon: UsersIcon, needsWorkspace: true },
  {
    to: "/roles",
    label: "Roles & permissions",
    icon: ShieldCheckIcon,
    requires: [PERMISSIONS.rolesManage, PERMISSIONS.rolesAssign, PERMISSIONS.permissionsGrant],
    needsWorkspace: true,
  },
  { to: "/permissions", label: "Permissions", icon: ShieldCheckIcon, requires: [PERMISSIONS.permissionsRead], needsWorkspace: true },
  { to: "/audit-log", label: "Audit log", icon: ScrollTextIcon, requires: [PERMISSIONS.auditLogRead], needsWorkspace: true },
  {
    to: "/customers",
    label: "Customers",
    icon: ContactIcon,
    requires: [PERMISSIONS.customersRead],
    needsWorkspace: true,
    children: [
      { to: "/customers", label: "All customers", requires: [PERMISSIONS.customersRead] },
      { to: "/customers/new", label: "Add customer", requires: [PERMISSIONS.customersManage] },
    ],
  },
  {
    to: "/countries",
    label: "Countries",
    icon: GlobeIcon,
    requires: [PERMISSIONS.countriesRead],
    needsWorkspace: true,
    children: [
      { to: "/countries", label: "All countries", requires: [PERMISSIONS.countriesRead] },
      { to: "/countries/new", label: "Add country", requires: [PERMISSIONS.countriesManage] },
    ],
  },
  {
    to: "/languages",
    label: "Languages",
    icon: LanguagesIcon,
    requires: [PERMISSIONS.languagesRead],
    needsWorkspace: true,
    children: [
      { to: "/languages", label: "All languages", requires: [PERMISSIONS.languagesRead] },
      { to: "/languages/new", label: "Add language", requires: [PERMISSIONS.languagesManage] },
    ],
  },
];

function visibleLinks(ability: AppAbility, hasWorkspace: boolean) {
  return LINKS.filter((link) => (!link.needsWorkspace || hasWorkspace) && (!link.requires || canAny(ability, link.requires)))
    .map((link) => ({ ...link, children: link.children?.filter((child) => !child.requires || canAny(ability, child.requires)) }))
    // A parent with every child hidden by permissions collapses to a plain link.
    .map((link) => (link.children && link.children.length <= 1 ? { ...link, children: undefined } : link));
}

export const AppSidebar = observer(function AppSidebar() {
  const ability = useAbility();
  const workspaces = useWorkspaceStore();
  const location = useLocation();

  const links = visibleLinks(ability, workspaces.hasWorkspace);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <ShieldCheckIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">easy-auth</span>
                  <span className="truncate text-xs text-muted-foreground">admin console</span>
                </div>
              </NavLink>
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
                  <Collapsible key={link.to} asChild defaultOpen={location.pathname.startsWith(link.to)} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={link.label} isActive={location.pathname === link.to}>
                          <link.icon />
                          <span>{link.label}</span>
                          <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {link.children.map((child) => (
                            <SidebarMenuSubItem key={child.to}>
                              <SidebarMenuSubButton asChild isActive={location.pathname === child.to}>
                                <NavLink to={child.to} end={child.to === "/users"}>
                                  {child.to === "/users/new" ? <UserPlusIcon /> : null}
                                  <span>{child.label}</span>
                                </NavLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={link.to}>
                    <SidebarMenuButton asChild isActive={location.pathname === link.to} tooltip={link.label}>
                      <NavLink to={link.to}>
                        <link.icon />
                        <span>{link.label}</span>
                      </NavLink>
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
