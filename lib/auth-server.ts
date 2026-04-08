// lib/auth-server.ts
import 'server-only'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'

const COOKIE = 'recepita_session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export type Session = { userId: string; email: string }

export function signSession(payload: Session) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change'
  return jwt.sign(payload, secret, { expiresIn: MAX_AGE })
}

export function verifySession(token: string): Session | null {
  try {
    const secret = process.env.JWT_SECRET || 'dev-secret-change'
    return jwt.verify(token, secret) as Session
  } catch {
    return null
  }
}

export function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
    path: '/',
  })
}

export function clearSessionCookie() {
  cookies().set(COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' })
}

export function getSession(): Session | null {
  const c = cookies().get(COOKIE)?.value
  if (!c) return null
  try {
    const secret = process.env.JWT_SECRET || 'dev-secret-change'
    return jwt.verify(c, secret) as Session
  } catch (e: any) {
    console.warn('getSession.verify.failed', e?.name || e)
    return null
  }
}

export function getSessionOrThrow(): Session {
  const s = getSession()
  if (!s) throw new Error('Unauthorized')
  return s
}

export function getUserIdOrThrow(): string {
  return getSessionOrThrow().userId
}
