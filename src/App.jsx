import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import {
  NotFound,
  RedirectIfAuthenticated,
  RequireAdmin,
  RequireAuth,
  RequireModule,
} from '@/components/layout/Guards'
import LoginPage from '@/pages/auth/LoginPage'
import SetupPage from '@/pages/auth/SetupPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import DashboardPage from '@/pages/app/DashboardPage'
import InventoryPage from '@/pages/app/InventoryPage'
import PurchasesPage from '@/pages/app/PurchasesPage'
import SalesPage from '@/pages/app/SalesPage'
import QuotationsPage from '@/pages/app/QuotationsPage'
import ContactsPage from '@/pages/app/ContactsPage'
import TransfersPage from '@/pages/app/TransfersPage'
import CashbookPage from '@/pages/app/CashbookPage'
import JournalsPage from '@/pages/app/JournalsPage'
import GeneralLedgerPage from '@/pages/app/GeneralLedgerPage'
import ReportsPage from '@/pages/app/ReportsPage'
import ActivityPage from '@/pages/app/ActivityPage'
import SettingsPage from '@/pages/app/SettingsPage'
import AccountPage from '@/pages/app/AccountPage'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

function ProtectedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />

        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <LoginPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/setup"
          element={
            <RedirectIfAuthenticated>
              <SetupPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <RedirectIfAuthenticated>
              <ForgotPasswordPage />
            </RedirectIfAuthenticated>
          }
        />

        <Route
          path="/app"
          element={
            <RequireAuth>
              <ProtectedLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route
            path="inventory"
            element={
              <RequireModule module="inventory">
                <InventoryPage />
              </RequireModule>
            }
          />
          <Route
            path="purchases"
            element={
              <RequireModule module="purchases">
                <PurchasesPage />
              </RequireModule>
            }
          />
          <Route
            path="sales"
            element={
              <RequireModule module="sales">
                <SalesPage />
              </RequireModule>
            }
          />
          <Route
            path="quotations"
            element={
              <RequireModule module="quotations">
                <QuotationsPage />
              </RequireModule>
            }
          />
          <Route
            path="contacts"
            element={
              <RequireModule module="contacts">
                <ContactsPage />
              </RequireModule>
            }
          />
          <Route
            path="transfers"
            element={
              <RequireModule module="transfers">
                <TransfersPage />
              </RequireModule>
            }
          />
          <Route
            path="cashbook"
            element={
              <RequireModule module="cashbook">
                <CashbookPage />
              </RequireModule>
            }
          />
          <Route
            path="journals"
            element={
              <RequireModule module="journals">
                <JournalsPage />
              </RequireModule>
            }
          />
          <Route
            path="ledger"
            element={
              <RequireModule module="ledger">
                <GeneralLedgerPage />
              </RequireModule>
            }
          />
          <Route
            path="reports"
            element={
              <RequireModule module="reports">
                <ReportsPage />
              </RequireModule>
            }
          />
          <Route
            path="activity"
            element={
              <RequireModule module="activity">
                <ActivityPage />
              </RequireModule>
            }
          />
          <Route path="account" element={<AccountPage />} />
          <Route
            path="settings"
            element={
              <RequireAdmin>
                <SettingsPage />
              </RequireAdmin>
            }
          />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
