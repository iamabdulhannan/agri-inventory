import { useCallback, useEffect, useRef, useState } from 'react'

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Supabase returns max 1000 rows per request; this pages through everything. */
export async function fetchAll<T>(page: (from: number, to: number) => PageResult<T>, size = 1000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < size) break
  }
  return out
}

/** Unwrap a Supabase response or throw its error */
export async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data
}

/** Load data on mount and whenever deps change. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const run = useCallback(() => {
    const id = ++seq.current
    setLoading(true)
    setError(null)
    fn().then(
      (d) => { if (id === seq.current) { setData(d); setLoading(false) } },
      (e) => { if (id === seq.current) { setError(e); setLoading(false) } },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(run, [run])
  return { data, error, loading, reload: run, setData }
}
