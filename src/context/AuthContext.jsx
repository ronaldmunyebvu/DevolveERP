import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as authApi from '@/db/remote/auth.api'
import { MODULE_KEYS } from '@/lib/permissions'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    authApi
      .restore()
      .then((account) => {
        if (cancelled || !account) return
        setUser(account.user)
        setCompany(account.company)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause.message)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const adopt = useCallback((account) => {
    if (!account) return null
    setUser(account.user)
    setCompany(account.company)
    setError(null)
    return account.user
  }, [])

  const signIn = useCallback(
    async ({ email, password, role }) => adopt(await authApi.signIn(email, password, role)),
    [adopt],
  )

  const requestSetup = useCallback((email, role) => authApi.requestSetup(email, role), [])

  const completeSetup = useCallback(
    async (values) => adopt(await authApi.completeSetup(values)),
    [adopt],
  )

  const requestPasswordReset = useCallback(
    (email, role) => authApi.requestPasswordReset(email, role),
    [],
  )

  const completePasswordReset = useCallback(
    async (values) => adopt(await authApi.completePasswordReset(values)),
    [adopt],
  )

  const changePassword = useCallback((values) => authApi.changePassword(values), [])

  const signOut = useCallback(async () => {
    await authApi.signOut().catch(() => {})
    setUser(null)
    setCompany(null)
  }, [])

  const refresh = useCallback(async () => {
    const account = await authApi.restore()
    if (account) {
      setUser(account.user)
      setCompany(account.company)
    }
    return account
  }, [])

  const isAdmin = user?.role === 'admin'
  const permissions = useMemo(() => {
    if (isAdmin) return MODULE_KEYS
    return Array.isArray(user?.permissions) ? user.permissions : []
  }, [isAdmin, user?.permissions])
  const can = useCallback(
    (module) => module === 'dashboard' || isAdmin || permissions.includes(module),
    [isAdmin, permissions],
  )

  const value = useMemo(
    () => ({
      user,
      company,
      ready,
      error,
      isAuthenticated: Boolean(user),
      isAdmin,
      permissions,
      can,
      signIn,
      requestSetup,
      completeSetup,
      requestPasswordReset,
      completePasswordReset,
      changePassword,
      signOut,
      refresh,
      clearError: () => setError(null),
      setCompany,
    }),
    [
      user,
      company,
      ready,
      error,
      isAdmin,
      permissions,
      can,
      signIn,
      requestSetup,
      completeSetup,
      requestPasswordReset,
      completePasswordReset,
      changePassword,
      signOut,
      refresh,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
