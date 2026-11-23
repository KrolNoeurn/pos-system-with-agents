import { RouterProvider } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import { ConfirmProvider } from "./contexts/ConfirmContext";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { ToastProvider } from "./contexts/ToastContext";
import router from "./app/router";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PreferencesProvider>
          <ToastProvider>
            <ConfirmProvider>
              <RouterProvider router={router} />
            </ConfirmProvider>
          </ToastProvider>
        </PreferencesProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
