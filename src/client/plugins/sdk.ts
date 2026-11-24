import { h, Fragment } from 'preact'
import { useState, useEffect, useMemo, useRef, useCallback } from 'preact/hooks'
import Icon from '../components/ui/Icon.js'
import { showToast } from '../components/ui/Toast.js'
import JsonlLinePreview from '../components/JsonlLinePreview.js'
import { assetUrl, siteUrl, apiFetch } from '../utils/fsApi.js'
import { getPluginPref, setPluginPref, usePluginPref } from './prefs.js'
import { setPluginJump, peekPluginJump, takePluginJump } from './jumpStore.js'
import { pluginRegistry } from './registry.js'
import type { VmdPlugin } from './types.js'

export interface VmdSdk {
  preact: { h: typeof h; Fragment: typeof Fragment }
  hooks: {
    useState: typeof useState
    useEffect: typeof useEffect
    useMemo: typeof useMemo
    useRef: typeof useRef
    useCallback: typeof useCallback
  }
  ui: {
    Icon: typeof Icon
    showToast: typeof showToast
    JsonlLinePreview: typeof JsonlLinePreview
  }
  prefs: {
    getPluginPref: typeof getPluginPref
    setPluginPref: typeof setPluginPref
    usePluginPref: typeof usePluginPref
  }
  jump: {
    setPluginJump: typeof setPluginJump
    peekPluginJump: typeof peekPluginJump
    takePluginJump: typeof takePluginJump
  }
  api: {
    assetUrl: typeof assetUrl
    siteUrl: typeof siteUrl
    apiFetch: typeof apiFetch
  }
  registerPlugin: (plugin: VmdPlugin<any>) => void
}

/** 在全局挂载共享 SDK，供外部动态加载的 ESM 插件复用宿主的 Preact 实例与基础能力。 */
export function installPluginSdk(): VmdSdk {
  const sdk: VmdSdk = {
    preact: { h, Fragment },
    hooks: { useState, useEffect, useMemo, useRef, useCallback },
    ui: { Icon, showToast, JsonlLinePreview },
    prefs: { getPluginPref, setPluginPref, usePluginPref },
    jump: { setPluginJump, peekPluginJump, takePluginJump },
    api: { assetUrl, siteUrl, apiFetch },
    registerPlugin: (plugin) => pluginRegistry.register(plugin),
  }
  ;(globalThis as unknown as { __VMD_SDK__?: VmdSdk }).__VMD_SDK__ = sdk
  return sdk
}
