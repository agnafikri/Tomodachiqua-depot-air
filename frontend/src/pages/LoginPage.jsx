import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { ApiError } from '../lib/api.mjs';
import { Button, Input, Notice } from '../components/ui.jsx';
import Ripples, { DropMark } from '../components/Ripples.jsx';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = {};
    if (!username.trim()) errors.username = 'Isi username.';
    if (!password) errors.password = 'Isi password.';
    setFieldErrors(errors);
    setFormError('');
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate('/', { replace: true }); // selalu ke Beranda, bukan halaman terakhir akun sebelumnya
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Terjadi kesalahan. Coba lagi.');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1fr_32rem]">
      <div className="relative overflow-hidden bg-brand px-6 pt-[calc(3rem+env(safe-area-inset-top))] pb-16 text-white lg:flex lg:flex-col lg:justify-end lg:px-16 lg:pb-20">
        <Ripples className="pointer-events-none absolute inset-0 size-full" />
        <div className="relative">
          <DropMark className="mb-5 size-12" />
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-6xl">Tomodachiqua</h1>
          <p className="mt-2 max-w-sm text-lg text-white/85">
            Catat order, utang, dan stok toren depot dari satu tempat.
          </p>
        </div>
      </div>

      <main className="relative -mt-6 rounded-t-3xl bg-canvas px-6 pt-8 pb-10 lg:mt-0 lg:flex lg:items-center lg:rounded-none lg:bg-white lg:px-14">
        <form onSubmit={handleSubmit} noValidate className="mx-auto w-full max-w-sm space-y-5">
          <h2 className="text-2xl font-extrabold text-ink">Masuk</h2>

          {formError && (
            <Notice tone="error" role="alert">
              {formError}
            </Notice>
          )}

          <Input
            label="Username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={fieldErrors.username}
          />

          <Input
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                className="flex size-10 items-center justify-center rounded-lg text-muted hover:text-brand-dark"
              >
                {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
              </button>
            }
          />

          <Button type="submit" loading={submitting} className="w-full">
            {submitting ? 'Memeriksa…' : 'Masuk'}
          </Button>
        </form>
      </main>
    </div>
  );
}
