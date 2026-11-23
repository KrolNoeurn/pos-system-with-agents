import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { registerSessionExpiredHandler } from "../services/apiClient";
import * as authService from "../services/authService";
import { clearTokens, getAccessToken } from "../services/tokenStorage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const profile = await authService.fetchCurrentUser();
    setUser(profile);
    return profile;
  }, []);

  useEffect(() => {
    registerSessionExpiredHandler(() => {
      setUser(null);
    });
  }, []);

  useEffect(() => {
    let active = true;
    async function hydrateSession() {
      if (!getAccessToken()) {
        if (active) setIsLoading(false);
        return;
      }
      try {
        const profile = await authService.fetchCurrentUser();
        if (active) setUser(profile);
      } catch {
        clearTokens();
        if (active) setUser(null);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    hydrateSession();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await authService.login(credentials);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const permissionsSet = useMemo(
    () => new Set(user?.permissions || []),
    [user]
  );

  const hasPermission = useCallback(
    (code) => {
      if (!user || !user.is_active) return false;
      if (user.is_super_admin) return true;
      return permissionsSet.has(code);
    },
    [user, permissionsSet]
  );

  const hasAnyPermission = useCallback(
    (codes = []) => {
      if (!codes || codes.length === 0) return true;
      return codes.some((code) => hasPermission(code));
    },
    [hasPermission]
  );

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user && user.is_active),
      isLoading,
      permissions: user?.permissions || [],
      hasPermission,
      hasAnyPermission,
      login,
      logout,
      refreshProfile,
      clearSession,
    }),
    [user, isLoading, hasPermission, hasAnyPermission, login, logout, refreshProfile, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return ctx;
}
