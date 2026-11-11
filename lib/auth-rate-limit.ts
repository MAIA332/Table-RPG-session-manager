/** Limite local por processo. Para múltiplas instâncias, substitua por Redis/limite no gateway. */
const attempts = new Map<string, number[]>()
export function allowAuthAttempt(key: string, limit = 8, periodMs = 15 * 60_000): boolean {
  const now = Date.now()
  if (attempts.size > 6000) {
    for (const [id, times] of attempts) {
      if (!times.length || times[times.length-1] < now - periodMs) attempts.delete(id)
    }
    if (attempts.size > 6000) attempts.clear()
  }
  const current = (attempts.get(key) || []).filter(time => time > now - periodMs)
  if (current.length >= limit) { attempts.set(key,current); return false }
  current.push(now)
  attempts.set(key,current)
  return true
}
export function authClientKey(request: Request, email = ''): string {
  // Origin IP only when behind a trusted proxy; deploy a distributed rate limiter on ingress.
  const ip = request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unidentified'
  return `${ip.slice(0,100)}:${email.toLowerCase().slice(0,150)}`
}
