import {
  Droplets,
  FileSpreadsheet,
  FileText,
  Gauge,
  Wrench,
  House,
  Banknote,
  PiggyBank,
  Users,
  Wallet,
} from 'lucide-react';

// Satu sumber untuk menu: navigasi bawah (HP), sidebar (komputer), dan Beranda.
// phase = fase pembangunan yang mengisi halaman ini.
export const NAV_ITEMS = [
  { to: '/', label: 'Beranda', icon: House, roles: ['ADMIN', 'PEMILIK'], mobile: true },
  { to: '/order', label: 'Order', icon: Droplets, roles: ['ADMIN', 'PEMILIK'], mobile: true, desc: 'Catat galon yang dibeli pelanggan' },
  { to: '/pelanggan', label: 'Pelanggan', icon: Users, roles: ['ADMIN', 'PEMILIK'], desc: 'Data pelanggan, harga khusus, dan diskon' },
  { to: '/utang', label: 'Utang', icon: Wallet, roles: ['ADMIN', 'PEMILIK'], mobile: true, desc: 'Siapa yang masih berutang dan pembayarannya' },
  { to: '/stok', label: 'Stok', icon: Gauge, roles: ['ADMIN', 'PEMILIK'], mobile: true, desc: 'Air di toren dan perkiraan kapan habis' },
  { to: '/laporan', label: 'Laporan', icon: FileText, roles: ['ADMIN', 'PEMILIK'], mobile: true, desc: 'Ringkasan harian, mingguan, dan bulanan' },
  { to: '/keuangan', label: 'Keuangan', icon: PiggyBank, roles: ['ADMIN', 'PEMILIK'], desc: 'Pemasukan, pengeluaran, dan saldo' },
  { to: '/layanan', label: 'Layanan', icon: Wrench, roles: ['ADMIN', 'PEMILIK'], desc: 'Permintaan pemasangan dan service dari landing page' },
  { to: '/upah', label: 'Upah', icon: Banknote, roles: ['ADMIN', 'PEMILIK'], desc: 'Upah harian karyawan dan slip' },
  { to: '/admin/impor-ekspor', label: 'Impor dan ekspor', icon: FileSpreadsheet, roles: ['ADMIN'], desc: 'Cadangan Excel dan impor data lama' },
];

export function navFor(role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
