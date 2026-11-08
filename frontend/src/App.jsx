import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import { RequireAuth, RequireRole } from './components/guards.jsx';
import ComingSoonPage from './pages/ComingSoonPage.jsx';
import CustomersPage from './pages/CustomersPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import OrderPage from './pages/OrderPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />

          {/* Dibuka untuk ADMIN dan PEMILIK; yang belum jadi = penampung (ComingSoon) */}
          <Route path="order" element={<OrderPage />} />
          <Route path="pelanggan" element={<CustomersPage />} />
          <Route path="utang" element={<ComingSoonPage />} />
          <Route path="stok" element={<ComingSoonPage />} />
          <Route path="laporan" element={<ComingSoonPage />} />
          <Route path="keuangan" element={<ComingSoonPage />} />

          {/* Khusus ADMIN */}
          <Route element={<RequireRole roles={['ADMIN']} />}>
            <Route path="admin/impor-ekspor" element={<ComingSoonPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
