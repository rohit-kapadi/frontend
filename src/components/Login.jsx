import { useEffect, useState } from 'react'
import WorkspaceDashboard from './WorkspaceDashboard.jsx'
import { clearStoredSession, isSessionDayExpired, readStoredUser, storeAuthenticatedSession } from './sessionAuth.js'
const apiBaseUrl = 'http://localhost:5000/api/auth'

function AuthShell({ children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/70 lg:grid-cols-2">
        <section className="hidden flex-col justify-between bg-teal-800 p-10 text-white lg:flex">
          <div>
            <div className="grid size-12 place-items-center rounded-2xl bg-white/15 text-xl font-bold">R</div>
            <p className="mt-8 text-sm font-semibold tracking-[0.2em] text-teal-100">RADIOLOGISTS CLUB</p>
            <h1 className="mt-4 max-w-sm text-4xl font-semibold leading-tight">Care teams, connected to better insights.</h1>
            <p className="mt-4 max-w-sm leading-7 text-teal-100">
              A secure workspace for diagnostic centres, specialists, and administrators.
            </p>
          </div>
          <p className="text-sm text-teal-100">Multi-tenant medical reporting portal</p>
        </section>

        <section className="p-7 sm:p-10 lg:p-12">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-xl bg-teal-700 font-bold text-white">R</div>
            <p className="text-sm font-semibold tracking-wide text-teal-800">RADIOLOGISTS CLUB</p>
          </div>
          {children}
        </section>
      </div>
    </main>
  )
}

async function postAuth(path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const result = await response.json()
  if (!response.ok || result.status !== 'success') {
    throw new Error(result.error || 'Request failed. Please try again.')
  }

  return result
}

