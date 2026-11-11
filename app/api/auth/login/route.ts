import { NextResponse } from "next/server"
import { store, saveToDisk } from "@/lib/store"
import { allowAuthAttempt, authClientKey } from "@/lib/auth-rate-limit"
import {
  createSession,
  publicUser,
  setSessionCookie,
  verifyPassword,
  passwordNeedsUpgrade,
  hashPassword,
} from "@/lib/auth"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = String(body?.email ?? "").trim().toLowerCase()
  const password = String(body?.password ?? "")

  if (!allowAuthAttempt(`login:${authClientKey(request,email)}`)) {
    return NextResponse.json({error:'Muitas tentativas. Tente novamente em alguns minutos.'}, {status:429})
  }
  // O MongoDB já foi carregado para o store antes da primeira requisição.
  const user = [...store.users.values()].find((u) => u.email === email)

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "E-mail ou senha invalidos." }, { status: 401 })
  }

  if (passwordNeedsUpgrade(user.passwordHash)) {
    user.passwordHash = hashPassword(password)
    store.users.set(user.id, user)
    await saveToDisk(store)
  }
  const token = await createSession(user.id)
  await setSessionCookie(token)
  return NextResponse.json({ user: publicUser(user) })
}