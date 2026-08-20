import { useEffect, useRef, useCallback } from 'preact/hooks'
import type { FunctionalComponent, Ref } from 'preact'
import { forwardRef, useImperativeHandle } from 'preact/compat'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history, selectAll } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection } from '@codemirror/view'
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import prettier from 'prettier'
import prettierMarkdown from 'prettier/plugins/markdown'
import { getLangExtension } from '../utils/editorLang.js'

interface Props {
  value: string
  onChange?: (value: string) => void
  theme: 'dark' | 'light'
  readOnly?: boolean
  language?: string  // 'markdown' | 'javascript' | 'typescript' | 'css' | 'html' | 'json' | 'plaintext'
}

export interface EditorHandle {
  selectAll: () => void
  getScrollDOM: () => HTMLElement | null
  getSelection: () => string
}

const Editor = forwardRef<EditorHandle, Props>(({ value, onChange, theme, readOnly, language }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useImperativeHandle(ref, () => ({
    selectAll: () => {
      const view = viewRef.current
      if (!view) return
      selectAll(view)
      view.focus()
    },
    getScrollDOM: () => viewRef.current?.scrollDOM ?? null,
    getSelection: () => {
      const view = viewRef.current
      if (!view) return ''
      const { state } = view
      const sel = state.selection.main
      if (sel.empty) return ''
      return state.sliceDoc(sel.from, sel.to)
    },
  }))

  const isMarkdown = !language || language === 'markdown'

  const formatWithPrettier = useCallback(async (view: EditorView) => {
    if (readOnly || !isMarkdown) return
    try {
      const current = view.state.doc.toString()
      const formatted = await prettier.format(current, {
        parser: 'markdown',
        plugins: [prettierMarkdown],
        proseWrap: 'preserve',
        tabWidth: 2,
      })
      const result = formatted.replace(/\n$/, '')
      if (result !== current) {
        const cursor = view.state.selection.main.head
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: result },
          selection: { anchor: Math.min(cursor, result.length) }
        })
        onChange?.(result)
      }
    } catch {
      // prettier format failed, ignore
    }
  }, [onChange, readOnly, isMarkdown])

  useEffect(() => {
    if (!containerRef.current) return

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      drawSelection(),
      history(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      getLangExtension(language),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.theme({
        '.cm-content, .cm-gutters': {
          fontSize: 'var(--editor-font-size)',
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange?.(update.state.doc.toString())
        }
      }),
      EditorView.domEventHandlers({
        blur: (_event, view) => {
          formatWithPrettier(view)
        }
      }),
      EditorState.readOnly.of(readOnly ?? false),
    ]

    if (theme === 'dark') {
      extensions.push(oneDark)
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [theme, language]) // theme 或 language 变化时重建编辑器

  // value 变化时更新内容（切换文件）
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value }
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      class="cm-host"
    />
  )
}) as (props: Props & { ref?: Ref<EditorHandle> }) => JSX.Element

export default Editor
