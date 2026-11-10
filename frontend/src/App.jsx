import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import { RequireAuth, RequireRole } from './components/guards.jsx';
import ComingSoonPage from './pages/ComingSoonPage.jsx';
import CustomersPage from './pages/CustomersPage.jsx';
import DebtsPage from './pages/DebtsPage.jsx';
import FinancePage from './pages/FinancePage.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import OrderPage from './pages/OrderPage.jsx';
import ReportPage from './pages/ReportPage.jsx';
import SlipPage from './pages/SlipPage.jsx';
import TankPage from './pages/TankPage.jsx';
import WagesPage from './pages/WagesPage.jsx';

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
          <Route path="utang" element={<DebtsPage />} />
          <Route path="stok" element={<TankPage />} />
          <Route path="laporan" element={<ReportPage />} />
          <Route path="keuangan" element={<FinancePage />} />
          <Route path="upah" element={<WagesPage />} />
          <Route path="upah/slip/:id" element={<SlipPage />} />

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
