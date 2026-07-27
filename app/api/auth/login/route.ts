import { NextResponse } from "next/server"
import { store } from "@/lib/store"
import {
  createSession,
  publicUser,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = String(body?.email ?? "").trim().toLowerCase()
  const password = String(body?.password ?? "")

  const user = [...store.users.values()].find((u) => u.email === email)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "E-mail ou senha invalidos." }, { status: 401 })
  }

  const token = createSession(user.id)
  await setSessionCookie(token)
  return NextResponse.json({ user: publicUser(user) })
}
