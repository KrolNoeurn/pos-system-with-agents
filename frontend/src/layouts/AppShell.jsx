import { usePreferences } from "../contexts/PreferencesContext";
import HorizontalLayout from "./HorizontalLayout";
import VerticalLayout from "./VerticalLayout";

/**
 * Shared layout switcher shell. Both layouts render the exact same route
 * components via <Outlet /> without duplicating pages.
 */
export default function AppShell() {
  const { layout } = usePreferences();
  return layout === "horizontal" ? <HorizontalLayout /> : <VerticalLayout />;
}
