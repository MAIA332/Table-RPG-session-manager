import { cookies } from "next/headers"
import { createHash, randomBytes } from "crypto"
import { genId, store } from "./store"
import type { User } from "./types"

const COOKIE_NAME = "vtt_session"

export function hashPassword(password: string): string {
  // hash simples com salt (apenas para este VTT em memoria, nao para producao)
  const salt = randomBytes(8).toString("hex")
  const hash = createHash("sha256").update(salt + password).digest("hex")
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  const check = createHash("sha256").update(salt + password).digest("hex")
  return check === hash
}

export function createSession(userId: string): string {
  const token = genId("sess")
  store.sessions.set(token, { token, userId, createdAt: Date.now() })
  return token
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
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
  return store.users.get(session.userId) ?? null
}

export function publicUser(user: User) {
  return { id: user.id, email: user.email, name: user.name }
}
