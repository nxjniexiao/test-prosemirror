import { InputRule } from 'prosemirror-inputrules'
import type { NodeType, MarkType, Node } from 'prosemirror-model'
import { NodeSelection, TextSelection } from 'prosemirror-state'

type GetAttrs =
  | {
      content?: Node
      [key: string]: any
    }
  | ((p: string[]) => { content?: Node; [key: string]: any })

export function replaceNodeRule(
  regExp: RegExp,
  nodeType: NodeType,
  getAttrs?: GetAttrs,
  select: boolean | ((p: string[]) => boolean) = false,
  test?: (p: string[]) => boolean
) {
  return new InputRule(regExp, (state, match, start, end) => {
    if (test && !test(match)) return null
    const { content, ...attrs } =
      (getAttrs instanceof Function ? getAttrs(match) : getAttrs) ?? {}
    const tr = state.tr
      .delete(start, end)
      .replaceSelectionWith(nodeType.create(attrs, content), false)
      .scrollIntoView()
    const doSelect = select instanceof Function ? select(match) : select
    if (!doSelect) return tr
    const nodeSize = tr.selection.$anchor.nodeBefore?.nodeSize ?? 0
    const resolvedPos = tr.doc.resolve(tr.selection.anchor - nodeSize)
    const selected = tr.setSelection(new NodeSelection(resolvedPos))
    return selected
  })
}
