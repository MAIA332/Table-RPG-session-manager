import { NextResponse } from "next/server"
import { store, genId } from "@/lib/store"
import {
  createSession,
  hashPassword,
  publicUser,
  setSessionCookie,
} from "@/lib/auth"
import type { User } from "@/lib/types"

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

  const token = createSession(user.id)
  await setSessionCookie(token)

  return NextResponse.json({ user: publicUser(user) })
}
