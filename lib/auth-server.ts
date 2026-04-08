// lib/auth-server.ts
import 'server-only'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'

const COOKIE = 'recepita_session'
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
    return jwt.verify(c, getJwtSecret()) as Session
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
