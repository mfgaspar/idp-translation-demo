import { useEffect, useState } from 'react'

const QUERY = '(min-width: 768px)'

/** True when viewport is at least Tailwind `md` (768px). Client-only until first effect. */
export function useMinMd(): boolean {
  const [mdUp, setMdUp] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const sync = () => setMdUp(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return mdUp
}
