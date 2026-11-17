import { useCallback, useEffect, useRef, useState } from 'react'
import { getRepository } from '@/db'

export function useRepository() {
  const [repo, setRepo] = useState(null)
  useEffect(() => {
    let alive = true
    getRepository()
      .then((value) => {
        if (alive) setRepo(value)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return repo
}

export function useAsyncData(loader, deps = [], { enabled = true } = {}) {
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled))
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return undefined
    }
    let alive = true
    setLoading(true)
    setError('')
    Promise.resolve()
      .then(() => loaderRef.current())
      .then((result) => {
        if (alive) setData(result)
      })
      .catch((cause) => {
        if (alive) setError(cause.message || 'Could not load this data.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled])

  return { data, loading, error, reload, setData }
}
