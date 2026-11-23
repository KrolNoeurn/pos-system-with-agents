import { Suspense, lazy } from "react";
import { createBrowserRouter } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import { LoadingState } from "../components/ui";
import AppShell from "../layouts/AppShell";

const LoginPage = lazy(() => import("../pages/LoginPage"));
const HomePage = lazy(() => import("../pages/HomePage"));
const ProfilePage = lazy(() => import("../pages/ProfilePage"));
const UsersPage = lazy(() => import("../pages/UsersPage"));
const RolesPage = lazy(() => import("../pages/RolesPage"));
const CategoriesPage = lazy(() => import("../pages/CategoriesPage"));
const UnitsPage = lazy(() => import("../pages/UnitsPage"));
const ProductsPage = lazy(() => import("../pages/ProductsPage"));
const InventoryPage = lazy(() => import("../pages/InventoryPage"));
const PurchasingPage = lazy(() => import("../pages/PurchasingPage"));
const POSCheckoutPage = lazy(() => import("../pages/POSCheckoutPage"));
const SalesPage = lazy(() => import("../pages/SalesPage"));
const ExpensesPage = lazy(() => import("../pages/ExpensesPage"));
const ReportsPage = lazy(() => import("../pages/ReportsPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const AuditLogsPage = lazy(() => import("../pages/AuditLogsPage"));
const UnauthorizedPage = lazy(() => import("../pages/UnauthorizedPage"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage"));

function withSuspense(element) {
  return <Suspense fallback={<LoadingState message="Loading page..." />}>{element}</Suspense>;
}

export const routeConfig = [
  {
    path: "/login",
    element: withSuspense(<LoginPage />),
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: withSuspense(<HomePage />),
      },
      {
        path: "profile",
        element: withSuspense(<ProfilePage />),
      },
      {
        path: "products",
        element: (
          <ProtectedRoute requiredPermission="products.view">
            {withSuspense(<ProductsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "categories",
        element: (
          <ProtectedRoute requiredPermission="products.view">
            {withSuspense(<CategoriesPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "units",
        element: (
          <ProtectedRoute requiredPermission="products.view">
            {withSuspense(<UnitsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "inventory",
        element: (
          <ProtectedRoute requiredPermission="inventory.view">
            {withSuspense(<InventoryPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "purchasing",
        element: (
          <ProtectedRoute requiredPermission="purchases.view">
            {withSuspense(<PurchasingPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "pos",
        element: (
          <ProtectedRoute requiredPermission="sales.create">
            {withSuspense(<POSCheckoutPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "sales",
        element: (
          <ProtectedRoute requiredPermission="sales.view">
            {withSuspense(<SalesPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "expenses",
        element: (
          <ProtectedRoute requiredPermission="expenses.view">
            {withSuspense(<ExpensesPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "reports",
        element: (
          <ProtectedRoute requiredPermission="reports.view">
            {withSuspense(<ReportsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "users",
        element: (
          <ProtectedRoute requiredPermission="users.view">
            {withSuspense(<UsersPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "roles",
        element: (
          <ProtectedRoute requiredPermission="roles.view">
            {withSuspense(<RolesPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "settings",
        element: (
          <ProtectedRoute requiredPermission="settings.view">
            {withSuspense(<SettingsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "audit-logs",
        element: (
          <ProtectedRoute requiredPermission="audit.view">
            {withSuspense(<AuditLogsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: "unauthorized",
        element: withSuspense(<UnauthorizedPage />),
      },
      {
        path: "*",
        element: withSuspense(<NotFoundPage />),
      },
    ],
  },
];

const router = createBrowserRouter(routeConfig);

export default router;
