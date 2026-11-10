import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Badge, Button, Checkbox, Input, Notice, Sheet } from './ui.jsx';
import { api } from '../lib/api.mjs';
import { fieldErrorsFrom } from '../lib/hooks.mjs';

// Kelola karyawan: daftar, tambah, ubah, nonaktifkan. Tidak ada tarif tetap; upah ditentukan per hari.
export default function EmployeesSheet({ onClose }) {
  const employees = useQuery({ queryKey: ['employees'], queryFn: async () => (await api.get('/api/employees')).employees });
  const [editing, setEditing] = useState(undefined); // undefined = daftar, null = baru, objek = ubah

  if (editing !== undefined) {
    return <EmployeeForm employee={editing} onBack={() => setEditing(undefined)} onClose={onClose} />;
  }

  const list = employees.data ?? [];
  return (
    <Sheet open onClose={onClose} title="Kelola karyawan">
      <div className="space-y-4">
        <Button onClick={() => setEditing(null)} className="w-full">
          <Plus className="size-5" aria-hidden="true" />
          Tambah karyawan
        </Button>
        {employees.isPending && <p className="text-muted">Memuat…</p>}
        {employees.isError && <Notice tone="error">{employees.error.message}</Notice>}
        {employees.isSuccess && list.length === 0 && <p className="text-muted">Belum ada karyawan.</p>}
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {list.map((e) => (
            <li key={e.id}>
              <button onClick={() => setEditing(e)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-brand-soft">
                <span className="min-w-0">
                  <span className="block truncate text-base font-bold text-ink">{e.name}</span>
                  <span className="block text-sm text-muted">{e.phone || 'Tanpa telepon'}</span>
                </span>
                {!e.isActive && <Badge tone="danger">Nonaktif</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

function EmployeeForm({ employee, onBack, onClose }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(employee);
  const [name, setName] = useState(employee?.name ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [isActive, setIsActive] = useState(employee?.isActive ?? true);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: (body) => (isEdit ? api.patch(`/api/employees/${employee.id}`, body) : api.post('/api/employees', body)),
    onSuccess: () => {
      for (const key of ['employees', 'wage-day']) queryClient.invalidateQueries({ queryKey: [key] });
      onBack();
    },
    onError: (err) => {
      if (err.code === 'VALIDATION_ERROR') setErrors(fieldErrorsFrom(err));
      else if (err.code === 'DUPLICATE_NAME') setErrors({ name: err.message });
      else setError(err.message);
    },
  });

  function submit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setErrors({ name: 'Nama wajib diisi.' });
    setErrors({});
    return save.mutate({ name: name.trim(), phone: phone.trim(), ...(isEdit ? { isActive } : {}) });
  }

  return (
    <Sheet open onClose={onClose} title={isEdit ? 'Ubah karyawan' : 'Karyawan baru'}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
        <Input label="Nama" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={100} autoComplete="off" />
        <Input label="Telepon (boleh kosong)" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} maxLength={30} />
        {isEdit && <Checkbox label="Karyawan aktif" hint="Karyawan nonaktif tidak muncul saat mencatat upah. Slip lama tetap tersimpan." checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="secondary" className="sm:flex-1" onClick={onBack}>
            Kembali
          </Button>
          <Button type="submit" loading={save.isPending} className="sm:flex-1">
            {save.isPending ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
