import { NextResponse } from "next/server"
import { store, genId } from "@/lib/store"
import {
  createSession,
  hashPassword,
  publicUser,
  setSessionCookie,
} from "@/lib/auth"
import type { User } from "@/lib/types"
import fs from "fs/promises"
import path from "path"

const USERS_FILE = path.join(process.cwd(), "users.json")

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

  // Verifica se existe no store (memória)
  let exists = [...store.users.values()].some((u) => u.email === email)

  // Lê o JSON local para garantir que não existe (caso o servidor tenha reiniciado)
  let fileUsers: User[] = []
  try {
    const fileData = await fs.readFile(USERS_FILE, "utf-8")
    fileUsers = JSON.parse(fileData)
    if (!exists) {
      exists = fileUsers.some((u: User) => u.email === email)
    }
  } catch (err) {
    // Arquivo não existe ainda (primeiro registro) ou está vazio, ignora
  }

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
  
  // Salva no store em memória
  store.users.set(user.id, user)

  // Adiciona ao array e salva no arquivo JSON local
  fileUsers.push(user)
  await fs.writeFile(USERS_FILE, JSON.stringify(fileUsers, null, 2), "utf-8")

  const token = createSession(user.id)
  await setSessionCookie(token)

  return NextResponse.json({ user: publicUser(user) })
}