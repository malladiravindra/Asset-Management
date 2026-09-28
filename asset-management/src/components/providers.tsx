"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/context";
import { ToastProvider } from "@/components/ui/toast";
import { RuntimeSettingsProvider } from "@/components/settings/runtime";
import { AssetsProvider } from "@/components/assets/context";
import { AuditLogProvider } from "@/components/audit-logs/context";
import { DashboardProvider } from "@/components/dashboard/context";
import { EmployeesProvider } from "@/components/employees/context";
import { DepartmentsProvider } from "@/components/departments/context";
import { CategoriesProvider } from "@/components/categories/context";
import { BrandsProvider } from "@/components/brands/context";
import { ModelsProvider } from "@/components/models/context";
import { NotificationsProvider } from "@/components/notifications/context";
import { LocationsProvider } from "@/components/locations/context";
import { VendorsProvider } from "@/components/vendors/context";
import { PurchaseOrdersProvider } from "@/components/purchase-orders/context";
import { AssignmentsProvider } from "@/components/assignments/context";
import { ReturnsProvider } from "@/components/returns/context";
import { MaintenanceProvider } from "@/components/maintenance/context";
import { RepairsProvider } from "@/components/repairs/context";
import { AccessoriesProvider } from "@/components/accessories/context";
import { AccessoryAssignmentsProvider } from "@/components/accessory-assignments/context";
import { SoftwareLicensesProvider } from "@/components/software-licenses/context";

// Global, fetched once per dashboard session: the current user (/me),
// runtime settings, notifications and the dashboard summary (it feeds the
// sidebar badges). Every other provider below loads on demand — only when a
// component on the current page reads it (see lib/lazy.ts).
export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
    <ToastProvider>
    <RuntimeSettingsProvider>
    <NotificationsProvider>
    <AuditLogProvider>
    <DashboardProvider>
      <AssetsProvider>
        <EmployeesProvider>
          <DepartmentsProvider>
            <CategoriesProvider>
              <BrandsProvider>
                <ModelsProvider>
                  <LocationsProvider>
                    <VendorsProvider>
                      <PurchaseOrdersProvider>
                        <AssignmentsProvider>
                          <ReturnsProvider>
                            <MaintenanceProvider>
                              <RepairsProvider>
                                <AccessoriesProvider>
                                  <AccessoryAssignmentsProvider>
                                    <SoftwareLicensesProvider>{children}</SoftwareLicensesProvider>
                                  </AccessoryAssignmentsProvider>
                                </AccessoriesProvider>
                              </RepairsProvider>
                            </MaintenanceProvider>
                          </ReturnsProvider>
                        </AssignmentsProvider>
                      </PurchaseOrdersProvider>
                    </VendorsProvider>
                  </LocationsProvider>
                </ModelsProvider>
              </BrandsProvider>
            </CategoriesProvider>
          </DepartmentsProvider>
        </EmployeesProvider>
      </AssetsProvider>
    </DashboardProvider>
    </AuditLogProvider>
    </NotificationsProvider>
    </RuntimeSettingsProvider>
    </ToastProvider>
    </AuthProvider>
  );
}
