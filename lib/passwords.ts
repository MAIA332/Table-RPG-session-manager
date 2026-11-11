import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/** scrypt para novas senhas; formato legado SHA-256 aceito apenas para migração. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function passwordNeedsUpgrade(stored: string): boolean { return !stored.startsWith('scrypt:') }
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split(':')
    if (parts.length === 3 && parts[0] === 'scrypt') {
      const expected = Buffer.from(parts[2], 'hex')
      if (expected.length !== 64 || parts[1].length !== 32) return false
      return timingSafeEqual(scryptSync(password, parts[1], expected.length), expected)
    }
    // Contas existentes continuam funcionando e são migradas no próximo login.
    if (parts.length === 2 && /^[a-f0-9]{16}$/i.test(parts[0]) && /^[a-f0-9]{64}$/i.test(parts[1])) {
      const actual = createHash('sha256').update(parts[0] + password).digest()
      return timingSafeEqual(actual, Buffer.from(parts[1], 'hex'))
    }
  } catch { /* formato inválido */ }
  return false
}

