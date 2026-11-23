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
