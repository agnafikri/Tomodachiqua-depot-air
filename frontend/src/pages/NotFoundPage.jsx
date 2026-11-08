import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui.jsx';

export default function NotFoundPage() {
  return (
    <>
      <PageHeader title="Halaman tidak ditemukan">Alamat yang kamu buka tidak ada.</PageHeader>
      <Link to="/" className="font-semibold text-brand underline underline-offset-4">
        Kembali ke Beranda
      </Link>
    </>
  );
}
