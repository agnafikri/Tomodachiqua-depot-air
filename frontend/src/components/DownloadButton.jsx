import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Notice } from './ui.jsx';
import { downloadFile } from '../lib/download.mjs';

// Tombol unduh berkas dari API, dengan status memuat dan pesan galat.
export default function DownloadButton({ path, children, variant = 'secondary', className, disabled }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function onClick() {
    setLoading(true);
    setError('');
    setDone('');
    try {
      setDone(await downloadFile(path));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant={variant} loading={loading} disabled={disabled} onClick={onClick} className={className}>
        {!loading && <Download className="size-5" aria-hidden="true" />}
        {children}
      </Button>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {done && (
        <p role="status" className="text-sm text-ok">
          Berkas {done} diunduh.
        </p>
      )}
    </div>
  );
}
