import { NextResponse } from "next/server"
import { store } from "@/lib/store"
import {
  createSession,
  publicUser,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth"
import type { User } from "@/lib/types"
import fs from "fs/promises"
import path from "path"

const USERS_FILE = path.join(process.cwd(), "users.json")

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = String(body?.email ?? "").trim().toLowerCase()
  const password = String(body?.password ?? "")

  // Procura no store em memória
  let user = [...store.users.values()].find((u) => u.email === email)

  // Se não encontrou no store, consulta o arquivo JSON local
  if (!user) {
    try {
      const fileData = await fs.readFile(USERS_FILE, "utf-8")
      const fileUsers: User[] = JSON.parse(fileData)
      
      // Procura o usuário no array lido do arquivo
      const foundUser = fileUsers.find((u: User) => u.email === email)
      
      if (foundUser) {
        user = foundUser
        // Recarrega o usuário no store em memória para acessos mais rápidos nas próximas requisições
        store.users.set(user.id, user)
      }
    } catch (err) {
      // Arquivo users.json não existe ou não pôde ser lido
    }
  }

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "E-mail ou senha invalidos." }, { status: 401 })
  }

  const token = createSession(user.id)
  await setSessionCookie(token)
  return NextResponse.json({ user: publicUser(user) })
}