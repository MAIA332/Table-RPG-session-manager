/** Transformação incremental do manequim, usada apenas no modo controle. */
export type MannequinOrbit = { yaw: number; pitch: number; zoom: number }
export function stepMannequinOrbit(orbit: MannequinOrbit, rightX: number, rightY: number, elapsedMs: number): MannequinOrbit {
  const dt = Math.max(0, Math.min(48, elapsedMs))
  return {
    ...orbit,
    yaw: orbit.yaw + rightX * dt * 0.0028,
    // Na Gamepad API, para cima equivale a eixo negativo: zoom in.
    zoom: Math.max(0.72, Math.min(1.65, orbit.zoom - rightY * dt * 0.00125)),
  }
}
