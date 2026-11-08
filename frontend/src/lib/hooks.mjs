import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.mjs';

export function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// Semua pelanggan (aktif dan nonaktif); penyaringan dilakukan di layar.
export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/api/customers?active=all')).customers,
    staleTime: 60_000,
  });
}

// Pesan galat per kolom dari respons VALIDATION_ERROR backend.
export function fieldErrorsFrom(err) {
  const out = {};
  for (const d of err?.details ?? []) if (d.field && !out[d.field]) out[d.field] = d.message;
  return out;
}