function Login() {
  const [user, setUser] = useState(readStoredUser)
  const [mode, setMode] = useState('login')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [forgotIdentifier, setForgotIdentifier] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [initialPassword, setInitialPassword] = useState('')
  const [initialConfirmPassword, setInitialConfirmPassword] = useState('')
  const [forceFlowIdentifier, setForceFlowIdentifier] = useState('')
  const [forceFlowCurrentPassword, setForceFlowCurrentPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleLoginSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)

    try {
      const result = await postAuth('/login', { username: identifier, password })

      if (result.force_password_change === true) {
        setMode('force-change')
        setForceFlowIdentifier(result.identifier || identifier.trim())
        setForceFlowCurrentPassword(password)
        setInitialPassword('')
        setInitialConfirmPassword('')
        setNotice('For security, you must set a new password before accessing the portal.')
        return
      }

      if (!result.user?.nexus_id) {
        throw new Error('Login response is missing account context.')
      }

      const storedUser = storeAuthenticatedSession(result.user, result.nexus_id, result.session_day)
      setUser(storedUser)
      setPassword('')
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'Unable to connect. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleForgotRequestSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)

    try {
      const result = await postAuth('/forgot-password', { username: forgotIdentifier })
      setNotice(result.message || 'If this account exists, an OTP has been sent to the registered email.')
      setMode('forgot-reset')
      setOtpCode('')
      setResetPassword('')
      setResetConfirmPassword('')
    } catch (forgotError) {
      setError(
        forgotError instanceof Error
          ? forgotError.message
          : 'Unable to request OTP. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResetPasswordSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (resetPassword !== resetConfirmPassword) {
      setError('New password and confirm password must match.')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await postAuth('/reset-password', {
        username: forgotIdentifier,
        otp: otpCode,
        newPassword: resetPassword,
      })

      setNotice(result.message || 'Password reset successful. Please sign in with your new password.')
      setMode('login')
      setIdentifier(forgotIdentifier)
      setPassword('')
      setOtpCode('')
      setResetPassword('')
      setResetConfirmPassword('')
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : 'Unable to reset password. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSetInitialPasswordSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (initialPassword !== initialConfirmPassword) {
      setError('New password and confirm password must match.')
      return
    }

    setIsSubmitting(true)
    try {
      await postAuth('/set-initial-password', {
        username: forceFlowIdentifier,
        currentPassword: forceFlowCurrentPassword,
        newPassword: initialPassword,
      })

      setMode('login')
      setNotice('Password updated successfully. Please sign in with your new password.')
      setIdentifier(forceFlowIdentifier)
      setPassword('')
      setForceFlowCurrentPassword('')
      setInitialPassword('')
      setInitialConfirmPassword('')
    } catch (setPasswordError) {
      setError(
        setPasswordError instanceof Error
          ? setPasswordError.message
          : 'Unable to update password. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
  }

  function handleLogout() {
    clearStoredSession()
    setUser(null)
    setPassword('')
  }

  useEffect(() => {
    if (!user) return undefined
    const timer = window.setInterval(() => {
      if (isSessionDayExpired(user.session_day)) {
        setNotice('')
        setError('Your session has expired. Please sign in again.')
        handleLogout()
      }
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [user])

  if (user) {
    return <WorkspaceDashboard user={user} onLogout={handleLogout} />
  }

  return (
    <AuthShell>
      <p className="text-sm font-semibold text-teal-700">Welcome back</p>

      {mode === 'login' && (
        <>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Sign in to your portal</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Use your registered email or portal username to continue.</p>

          <form className="mt-8 space-y-5" onSubmit={handleLoginSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="username">
                Username or email
              </label>
              <input
                autoComplete="username"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                id="username"
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Enter your username or email"
                required
                value={identifier}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="password">
                Password
              </label>
              <input
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                id="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type="password"
                value={password}
              />
            </div>
            <div className="text-right">
              <button
                className="text-sm font-medium text-teal-700 hover:text-teal-800"
                onClick={() => {
                  setForgotIdentifier(identifier)
                  switchMode('forgot-request')
                }}
                type="button"
              >
                Forgot password?
              </button>
            </div>
            {error && (
              <p aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
                {notice}
              </p>
            )}
            <button
              className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </>
      )}

      {mode === 'forgot-request' && (
        <>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Forgot password</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Enter your username or email to receive a 6-digit OTP.</p>
          <form className="mt-8 space-y-5" onSubmit={handleForgotRequestSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="forgot-identifier">
                Username or email
              </label>
              <input
                autoComplete="username"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                id="forgot-identifier"
                onChange={(event) => setForgotIdentifier(event.target.value)}
                placeholder="Enter your username or email"
                required
                value={forgotIdentifier}
              />
            </div>
            {error && (
              <p aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
                {notice}
              </p>
            )}
            <button
              className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
          <button
            className="mt-5 text-sm font-medium text-slate-600 hover:text-slate-800"
            onClick={() => switchMode('login')}
            type="button"
          >
            Back to sign in
          </button>
        </>
      )}

      {mode === 'forgot-reset' && (
        <>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Reset password</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Enter the OTP sent to your registered email and set a new password.</p>
          <form className="mt-8 space-y-5" onSubmit={handleResetPasswordSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="reset-identifier">
                Username or email
              </label>
              <input
                autoComplete="username"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                id="reset-identifier"
                onChange={(event) => setForgotIdentifier(event.target.value)}
                required
                value={forgotIdentifier}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="otp-code">
                6-digit OTP
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                id="otp-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ''))}
                pattern="\d{6}"
                placeholder="Enter 6-digit OTP"
                required
                value={otpCode}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="new-reset-password">
                New password
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                id="new-reset-password"
                minLength={8}
                onChange={(event) => setResetPassword(event.target.value)}
                placeholder="Minimum 8 characters"
                required
                type="password"
                value={resetPassword}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="confirm-reset-password">
                Confirm new password
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                id="confirm-reset-password"
                minLength={8}
                onChange={(event) => setResetConfirmPassword(event.target.value)}
                placeholder="Re-enter new password"
                required
                type="password"
                value={resetConfirmPassword}
              />
            </div>
            {error && (
              <p aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
                {notice}
              </p>
            )}
            <button
              className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Updating password...' : 'Reset password'}
            </button>
          </form>
          <button
            className="mt-5 text-sm font-medium text-slate-600 hover:text-slate-800"
            onClick={() => switchMode('login')}
            type="button"
          >
            Back to sign in
          </button>
        </>
      )}

      {mode === 'force-change' && (
        <>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Set your initial password</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            This is your first login. Set a new password to continue securely.
          </p>
          <form className="mt-8 space-y-5" onSubmit={handleSetInitialPasswordSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="force-identifier">
                Username or email
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700"
                id="force-identifier"
                readOnly
                value={forceFlowIdentifier}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="initial-password">
                New password
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                id="initial-password"
                minLength={8}
                onChange={(event) => setInitialPassword(event.target.value)}
                placeholder="Minimum 8 characters"
                required
                type="password"
                value={initialPassword}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="initial-confirm-password">
                Confirm new password
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                id="initial-confirm-password"
                minLength={8}
                onChange={(event) => setInitialConfirmPassword(event.target.value)}
                placeholder="Re-enter new password"
                required
                type="password"
                value={initialConfirmPassword}
              />
            </div>
            {error && (
              <p aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
                {notice}
              </p>
            )}
            <button
              className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Saving password...' : 'Set password'}
            </button>
          </form>
        </>
      )}

      <p className="mt-8 text-center text-xs leading-5 text-slate-500">
        Authorized healthcare personnel only. Your access is scoped to your Nexus.
      </p>
    </AuthShell>
  )
}

export default Login
