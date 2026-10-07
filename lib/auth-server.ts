// lib/auth-server.ts
import 'server-only'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'

export const SESSION_COOKIE = 'recepita_session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export type Session = { userId: string; email: string }

function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret) throw new Error('JWT_SECRET is required')
  return secret
}

export function signSession(payload: Session) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: MAX_AGE })
}

export function verifySession(token: string): Session | null {
  try {
    return jwt.verify(token, getJwtSecret()) as Session
  } catch {
    return null
  }
}

export async function setSessionCookie(token: string) {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
    path: '/',
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' })
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = verifySession(token)
  if (!session) console.warn('getSession.verify.failed')
  return session
}

export async function getSessionOrThrow(): Promise<Session> {
  const s = await getSession()
  if (!s) throw new Error('Unauthorized')
  return s
}

export async function getUserIdOrThrow(): Promise<string> {
  return (await getSessionOrThrow()).userId
}
