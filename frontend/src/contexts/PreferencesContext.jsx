import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { THEME_CONFIG } from "../config/themeConfig";
import { translate } from "../i18n/translations";
import { updateCurrentUserProfile } from "../services/authService";
import { useAuth } from "./AuthContext";

const PreferencesContext = createContext(null);

function readStoredValue(key, allowedValues, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw && allowedValues.includes(raw)) {
      return raw;
    }
  } catch {
    // Ignore storage unavailability
  }
  return fallback;
}

function writeStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage unavailability
  }
}

export function PreferencesProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const { storageKeys, defaults, themes, layouts, sidebarModes, languages } = THEME_CONFIG;
  const languageCodes = useMemo(() => languages.map((l) => l.code), [languages]);

  const [theme, setThemeState] = useState(() =>
    readStoredValue(storageKeys.theme, themes, defaults.theme)
  );
  const [layout, setLayoutState] = useState(() =>
    readStoredValue(storageKeys.layout, layouts, defaults.layout)
  );
  const [sidebarMode, setSidebarModeState] = useState(() =>
    readStoredValue(storageKeys.sidebarMode, sidebarModes, defaults.sidebarMode)
  );
  const [language, setLanguageState] = useState(() =>
    readStoredValue(storageKeys.language, languageCodes, defaults.language)
  );

  // Sync saved server-side user preferences upon login
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (user.preferred_theme && themes.includes(user.preferred_theme)) {
      setThemeState(user.preferred_theme);
      writeStoredValue(storageKeys.theme, user.preferred_theme);
    }
    if (user.preferred_layout && layouts.includes(user.preferred_layout)) {
      setLayoutState(user.preferred_layout);
      writeStoredValue(storageKeys.layout, user.preferred_layout);
    }
    if (user.preferred_language && languageCodes.includes(user.preferred_language)) {
      setLanguageState(user.preferred_language);
      writeStoredValue(storageKeys.language, user.preferred_language);
    }
  }, [isAuthenticated, user, themes, layouts, languageCodes, storageKeys]);

  // Apply theme & language attributes to <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
  }, [language]);

  const persistRemotePreference = useCallback(
    (patch) => {
      if (!isAuthenticated) return;
      updateCurrentUserProfile(patch).catch(() => {
        // Local preference still applies even if background sync fails
      });
    },
    [isAuthenticated]
  );

  const setTheme = useCallback(
    (nextTheme) => {
      if (!themes.includes(nextTheme)) return;
      setThemeState(nextTheme);
      writeStoredValue(storageKeys.theme, nextTheme);
      persistRemotePreference({ preferred_theme: nextTheme });
    },
    [themes, storageKeys.theme, persistRemotePreference]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  const setLayout = useCallback(
    (nextLayout) => {
      if (!layouts.includes(nextLayout)) return;
      setLayoutState(nextLayout);
      writeStoredValue(storageKeys.layout, nextLayout);
      persistRemotePreference({ preferred_layout: nextLayout });
    },
    [layouts, storageKeys.layout, persistRemotePreference]
  );

  const toggleLayout = useCallback(() => {
    setLayout(layout === "vertical" ? "horizontal" : "vertical");
  }, [layout, setLayout]);

  const setSidebarMode = useCallback(
    (nextMode) => {
      if (!sidebarModes.includes(nextMode)) return;
      setSidebarModeState(nextMode);
      writeStoredValue(storageKeys.sidebarMode, nextMode);
    },
    [sidebarModes, storageKeys.sidebarMode]
  );

  const cycleSidebarMode = useCallback(() => {
    const order = ["expanded", "mini", "collapsed"];
    const next = order[(order.indexOf(sidebarMode) + 1) % order.length];
    setSidebarMode(next);
  }, [sidebarMode, setSidebarMode]);

  const setLanguage = useCallback(
    (nextLang) => {
      if (!languageCodes.includes(nextLang)) return;
      setLanguageState(nextLang);
      writeStoredValue(storageKeys.language, nextLang);
      persistRemotePreference({ preferred_language: nextLang });
    },
    [languageCodes, storageKeys.language, persistRemotePreference]
  );

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "km" : "en");
  }, [language, setLanguage]);

  const t = useCallback(
    (key, fallback) => translate(language, key, fallback),
    [language]
  );

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      layout,
      setLayout,
      toggleLayout,
      sidebarMode,
      setSidebarMode,
      cycleSidebarMode,
      language,
      setLanguage,
      toggleLanguage,
      t,
    }),
    [
      theme,
      setTheme,
      toggleTheme,
      layout,
      setLayout,
      toggleLayout,
      sidebarMode,
      setSidebarMode,
      cycleSidebarMode,
      language,
      setLanguage,
      toggleLanguage,
      t,
    ]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used inside PreferencesProvider.");
  }
  return ctx;
}
