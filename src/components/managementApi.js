export const managementApiBaseUrl = 'http://localhost:5000/api'
import { clearStoredSession, isSessionDayExpired } from './sessionAuth.js'

export function getRequestHeaders(user) {
  const headers = { 'Content-Type': 'application/json' }
  if (typeof user?.id === 'string' && user.id.length > 0) {
    headers['x-user-id'] = user.id
  }
  if (typeof user?.nexus_id === 'string' && user.nexus_id.length > 0) {
    headers['x-nexus-id'] = user.nexus_id
  }
  if (typeof user?.role === 'string' && user.role.length > 0) {
    headers['x-user-role'] = user.role
  }
  if (typeof user?.centre_id === 'string' && user.centre_id.length > 0) {
    headers['x-centre-id'] = user.centre_id
  }
  if (typeof user?.session_day === 'string' && user.session_day.length > 0) {
    headers['x-session-day'] = user.session_day
  }
  return headers
}

function buildFriendlyErrorMessage(result, fallbackMessage) {
  const rawError = result?.error || result?.message || fallbackMessage
  if (typeof rawError !== 'string') return fallbackMessage
  return rawError.replace(/^\[[A-Z]+\s+[^\]]+\]\s*/, '').trim() || fallbackMessage
}

export async function requestWithScope(path, user, options = {}) {
  if (isSessionDayExpired(user?.session_day)) {
    clearStoredSession()
    if (typeof window !== 'undefined') window.location.assign('/')
    throw new Error('Your session has expired. Please sign in again.')
  }

  const headers = { ...getRequestHeaders(user), ...(options.headers ?? {}) }
  // Let the browser set the multipart boundary for FormData bodies.
  if (options.body instanceof FormData) delete headers['Content-Type']

  const response = await fetch(`${managementApiBaseUrl}${path}`, {
    ...options,
    headers,
  })

  const rawBody = await response.text()
  let result = null
  if (rawBody) {
    try {
      result = JSON.parse(rawBody)
    } catch {
      result = null
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredSession()
      if (typeof window !== 'undefined') window.location.assign('/')
    }
    const errorMessage = buildFriendlyErrorMessage(result, 'Request could not be completed. Please try again.')
    throw new Error(errorMessage)
  }

  if (!result || result.status !== 'success') {
    const fallback = 'Request failed. Please try again.'
    throw new Error(buildFriendlyErrorMessage(result, fallback))
  }

  return result
}
