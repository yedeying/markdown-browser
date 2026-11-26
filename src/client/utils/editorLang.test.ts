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
  jsx: 'export function App({ busy }) {\n  return <button className={`a ${busy ? "spin" : ""}`}>{/* tip */}<span>Go</span></button>\n}\n',
  typescript: 'const a: number = 1\nfunction f(): number { return a }\n',
  tsx: 'export function App({ busy }: { busy: boolean }) {\n  return <section className="grid">{/* comment */}<RefreshCw className={`w-3.5 ${busy ? "spin" : ""}`} /><span>Hi</span></section>\n}\n',
  css: '.a { color: red; }\n.b { margin: 0; }\n',
  html: '<div class="a">hi</div>\n<span>x</span>\n',
  vue: '<template>\n  <div :class="cls" @click="go">{{ msg }}</div>\n</template>\n<script setup lang="ts">\nconst msg: string = "hi"\n</script>\n<style scoped>\n.a { color: red; }\n</style>\n',
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
  c: 'int main(void) {\n  return 0;\n}\n',
  cpp: '#include <iostream>\nint main() {\n  return 0;\n}\n',
  java: 'class Main {\n  public static void main(String[] a) {}\n}\n',
  csharp: 'class Program {\n  static void Main() {}\n}\n',
  kotlin: 'fun main() {\n  println("hi")\n}\n',
  scala: 'object Main {\n  def main(args: Array[String]): Unit = {}\n}\n',
  objectivec: '#import <Foundation/Foundation.h>\nint main() { return 0; }\n',
  objectivecpp: '#include <iostream>\nint main() { return 0; }\n',
  dart: 'void main() {\n  print("hi");\n}\n',
  swift: 'print("hi")\n',
  lua: 'print("hi")\n',
  r: 'print("hi")\n',
  haskell: 'main = putStrLn "hi"\n',
  groovy: 'println "hi"\n',
  clojure: '(println "hi")\n',
  sass: '.a\n  color: red\n',
  plaintext: 'just text\nsecond line\n',
}

/** 构造 state 并强制解析全文；语言配错时这里会抛 */
function parseWith(language: string | undefined, doc: string) {
  const state = EditorState.create({ doc, extensions: [getLangExtension(language)] })
  return ensureSyntaxTree(state, doc.length, 5000)
}

test.each(EDITOR_LANGUAGES)('%s highlighting parses without throwing', (language) => {
  const doc = SAMPLES[language]
  expect(doc).toBeString()
  expect(() => parseWith(language, doc)).not.toThrow()
})

// 光"不抛错"不够：若 @codemirror/language 被加载了两份（例如 node_modules 里残留
// pnpm 的符号链接），语言扩展注册到另一份实例的 facet 上，ensureSyntaxTree 会静默
// 返回 null，编辑器表现为完全没有高亮。这里要求真正产出覆盖全文的语法树。
test.each(EDITOR_LANGUAGES.filter((l) => l !== 'plaintext'))('%s produces a complete syntax tree', (language) => {
  const doc = SAMPLES[language]
  const tree = parseWith(language, doc)
  expect(tree).not.toBeNull()
  expect(tree!.length).toBe(doc.length)
})

test('vue parses template bindings, interpolation and <script lang="ts">', () => {
  const tree = parseWith('vue', SAMPLES.vue)!
  const names = new Set<string>()
  tree.iterate({ enter: (n) => { names.add(n.name) } })
  expect(names).toContain('Interpolation')        // {{ msg }}
  expect(names).toContain('ScriptAttributeValue') // :class / @click 的 JS 表达式
  expect(names).toContain('TypeAnnotation')       // <script lang="ts"> 按 TS 解析
})

test('tsx parses JSX elements, template attributes and type annotations', () => {
  const tree = parseWith('tsx', SAMPLES.tsx)!
  const names = new Set<string>()
  tree.iterate({ enter: (n) => { names.add(n.name) } })
  expect(names).toContain('JSXElement')
  expect(names).toContain('JSXSelfClosingTag')
  expect(names).toContain('JSXAttribute')
  expect(names).toContain('JSXCloseTag')
  expect(names).toContain('TemplateString')
  expect(names).toContain('TypeAnnotation')
})

test('an undefined language falls back to markdown and still parses', () => {
  expect(() => parseWith(undefined, SAMPLES.markdown)).not.toThrow()
})

test('every extension getEditorLang maps to has a working highlighter', () => {
  // getEditorLang 是唯一给 Editor 传 language 的地方；它能产出的取值
  // 必须都在 EDITOR_LANGUAGES 里，否则新增扩展名会绕过上面的用例
  const produced = new Set(
    ['a.js', 'a.jsx', 'a.mjs', 'a.ts', 'a.tsx', 'a.css', 'a.scss', 'a.html', 'a.htm', 'a.vue', 'a.svelte',
      'a.json', 'a.sh', 'a.bash', 'a.zsh', 'a.ps1', 'a.yaml', 'a.yml', 'a.py', 'a.go', 'a.rs',
      'a.sql', 'a.toml', 'a.ini', 'a.conf', 'a.md', 'a.unknownext', 'a.rb', 'a.dockerfile',
      'a.c', 'a.h', 'a.cpp', 'a.cc', 'a.cxx', 'a.hpp', 'a.hh', 'a.m', 'a.mm',
      'a.java', 'a.cs', 'a.kt', 'a.kts', 'a.scala', 'a.swift', 'a.dart', 'a.lua', 'a.r',
      'a.hs', 'a.groovy', 'a.clj', 'a.php', 'a.xml',
      'Dockerfile', 'Makefile', 'Gemfile', 'CMakeLists.txt', '.editorconfig']
      .map((p) => getEditorLang(p)),
  )
  for (const language of produced) {
    expect(EDITOR_LANGUAGES).toContain(language)
  }
})
