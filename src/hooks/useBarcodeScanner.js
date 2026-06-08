import { useEffect, useRef } from 'react'

/**
 * Detecta lecturas de pistola de código de barras (HID/teclado).
 * La pistola escribe muy rápido (< 60ms entre teclas) y termina con Enter.
 * Humanos escriben > 100ms entre teclas, por eso se distingue sin ambigüedad.
 *
 * @param {(code: string) => void} onScan  Callback cuando se detecta un código
 * @param {{ enabled?: boolean, minLength?: number, maxDelay?: number }} options
 */
export function useBarcodeScanner(onScan, { enabled = true, minLength = 3, maxDelay = 60 } = {}) {
  const bufferRef = useRef('')
  const timingsRef = useRef([])
  const lastKeyTimeRef = useRef(0)
  const onScanRef = useRef(onScan)

  useEffect(() => { onScanRef.current = onScan }, [onScan])

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return

      const now = Date.now()
      const diff = now - lastKeyTimeRef.current

      if (e.key === 'Enter') {
        const buf = bufferRef.current.trim()
        // Ignorar primer timing (gap desde última acción previa)
        const timings = timingsRef.current.slice(1)

        if (buf.length >= minLength && timings.length > 0) {
          const avg = timings.reduce((a, b) => a + b, 0) / timings.length
          if (avg <= maxDelay) {
            e.preventDefault()
            e.stopPropagation()
            onScanRef.current(buf)
          }
        }

        bufferRef.current = ''
        timingsRef.current = []
        lastKeyTimeRef.current = 0
        return
      }

      if (e.key.length === 1) {
        // Resetear buffer si hubo una pausa larga (usuario escribió algo antes)
        if (diff > 500 && bufferRef.current.length > 0) {
          bufferRef.current = ''
          timingsRef.current = []
        }
        timingsRef.current.push(diff)
        bufferRef.current += e.key
        lastKeyTimeRef.current = now
      }
    }

    // capture: true para interceptar antes que cualquier input
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [enabled, minLength, maxDelay])
}
