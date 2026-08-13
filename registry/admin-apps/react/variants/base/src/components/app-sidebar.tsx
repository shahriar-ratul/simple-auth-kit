import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ChevronRightIcon,
  ContactIcon,
  GlobeIcon,
  LanguagesIcon,
  LayoutDashboardIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { canAny, PERMISSIONS, useAbility, type PermissionKey } from "@/lib/ability";
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

/**
 * `requires: undefined` means "always shown" (Dashboard — every authenticated user can land
 * there, its cards are individually gated). Everything else is hidden when the caller lacks the
 * permission its page needs — the same keys AppShell's old flat nav used and App.tsx's
 * `RequirePermission` route guards check, so the sidebar never offers a page that would answer
 * 403. "My account" isn't listed here; it's reachable from the NavUser "Profile" menu item instead.
 */
type NavItem = {
  to: string;
  label: string;
  icon: typeof UsersIcon;
  requires?: readonly PermissionKey[];
  children?: Array<{ to: string; label: string; requires?: readonly PermissionKey[] }>;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  {
    to: "/users",
    label: "Users",
    icon: UsersIcon,
    requires: [PERMISSIONS.usersRead],
    children: [
      { to: "/users", label: "All users", requires: [PERMISSIONS.usersRead] },
      { to: "/users/new", label: "Add user", requires: [PERMISSIONS.usersManage] },
    ],
  },
  {
    to: "/roles",
    label: "Roles & permissions",
    icon: ShieldCheckIcon,
    requires: [PERMISSIONS.rolesManage, PERMISSIONS.rolesAssign, PERMISSIONS.permissionsGrant],
  },
  { to: "/permissions", label: "Permissions", icon: ShieldCheckIcon, requires: [PERMISSIONS.permissionsRead] },
  { to: "/audit-log", label: "Audit log", icon: ScrollTextIcon, requires: [PERMISSIONS.auditLogRead] },
  {
    to: "/customers",
    label: "Customers",
    icon: ContactIcon,
    requires: [PERMISSIONS.customersRead],
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
    children: [
      { to: "/languages", label: "All languages", requires: [PERMISSIONS.languagesRead] },
      { to: "/languages/new", label: "Add language", requires: [PERMISSIONS.languagesManage] },
    ],
  },
];

export function AppSidebar() {
  const ability = useAbility();
  const location = useLocation();

  const items = NAV_ITEMS.filter((item) => !item.requires || canAny(ability, item.requires))
    .map((item) => ({ ...item, children: item.children?.filter((child) => !child.requires || canAny(ability, child.requires)) }))
    // A parent with every child hidden by permissions collapses to a plain link.
    .map((item) => (item.children && item.children.length <= 1 ? { ...item, children: undefined } : item));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/dashboard">
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
              {items.map((item) =>
                item.children ? (
                  <Collapsible key={item.to} asChild defaultOpen={location.pathname.startsWith(item.to)} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={item.label} isActive={location.pathname === item.to}>
                          <item.icon />
                          <span>{item.label}</span>
                          <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.children.map((child) => (
                            <SidebarMenuSubItem key={child.to}>
                              <SidebarMenuSubButton asChild isActive={location.pathname === child.to}>
                                <Link to={child.to}>
                                  {child.to === "/users/new" ? <UserPlusIcon /> : null}
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
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={location.pathname === item.to} tooltip={item.label}>
                      <NavLink to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
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
}
