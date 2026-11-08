import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, setUnauthorizedHandler } from '../lib/api.mjs';

const AuthContext = createContext(null);
const ME_KEY = ['me'];

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  // null = belum login; galat jaringan dilempar agar layar "tidak bisa terhubung" muncul.
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return (await api.get('/api/auth/me')).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Sesi habis di tengah pemakaian: kembali ke halaman login.
  useEffect(() => {
    setUnauthorizedHandler(() => queryClient.setQueryData(ME_KEY, null));
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const login = useCallback(
    async (username, password) => {
      const { user } = await api.post('/api/auth/login', { username, password });
      queryClient.setQueryData(ME_KEY, user);
      return user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      // Jangan pakai queryClient.clear(): itu membuang query 'me' dari cache sehingga
      // AuthProvider tidak menerima perubahan dan layar tetap di dashboard.
      queryClient.setQueryData(ME_KEY, null);
      // Hapus data akun sebelumnya agar tidak bocor ke akun berikutnya.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({
      user: me.data ?? null,
      isLoading: me.isPending,
      error: me.error,
      retry: me.refetch,
      login,
      logout,
    }),
    [me.data, me.isPending, me.error, me.refetch, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}
