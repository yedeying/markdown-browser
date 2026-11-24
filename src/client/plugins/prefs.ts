import { useCallback, useEffect, useState } from 'preact/hooks'

type Listener = (value: string | boolean) => void

const listeners = new Map<string, Set<Listener>>()

/** 所有插件偏好 key 均以 vmd_ 开头，与 resetLocalPrefs 保持一致 */
export function pluginPrefStorageKey(pluginId: string, key: string): string {
  const safePlugin = pluginId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `vmd_plugin_${safePlugin}_${safeKey}`
}

function readRaw(storageKey: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null
  } catch {
    return null
  }
}

export function getPluginPref<T extends string | boolean>(
  pluginId: string,
  key: string,
  fallback: T,
  allowedValues?: ReadonlyArray<string>,
): T {
  const raw = readRaw(pluginPrefStorageKey(pluginId, key))
  if (raw === null) return fallback
  if (typeof fallback === 'boolean') {
    return (raw === 'true') as T
  }
  if (allowedValues && !allowedValues.includes(raw)) return fallback
  return raw as T
}

export function setPluginPref(
  pluginId: string,
  key: string,
  value: string | boolean,
): void {
  const storageKey = pluginPrefStorageKey(pluginId, key)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, String(value))
    }
  } catch {
    return
  }
  const set = listeners.get(storageKey)
  if (set) {
    for (const fn of set) fn(value)
  }
}

export function subscribePluginPref(
  pluginId: string,
  key: string,
  listener: Listener,
): () => void {
  const storageKey = pluginPrefStorageKey(pluginId, key)
  let set = listeners.get(storageKey)
  if (!set) {
    set = new Set()
    listeners.set(storageKey, set)
  }
  set.add(listener)
  return () => {
    set?.delete(listener)
    if (set && set.size === 0) listeners.delete(storageKey)
  }
}

export function usePluginPref<T extends string | boolean>(
  pluginId: string,
  key: string,
  fallback: T,
  allowedValues?: ReadonlyArray<string>,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => getPluginPref(pluginId, key, fallback, allowedValues))

  useEffect(() => {
    setValue(getPluginPref(pluginId, key, fallback, allowedValues))
    return subscribePluginPref(pluginId, key, (next) => {
      setValue(next as T)
    })
  }, [pluginId, key, fallback])

  const update = useCallback((next: T) => {
    setPluginPref(pluginId, key, next)
    setValue(next)
  }, [pluginId, key])

  return [value, update]
}
