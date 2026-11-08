import {
  Droplets,
  FileSpreadsheet,
  FileText,
  Gauge,
  House,
  PiggyBank,
  Users,
  Wallet,
} from 'lucide-react';

// Satu sumber untuk menu: navigasi bawah (HP), sidebar (komputer), dan Beranda.
// phase = fase pembangunan yang mengisi halaman ini.
export const NAV_ITEMS = [
  { to: '/', label: 'Beranda', icon: House, roles: ['ADMIN', 'PEMILIK'], mobile: true },
  { to: '/order', label: 'Order', icon: Droplets, roles: ['ADMIN', 'PEMILIK'], mobile: true, phase: 2, desc: 'Catat galon yang dibeli pelanggan' },
  { to: '/pelanggan', label: 'Pelanggan', icon: Users, roles: ['ADMIN', 'PEMILIK'], phase: 2, desc: 'Data pelanggan, harga khusus, dan diskon' },
  { to: '/utang', label: 'Utang', icon: Wallet, roles: ['ADMIN', 'PEMILIK'], mobile: true, phase: 3, desc: 'Siapa yang masih berutang dan pembayarannya' },
  { to: '/stok', label: 'Stok', icon: Gauge, roles: ['ADMIN', 'PEMILIK'], mobile: true, phase: 3, desc: 'Air di toren dan perkiraan kapan habis' },
  { to: '/laporan', label: 'Laporan', icon: FileText, roles: ['ADMIN', 'PEMILIK'], mobile: true, phase: 4, desc: 'Ringkasan harian, mingguan, dan bulanan' },
  { to: '/keuangan', label: 'Keuangan', icon: PiggyBank, roles: ['ADMIN', 'PEMILIK'], phase: 4, desc: 'Pemasukan, pengeluaran, dan saldo' },
  { to: '/admin/impor-ekspor', label: 'Impor dan ekspor', icon: FileSpreadsheet, roles: ['ADMIN'], phase: 5, desc: 'Ekspor laporan dan impor data dari Excel' },
];

export function navFor(role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
