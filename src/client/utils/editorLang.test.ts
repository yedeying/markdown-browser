import { test, expect } from 'bun:test'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { EDITOR_LANGUAGES, getLangExtension } from './editorLang.ts'
import { getEditorLang } from './fileType.ts'

// 每种语言给一段多行样本：这类错配（把工厂函数当解析器）只有在真正解析
// 首行时才会炸，光构造 extension 是发现不了的。
const SAMPLES: Record<string, string> = {
  markdown: '# 标题\n\n正文\n',
  javascript: 'const a = 1\nfunction f() { return a }\n',
  typescript: 'const a: number = 1\nfunction f(): number { return a }\n',
  css: '.a { color: red; }\n.b { margin: 0; }\n',
  html: '<div class="a">hi</div>\n<span>x</span>\n',
  json: '{\n  "a": 1\n}\n',
  shell: '#!/bin/sh\necho hi\n',
  yaml: 'a: 1\nb:\n  - c\n',
  python: 'def f():\n    return 1\n',
  go: 'package main\n\nfunc main() {}\n',
  rust: 'fn main() {\n    let a = 1;\n}\n',
  sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT);\nSELECT * FROM t;\n',
  toml: '[a]\nb = 1\n',
  dockerfile: 'FROM alpine\nRUN echo hi\n',
  ruby: 'def f\n  1\nend\n',
  perl: 'print "hi";\n',
  cmake: 'cmake_minimum_required(VERSION 3.10)\nproject(demo)\n',
  properties: 'foo=bar\nbaz=qux\n',
  powershell: 'Write-Host "hi"\n',
  plaintext: 'just text\nsecond line\n',
}

/** 构造 state 并强制解析全文；语言配错时这里会抛 */
function parseWith(language: string | undefined, doc: string) {
  const state = EditorState.create({ doc, extensions: [getLangExtension(language)] })
  ensureSyntaxTree(state, doc.length, 5000)
}

test.each(EDITOR_LANGUAGES)('%s highlighting parses without throwing', (language) => {
  const doc = SAMPLES[language]
  expect(doc).toBeString()
  expect(() => parseWith(language, doc)).not.toThrow()
})

test('an undefined language falls back to markdown and still parses', () => {
  expect(() => parseWith(undefined, SAMPLES.markdown)).not.toThrow()
})

test('every extension getEditorLang maps to has a working highlighter', () => {
  // getEditorLang 是唯一给 Editor 传 language 的地方；它能产出的取值
  // 必须都在 EDITOR_LANGUAGES 里，否则新增扩展名会绕过上面的用例
  const produced = new Set(
    ['a.js', 'a.jsx', 'a.ts', 'a.tsx', 'a.css', 'a.html', 'a.htm', 'a.vue', 'a.svelte',
      'a.json', 'a.sh', 'a.bash', 'a.zsh', 'a.yaml', 'a.yml', 'a.py', 'a.go', 'a.rs',
      'a.sql', 'a.toml', 'a.ini', 'a.md', 'a.unknownext', 'a.rb', 'a.dockerfile',
      'Dockerfile', 'Makefile', 'Gemfile', 'CMakeLists.txt', '.editorconfig']
      .map((p) => getEditorLang(p)),
  )
  for (const language of produced) {
    expect(EDITOR_LANGUAGES).toContain(language)
  }
})
