// CodeMirror 6 editor for LaTeX: highlighting, line numbers, search (Ctrl+F),
// undo history, and a handle so the parent can insert snippets or jump to a line.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { basicSetup } from "codemirror"
import { StreamLanguage } from "@codemirror/language"
import { stex } from "@codemirror/legacy-modes/mode/stex"
import { EditorSelection, EditorState } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"

export interface LatexCodeHandle {
  /** Wraps the selection in before/after, or inserts both with the cursor between. */
  wrap: (before: string, after?: string) => void
  /** Inserts a full line below the cursor's line. */
  insertLine: (text: string) => void
  goToLine: (line: number) => void
  focus: () => void
}

interface Props {
  value: string
  onChange?: (v: string) => void
  onSave?: () => void
  /** Shows the source without letting it be edited (the saved copy beside the editor). */
  readOnly?: boolean
  label?: string
}

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "12.5px", background: "var(--surface)", color: "var(--label)" },
  ".cm-scroller": { fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace', lineHeight: "1.55" },
  ".cm-gutters": { background: "var(--surface-2)", color: "var(--label-2)", border: "none" },
  ".cm-activeLine": { background: "color-mix(in srgb, var(--accent-soft) 45%, transparent)" },
  ".cm-activeLineGutter": { background: "var(--accent-soft)" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--label)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { background: "color-mix(in srgb, var(--focus) 30%, transparent) !important" },
})

export const LatexCode = forwardRef<LatexCodeHandle, Props>(function LatexCode({ value, onChange, onSave, readOnly = false, label = "Código LaTeX" }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef({ onChange, onSave })
  latest.current = { onChange, onSave }

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          keymap.of([{ key: "Mod-s", preventDefault: true, run: () => { latest.current.onSave?.(); return true } }]),
          basicSetup,
          StreamLanguage.define(stex),
          EditorView.lineWrapping,
          theme,
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((u) => { if (u.docChanged) latest.current.onChange?.(u.state.doc.toString()) }),
        ],
      }),
    })
    view.current = v
    return () => v.destroy()
  }, [])

  // Replace the document when the parent loads another file.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  useImperativeHandle(ref, () => ({
    wrap(before, after = "") {
      const v = view.current!
      v.dispatch(v.state.changeByRange((r) => ({
        changes: [{ from: r.from, insert: before }, { from: r.to, insert: after }],
        range: r.empty ? EditorSelection.cursor(r.from + before.length) : EditorSelection.range(r.from + before.length, r.to + before.length),
      })))
      v.focus()
    },
    insertLine(text) {
      const v = view.current!
      const line = v.state.doc.lineAt(v.state.selection.main.head)
      v.dispatch({ changes: { from: line.to, insert: "\n" + text }, selection: { anchor: line.to + 1 + text.length } })
      v.focus()
    },
    goToLine(n) {
      const v = view.current!
      const line = v.state.doc.line(Math.max(1, Math.min(n, v.state.doc.lines)))
      v.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) })
      v.focus()
    },
    focus: () => view.current?.focus(),
  }), [])

  return <div ref={host} className="tex" />
})
