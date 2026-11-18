export const userStorageKey = 'radiologistsClubUser'
export const nexusStorageKey = 'nexus_id'

const sessionDayPattern = /^\d{4}-\d{2}-\d{2}$/

export function getCurrentSessionDay() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function clearStoredSession() {
  localStorage.removeItem(userStorageKey)
  localStorage.removeItem(nexusStorageKey)
}

export function isSessionDayExpired(sessionDay) {
  if (typeof sessionDay !== 'string' || !sessionDayPattern.test(sessionDay)) return true
  return sessionDay !== getCurrentSessionDay()
}

export function readStoredUser() {
  try {
    const storedUser = localStorage.getItem(userStorageKey)
    if (!storedUser) return null

    const user = JSON.parse(storedUser)
    const isValidShape = user
      && typeof user === 'object'
      && typeof user.role === 'string'
      && typeof user.nexus_id === 'string'
      && typeof user.id === 'string'

    if (!isValidShape || isSessionDayExpired(user.session_day)) {
      clearStoredSession()
      return null
    }

    return user
  } catch {
    clearStoredSession()
    return null
  }
}

export function storeAuthenticatedSession(user, nexusId, sessionDay) {
  const normalizedSessionDay = typeof sessionDay === 'string' && sessionDayPattern.test(sessionDay)
    ? sessionDay
    : getCurrentSessionDay()
  const sessionUser = { ...user, session_day: normalizedSessionDay }
  localStorage.setItem(userStorageKey, JSON.stringify(sessionUser))
  localStorage.setItem(nexusStorageKey, nexusId)
  return sessionUser
}
