import { useState, useEffect } from 'preact/hooks'
import { getPref, setPref, subscribePref, type PrefKey, type PrefValues } from '../utils/prefs.js'

export function usePref<K extends PrefKey>(key: K): [PrefValues[K], (value: PrefValues[K]) => void] {
  const [value, setValue] = useState<PrefValues[K]>(() => getPref(key))

  useEffect(() => {
    setValue(getPref(key))
    return subscribePref(key, setValue)
  }, [key])

  const update = (next: PrefValues[K]) => {
    setPref(key, next)
  }

  return [value, update]
}
