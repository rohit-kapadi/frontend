export const managementApiBaseUrl = 'http://localhost:5000/api'

export function getRequestHeaders(user) {
  const headers = { 'Content-Type': 'application/json' }
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

  const response = await fetch(`${managementApiBaseUrl}${path}`, {
    ...options,
    headers,
  })

  const result = await response.json()
  if (!response.ok || result.status !== 'success') {
    throw new Error(result.error || 'Request failed. Please try again.')
  }

  return result
}
