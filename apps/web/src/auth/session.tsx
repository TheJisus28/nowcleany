import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  refreshSession,
  request,
  setSession,
  storedRefreshToken,
  subscribeSession,
} from '../api/client';
import type { AuthResult, Profile } from '../api/types';

interface SessionState {
  status: 'loading' | 'anonymous' | 'authenticated';
  profile: Profile | null;
}

interface SessionApi extends SessionState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
}

const SessionContext = createContext<SessionApi | null>(null);

export function useSession(): SessionApi {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession fuera de SessionProvider');
  return context;
}

/** The profile (with permissions) of the signed-in user; only call inside authenticated routes. */
export function useProfile(): Profile {
  const { profile } = useSession();
  if (!profile) throw new Error('No hay sesión');
  return profile;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>(() => ({
    status: storedRefreshToken() ? 'loading' : 'anonymous',
    profile: null,
  }));

  useEffect(() => {
    subscribeSession((session, profile) => {
      if (!session) setState({ status: 'anonymous', profile: null });
      else if (profile) setState({ status: 'authenticated', profile: profile as Profile });
    });
    if (storedRefreshToken()) {
      // Resume the session after a reload with the rotating refresh token.
      refreshSession().catch(() => {
        setState({ status: 'anonymous', profile: null });
      });
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await request<AuthResult>('POST', '/v1/auth/login', { email, password });
    setSession({ accessToken: result.accessToken, refreshToken: result.refreshToken }, result.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = storedRefreshToken();
    setSession(null);
    queryClient.clear();
    if (refreshToken) {
      await fetch('/v1/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
  }, [queryClient]);

  const value = useMemo<SessionApi>(
    () => ({
      ...state,
      login,
      logout,
      can: (permission) => state.profile?.permissions.includes(permission) ?? false,
    }),
    [state, login, logout],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
