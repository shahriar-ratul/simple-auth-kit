import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Navigate, Route, Routes } from "react-router-dom";
import { AbilityContext, abilityFor, PERMISSIONS } from "@/lib/ability";
import { useAuthStore } from "@/stores/store-context";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth, RequirePermission, RequireWorkspace } from "@/components/layout/RequireAuth";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { UsersPage } from "@/pages/UsersPage";
import { AddUserPage } from "@/pages/AddUserPage";
import { UserDetailPage } from "@/pages/UserDetailPage";
import { MembersPage } from "@/pages/MembersPage";
import { RolesPage } from "@/pages/RolesPage";
import { PermissionsPage } from "@/pages/PermissionsPage";
import { AuditLogPage } from "@/pages/AuditLogPage";
import { AccountPage } from "@/pages/AccountPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { AddCustomerPage } from "@/pages/AddCustomerPage";
import { CustomerDetailPage } from "@/pages/CustomerDetailPage";
import { EditCustomerPage } from "@/pages/EditCustomerPage";
import { CountriesPage } from "@/pages/CountriesPage";
import { AddCountryPage } from "@/pages/AddCountryPage";
import { CountryDetailPage } from "@/pages/CountryDetailPage";
import { EditCountryPage } from "@/pages/EditCountryPage";
import { LanguagesPage } from "@/pages/LanguagesPage";
import { AddLanguagePage } from "@/pages/AddLanguagePage";
import { LanguageDetailPage } from "@/pages/LanguageDetailPage";
import { EditLanguagePage } from "@/pages/EditLanguagePage";

export const App = observer(function App() {
  const store = useAuthStore();

  useEffect(() => {
    void store.initialize();
  }, [store]);

  // Rebuilt whenever `currentUser` changes — which includes every workspace switch, since
  // permissions are per membership and the store re-reads `/auth/me` on switching.
  const ability = abilityFor(store.currentUser);

  return (
    <AbilityContext.Provider value={ability}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            {/* The console's front door. Dashboard needs no permission and handles having no
                active workspace internally, so it's a safe landing spot for any authenticated
                caller — no `RequirePermission`, and deliberately outside `RequireWorkspace`. */}
            <Route path="/dashboard" element={<DashboardPage />} />

            {/* Sessions and 2FA belong to the account, not to any workspace. */}
            <Route path="/account" element={<AccountPage />} />

            <Route element={<RequireWorkspace />}>
              <Route element={<RequirePermission anyOf={[PERMISSIONS.usersRead]} />}>
                <Route path="/users" element={<UsersPage />} />
                <Route path="/users/:id" element={<UserDetailPage />} />
              </Route>
              <Route element={<RequirePermission anyOf={[PERMISSIONS.usersManage]} />}>
                <Route path="/users/new" element={<AddUserPage />} />
              </Route>
              {/* Any member may see who else is in the workspace — only its buttons are gated. */}
              <Route path="/members" element={<MembersPage />} />
              <Route element={<RequirePermission anyOf={[PERMISSIONS.rolesManage, PERMISSIONS.rolesAssign, PERMISSIONS.permissionsGrant]} />}>
                <Route path="/roles" element={<RolesPage />} />
              </Route>
              <Route element={<RequirePermission anyOf={[PERMISSIONS.permissionsRead]} />}>
                <Route path="/permissions" element={<PermissionsPage />} />
              </Route>
              <Route element={<RequirePermission anyOf={[PERMISSIONS.auditLogRead]} />}>
                <Route path="/audit-log" element={<AuditLogPage />} />
              </Route>

              <Route element={<RequirePermission anyOf={[PERMISSIONS.customersRead]} />}>
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/customers/:id" element={<CustomerDetailPage />} />
              </Route>
              <Route element={<RequirePermission anyOf={[PERMISSIONS.customersManage]} />}>
                <Route path="/customers/new" element={<AddCustomerPage />} />
                <Route path="/customers/:id/edit" element={<EditCustomerPage />} />
              </Route>

              <Route element={<RequirePermission anyOf={[PERMISSIONS.countriesRead]} />}>
                <Route path="/countries" element={<CountriesPage />} />
                <Route path="/countries/:id" element={<CountryDetailPage />} />
              </Route>
              <Route element={<RequirePermission anyOf={[PERMISSIONS.countriesManage]} />}>
                <Route path="/countries/new" element={<AddCountryPage />} />
                <Route path="/countries/:id/edit" element={<EditCountryPage />} />
              </Route>

              <Route element={<RequirePermission anyOf={[PERMISSIONS.languagesRead]} />}>
                <Route path="/languages" element={<LanguagesPage />} />
                <Route path="/languages/:id" element={<LanguageDetailPage />} />
              </Route>
              <Route element={<RequirePermission anyOf={[PERMISSIONS.languagesManage]} />}>
                <Route path="/languages/new" element={<AddLanguagePage />} />
                <Route path="/languages/:id/edit" element={<EditLanguagePage />} />
              </Route>
            </Route>
          </Route>
        </Route>

        {/* Landing on the console's home: Dashboard is always a safe landing spot — its cards are
            individually permission-gated and it shows its own offer to create a workspace when
            there isn't one yet, so a low-privilege or brand-new account never hits a wall. */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AbilityContext.Provider>
  );
});
