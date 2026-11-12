import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppProvider, useApp } from './store';
import { ConfirmProvider, Loading } from './components/ui';
import { Layout } from './components/Layout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Sessions = lazy(() => import('./pages/Sessions'));
const SessionDetail = lazy(() => import('./pages/SessionDetail'));
const PlanningPage = lazy(() => import('./pages/PlanningPage'));
const Clients = lazy(() => import('./pages/Clients'));
const Orders = lazy(() => import('./pages/Orders'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const Production = lazy(() => import('./pages/Production'));
const Catalog = lazy(() => import('./pages/Catalog'));
const Templates = lazy(() => import('./pages/Templates'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Profitability = lazy(() => import('./pages/Profitability'));
const Documents = lazy(() => import('./pages/Documents'));
const Settings = lazy(() => import('./pages/Settings'));
const Sale = lazy(() => import('./pages/Sale'));
const ClientApp = lazy(() => import('./client/ClientApp'));

function Shell() {
  const { client } = useApp();
  // In client mode the admin routes are NOT mounted at all: no navigation can reach them.
  if (client) return <Suspense fallback={<Loading />}><ClientApp /></Suspense>;
  return (
    <HashRouter>
      <Layout>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/seances" element={<Sessions />} />
            <Route path="/seances/:id" element={<SessionDetail />} />
            <Route path="/planning" element={<PlanningPage />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/commandes" element={<Orders />} />
            <Route path="/commandes/:id" element={<OrderDetail />} />
            <Route path="/vente/:sessionId/:registrationId" element={<Sale />} />
            <Route path="/vente/commande/:orderId" element={<Sale />} />
            <Route path="/postproduction" element={<Production />} />
            <Route path="/catalogue" element={<Catalog />} />
            <Route path="/tarifs" element={<Templates />} />
            <Route path="/tarifs/:id" element={<Templates />} />
            <Route path="/fournisseurs" element={<Suppliers />} />
            <Route path="/rentabilite" element={<Profitability />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/parametres" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
      </Layout>
    </HashRouter>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ConfirmProvider>
        <Shell />
        <Toaster theme="dark" position="bottom-right" richColors closeButton toastOptions={{ style: { background: '#19191c', border: '1px solid #34343a', color: '#f3f1ec' } }} />
      </ConfirmProvider>
    </AppProvider>
  );
}
