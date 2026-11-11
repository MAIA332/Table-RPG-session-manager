import { cookies } from "next/headers"
import { randomBytes } from "crypto"
import { saveToDisk, store } from "./store"
import type { User } from "./types"

const COOKIE_NAME = "vtt_session"

export { hashPassword, verifyPassword, passwordNeedsUpgrade } from "./passwords"

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url")
  store.sessions.set(token, { token, userId, createdAt: Date.now() })
  await saveToDisk(store)
  return token
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE_NAME)
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  const session = store.sessions.get(token)
  if (!session) return null
  if (Date.now() - session.createdAt > 30 * 24 * 60 * 60 * 1000) return null
  return store.users.get(session.userId) ?? null
}

export function publicUser(user: User) {
  return { id: user.id, email: user.email, name: user.name }
}
