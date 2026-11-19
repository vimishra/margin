/// <reference types="vite/client" />

// ==Highlight== for markdown-it (no published types).
declare module 'markdown-it-mark' {
  const plugin: (md: unknown) => void
  export default plugin
}
