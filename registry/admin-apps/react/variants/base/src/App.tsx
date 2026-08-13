import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Navigate, Route, Routes } from "react-router-dom";
import { AbilityContext, abilityFor, PERMISSIONS } from "@/lib/ability";
import { useAuthStore } from "@/stores/store-context";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth, RequirePermission } from "@/components/layout/RequireAuth";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { UsersPage } from "@/pages/UsersPage";
import { AddUserPage } from "@/pages/AddUserPage";
import { UserDetailPage } from "@/pages/UserDetailPage";
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

  const ability = abilityFor(store.currentUser);

  return (
    <AbilityContext.Provider value={ability}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/account" element={<AccountPage />} />

            <Route element={<RequirePermission anyOf={[PERMISSIONS.usersRead]} />}>
              <Route path="/users" element={<UsersPage />} />
              <Route path="/users/:id" element={<UserDetailPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[PERMISSIONS.usersManage]} />}>
              <Route path="/users/new" element={<AddUserPage />} />
            </Route>
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

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AbilityContext.Provider>
  );
});
