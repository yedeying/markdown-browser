import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getFileType, getEditorLang, isEditable, isBinaryContent, isJsonlPath } from './fileType.ts'

test('unknown extension maps to text for plaintext editor routing', () => {
  expect(getFileType('notes.xyz')).toBe('text')
  expect(getFileType('data.jsonl')).toBe('text')
  expect(getFileType('archive.tar.gz')).toBe('text')
})

test('known file types are unchanged', () => {
  expect(getFileType('readme.md')).toBe('markdown')
  expect(getFileType('app.js')).toBe('code')
  expect(getFileType('log.txt')).toBe('text')
  expect(getFileType('photo.png')).toBe('image')
  expect(getFileType('clip.mp4')).toBe('video')
})

test('known extensionless names get syntax highlighting langs', () => {
  expect(getFileType('Dockerfile')).toBe('code')
  expect(getFileType('Makefile')).toBe('code')
  expect(getFileType('LICENSE')).toBe('text')
  expect(getEditorLang('Dockerfile')).toBe('dockerfile')
  expect(getEditorLang('dockerfile')).toBe('dockerfile')
  expect(getEditorLang('Dockerfile.prod')).toBe('dockerfile')
  expect(getEditorLang('Containerfile')).toBe('dockerfile')
  expect(getEditorLang('Makefile')).toBe('shell')
  expect(getEditorLang('GNUmakefile')).toBe('shell')
  expect(getEditorLang('Gemfile')).toBe('ruby')
  expect(getEditorLang('CMakeLists.txt')).toBe('cmake')
  expect(getEditorLang('go.mod')).toBe('go')
  expect(getEditorLang('.gitignore')).toBe('shell')
  expect(getEditorLang('.env.local')).toBe('shell')
  expect(isEditable('Dockerfile')).toBe(true)
})

test('shebang content selects highlighter for extensionless / unknown files', () => {
  expect(getEditorLang('run', '#!/usr/bin/env bash\necho hi\n')).toBe('shell')
  expect(getEditorLang('run', '#!/bin/sh\necho hi\n')).toBe('shell')
  expect(getEditorLang('tool', '#!/usr/bin/env python3\nprint(1)\n')).toBe('python')
  expect(getEditorLang('tool', '#!/usr/bin/env node\nconsole.log(1)\n')).toBe('javascript')
  expect(getEditorLang('tool', '#!/usr/bin/env ruby\nputs 1\n')).toBe('ruby')
  expect(getEditorLang('x.unknown', '#!/usr/bin/env perl\nprint 1\n')).toBe('perl')
  // 已知扩展名优先于 shebang
  expect(getEditorLang('a.py', '#!/bin/bash\necho no\n')).toBe('python')
  // 无 shebang 仍 plaintext
  expect(getEditorLang('LICENSE', 'MIT License\n')).toBe('plaintext')
})

test('extension is derived from basename only, not directory segments', () => {
  expect(getFileType('dir.with.dot/Makefile')).toBe('code')
  expect(getFileType('dir.with.dot/readme.md')).toBe('markdown')
  expect(getFileType('nested/path/app.js')).toBe('code')
  expect(getEditorLang('dir.with.dot/Makefile')).toBe('shell')
  expect(getEditorLang('nested/path/app.ts')).toBe('typescript')
})

test('isEditable is true for unknown extensions', () => {
  expect(isEditable('config.customext')).toBe(true)
})

test('.jsonl is editable text with JSON editor highlighting', () => {
  expect(getFileType('chat.jsonl')).toBe('text')
  expect(isEditable('chat.jsonl')).toBe(true)
  expect(getEditorLang('chat.jsonl')).toBe('json')
})

test('isJsonlPath centralizes .jsonl detection: case-insensitive, nested paths, null/undefined-safe', () => {
  expect(isJsonlPath('chat.jsonl')).toBe(true)
  expect(isJsonlPath('nested/dir/chat.JSONL')).toBe(true)
  expect(isJsonlPath('readme.md')).toBe(false)
  expect(isJsonlPath('dir.jsonl/readme.md')).toBe(false)
  expect(isJsonlPath(null)).toBe(false)
  expect(isJsonlPath(undefined)).toBe(false)
  expect(isJsonlPath('')).toBe(false)
})

test('C/C++ and common aliases map to editor highlighters', () => {
  expect(getFileType('main.c')).toBe('code')
  expect(getFileType('main.cc')).toBe('code')
  expect(getFileType('main.cpp')).toBe('code')
  expect(getEditorLang('main.c')).toBe('c')
  expect(getEditorLang('main.h')).toBe('c')
  expect(getEditorLang('main.cpp')).toBe('cpp')
  expect(getEditorLang('main.cc')).toBe('cpp')
  expect(getEditorLang('main.cxx')).toBe('cpp')
  expect(getEditorLang('main.hpp')).toBe('cpp')
  expect(getEditorLang('App.m')).toBe('objectivec')
  expect(getEditorLang('App.mm')).toBe('objectivecpp')
  expect(getEditorLang('Main.java')).toBe('java')
  expect(getEditorLang('Program.cs')).toBe('csharp')
  expect(getEditorLang('a.kt')).toBe('kotlin')
  expect(getEditorLang('a.ini')).toBe('properties')
  expect(getEditorLang('a.scss')).toBe('sass')
})

test('code-only-view layout allows scrolling', () => {
  const css = readFileSync(join(import.meta.dir, '../styles/layout.css'), 'utf8')
  const block = css.match(/\.code-only-view\s*\{[^}]+\}/)?.[0] ?? ''
  const nested = css.match(/\.code-only-view \.editor-wrapper\s*\{[^}]+\}/)?.[0] ?? ''
  expect(block).toContain('overflow: auto')
  expect(block).toContain('min-height: 0')
  expect(nested).toContain('overflow: auto')
  expect(nested).toContain('min-height: 0')
})
