import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { FeedbackProvider, Loading } from './components/ui'
import { AppProvider, useApp } from './lib/app'
import { I18nProvider } from './lib/i18n'
import { ThemeProvider } from './lib/theme'
import { supabase } from './lib/supabase'
import { AuthPage, ResetPassword } from './pages/AuthPage'
import { Dashboard } from './pages/Dashboard'
import { ExpiryPage } from './pages/Expiry'
import { History } from './pages/History'
import { KhataDetail, KhataList } from './pages/Khata'
import { Roznamcha } from './pages/Roznamcha'
import { Sales } from './pages/Sales'
import { NoOrg } from './pages/NoOrg'
import { ProductDetail } from './pages/ProductDetail'
import { Products } from './pages/Products'
import { Reports } from './pages/Reports'
import { SettingsPage } from './pages/Settings'
import { StockIn } from './pages/StockIn'
import { StockOut } from './pages/StockOut'

function Root() {
  const { ready, session, org } = useApp()
  const [recovery, setRecovery] = useState(() => location.pathname === '/reset-password' || location.hash.includes('type=recovery'))

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => event === 'PASSWORD_RECOVERY' && setRecovery(true))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return <Loading />
  if (recovery && session)
    return (
      <ResetPassword
        onDone={() => {
          setRecovery(false)
          history.replaceState(null, '', '/')
        }}
      />
    )
  if (!session) return <AuthPage />
  if (!org) return <NoOrg />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="products/:id" element={<ProductDetail />} />
        <Route path="stock-in" element={<StockIn />} />
        <Route path="stock-out" element={<StockOut />} />
        <Route path="sales" element={<Sales />} />
        <Route path="khata" element={<KhataList />} />
        <Route path="khata/:id" element={<KhataDetail />} />
        <Route path="roznamcha" element={<Roznamcha />} />
        <Route path="expiry" element={<ExpiryPage />} />
        <Route path="history" element={<History />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <ThemeProvider>
    <I18nProvider>
      <FeedbackProvider>
        <AppProvider>
          <BrowserRouter>
            <Root />
          </BrowserRouter>
        </AppProvider>
      </FeedbackProvider>
    </I18nProvider>
    </ThemeProvider>
  )
}
