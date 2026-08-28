import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext.jsx';
import { Layout } from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import ChartsPage from './pages/ChartsPage.jsx';
import MumPage from './pages/MumPage.jsx';
import MilestonesPage from './pages/MilestonesPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

function ProtectedArea() {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered-message">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/charts" element={<ChartsPage />} />
        <Route path="/mum" element={<MumPage />} />
        <Route path="/calendar" element={<MilestonesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedArea />} />
      </Routes>
    </AuthProvider>
  );
}
