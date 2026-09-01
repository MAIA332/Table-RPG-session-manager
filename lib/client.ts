"use client"

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  })
  
  if (!res.ok) {
    // Attempt to parse JSON error, fallback to empty object if it's an HTML/empty response
    const data = await res.json().catch(() => ({}))
    
    // Provide a much clearer fallback error that includes the HTTP status
    const errorMessage = data.error || `Erro na requisição: ${res.status} ${res.statusText}`
    throw new Error(errorMessage)
  }

  // Only parse the success JSON if the response is OK
  return await res.json().catch(() => ({})) as T
}