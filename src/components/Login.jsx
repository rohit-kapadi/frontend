import { useState } from 'react'

const userStorageKey = 'radiologistsClubUser'
const nexusStorageKey = 'nexus_id'

function readStoredUser() {
  try {
    const storedUser = localStorage.getItem(userStorageKey)
    if (!storedUser) return null

    const user = JSON.parse(storedUser)
    if (
      !user ||
      typeof user !== 'object' ||
      typeof user.role !== 'string' ||
      typeof user.nexus_id !== 'string' ||
      typeof user.id !== 'string'
    ) {
      localStorage.removeItem(userStorageKey)
      localStorage.removeItem(nexusStorageKey)
      return null
    }

    return user
  } catch {
    localStorage.removeItem(userStorageKey)
    localStorage.removeItem(nexusStorageKey)
    return null
  }
}

function Dashboard({ user, onLogout }) {
  const displayName = user.name || user.email || user.id

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-teal-700 text-lg font-bold text-white">R</div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-teal-800">RADIOLOGISTS CLUB</p>
              <p className="text-xs text-slate-500">Secure medical reporting portal</p>
            </div>
          </div>
          <button
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
            onClick={onLogout}
            type="button"
          >
            Sign out
          </button>
        </header>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Welcome, {displayName}</h1>
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Role</p>
              <p className="mt-1 font-medium capitalize text-slate-900">{user.role.replaceAll('_', ' ')}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Nexus</p>
              <p className="mt-1 font-medium text-slate-900">{user.nexus_id}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function Login() {
  const [user, setUser] = useState(readStoredUser)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier, password }),
      })
      const result = await response.json()

      if (!response.ok || result.status !== 'success' || !result.user?.nexus_id) {
        throw new Error(result.error || 'Login failed. Please check your details and try again.')
      }

      localStorage.setItem(userStorageKey, JSON.stringify(result.user))
      localStorage.setItem(nexusStorageKey, result.nexus_id)
      setUser(result.user)
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

  function handleLogout() {
    localStorage.removeItem(userStorageKey)
    localStorage.removeItem(nexusStorageKey)
    setUser(null)
    setPassword('')
  }

  if (user) {
    return <Dashboard user={user} onLogout={handleLogout} />
  }

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
          <p className="text-sm font-semibold text-teal-700">Welcome back</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Sign in to your portal</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Use your registered email or portal username to continue.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
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
            {error && (
              <p aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
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

          <p className="mt-8 text-center text-xs leading-5 text-slate-500">
            Authorized healthcare personnel only. Your access is scoped to your Nexus.
          </p>
        </section>
      </div>
    </main>
  )
}

export default Login
