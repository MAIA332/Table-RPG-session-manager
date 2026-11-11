/** Métricas do WebRTC obtidas do SDK LiveKit. Sem estimativas de qualidade inventadas. */
export type AudioCounter = {
  timestamp: number
  packets: number | undefined
  lost: number | undefined
  bytes: number | undefined
  jitter: number | undefined // seconds
  rtt: number | undefined // seconds
  concealmentEvents: number | undefined
}
export type AudioDelta = {
  lossPct?: number
  kbps?: number
  jitterMs?: number
  rttMs?: number
  concealed?: number
}
const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

export function audioCounter(stats: {
  timestamp: number
  packetsSent?: number
  packetsReceived?: number
  packetsLost?: number
  bytesSent?: number
  bytesReceived?: number
  jitter?: number
  roundTripTime?: number
  concealmentEvents?: number
}, received: boolean): AudioCounter {
  return {
    timestamp: stats.timestamp,
    packets: numberOrUndefined(received ? stats.packetsReceived : stats.packetsSent),
    lost: numberOrUndefined(stats.packetsLost),
    bytes: numberOrUndefined(received ? stats.bytesReceived : stats.bytesSent),
    jitter: numberOrUndefined(stats.jitter),
    rtt: numberOrUndefined(stats.roundTripTime),
    concealmentEvents: numberOrUndefined(stats.concealmentEvents),
  }
}

export function audioDelta(current: AudioCounter, prior?: AudioCounter): AudioDelta {
  const result: AudioDelta = {}
  if (current.jitter !== undefined) result.jitterMs = Math.round(current.jitter * 1000)
  if (current.rtt !== undefined) result.rttMs = Math.round(current.rtt * 1000)
  if (!prior || current.timestamp <= prior.timestamp) return result
  if (current.bytes !== undefined && prior.bytes !== undefined && current.bytes >= prior.bytes) {
    result.kbps = Math.round((current.bytes - prior.bytes) * 8 / (current.timestamp - prior.timestamp))
  }
  if (current.packets !== undefined && prior.packets !== undefined && current.lost !== undefined && prior.lost !== undefined) {
    const packets = current.packets - prior.packets
    const lost = current.lost - prior.lost
    if (packets >= 0 && lost >= 0 && packets + lost > 0) {
      result.lossPct = Math.round(lost * 1000 / (packets + lost)) / 10
    }
  }
  if (current.concealmentEvents !== undefined && prior.concealmentEvents !== undefined) {
    result.concealed = Math.max(0, current.concealmentEvents - prior.concealmentEvents)
  }
  return result
}

export function audioHealth(stats: AudioDelta): 'unknown' | 'normal' | 'warning' {
  if (stats.lossPct === undefined && stats.jitterMs === undefined && stats.concealed === undefined) return 'unknown'
  if ((stats.lossPct ?? 0) >= 3 || (stats.jitterMs ?? 0) >= 30 || (stats.concealed ?? 0) >= 5) return 'warning'
  return 'normal'
}
