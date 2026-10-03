import { NextResponse } from "next/server"
import { store, genId, saveToDisk } from "@/lib/store"
import type { User } from "@/lib/types"
import {
  createSession,
  hashPassword,
  publicUser,
  setSessionCookie,
} from "@/lib/auth"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const name = String(body?.name ?? "").trim()
  const email = String(body?.email ?? "").trim().toLowerCase()
  const password = String(body?.password ?? "")

  if (!name || !email || password.length < 4) {
    return NextResponse.json(
      { error: "Preencha nome, e-mail e uma senha de ao menos 4 caracteres." },
      { status: 400 },
    )
  }

  // O MongoDB é a única fonte persistente de usuários.
  const exists = [...store.users.values()].some((u) => u.email === email)

  if (exists) {
    return NextResponse.json({ error: "Este e-mail ja esta cadastrado." }, { status: 409 })
  }

  const user: User = {
    id: genId("user"),
    email,
    name,
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
  }
  
  store.users.set(user.id, user)
  await saveToDisk(store)

  const token = await createSession(user.id)
  await setSessionCookie(token)

  return NextResponse.json({ user: publicUser(user) })
}