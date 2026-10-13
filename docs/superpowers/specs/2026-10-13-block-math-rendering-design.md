# Block Math Rendering Design

## Problem

Markdown display math delimited by `$$ ... $$` fails when it spans lines. The
Markdown parser uses `breaks: true`, so it inserts `<br>` elements between the
delimiters and formula. KaTeX auto-render only matches delimiters within
contiguous text nodes and therefore leaves the formula unrendered.

## Scope

- Support display math written with standalone `$$ ... $$` delimiters.
- Support display math written with standalone `\[ ... \]` delimiters.
- Preserve existing `$ ... $` inline math behavior.
- Do not interpret math-like text inside fenced code blocks.
- Leave unclosed display-math delimiters as ordinary Markdown text.

## Design

Add a block extension to the isolated `Marked` instance in
`parseMarkdownPreview.ts`. The extension recognizes an opening delimiter on
its own line, consumes through the matching closing delimiter on its own line,
and emits an HTML container whose escaped text contains the delimiters and
formula without Markdown-generated `<br>` elements.

The existing KaTeX auto-render pass remains responsible for producing the
formula markup. Its delimiter configuration gains the `\[ ... \]` display
pair. KaTeX continues to use `throwOnError: false`, so invalid TeX remains
visible rather than breaking the preview.

The extension runs through Marked's block-token mechanism, ahead of paragraph
and line-break parsing. Fenced code continues to use Marked's existing code
tokenizer and must not be rewritten as math.

## Testing

Add regression coverage that:

1. Parses the reported multiline `$$` formula, including TeX commands and
   `< 0`, without inserting `<br>` inside the math block.
2. Covers multiline `\[ ... \]`.
3. Confirms inline `$ ... $` behavior is unchanged.
4. Confirms matching delimiters inside fenced code remain code.
5. Mounts the preview and verifies both display syntaxes produce KaTeX markup.

Run the focused tests, the full unit suite, and `bun run build`.
