export const managementApiBaseUrl = 'http://localhost:5000/api'

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
  return headers
}

export async function requestWithScope(path, user, options = {}) {
  const headers = { ...getRequestHeaders(user), ...(options.headers ?? {}) }
  // Let the browser set the multipart boundary for FormData bodies.
  if (options.body instanceof FormData) delete headers['Content-Type']
  const method = String(options.method || 'GET').toUpperCase()

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
    const errorMessage = result?.error
      || result?.message
      || (rawBody ? `HTTP ${response.status} ${response.statusText}: ${rawBody.slice(0, 220)}` : `HTTP ${response.status} ${response.statusText}`)
    throw new Error(`[${method} ${path}] ${errorMessage}`)
  }

  if (!result || result.status !== 'success') {
    const fallback = rawBody ? rawBody.slice(0, 220) : 'Request failed. Please try again.'
    throw new Error(`[${method} ${path}] ${result?.error || fallback}`)
  }

  return result
}
