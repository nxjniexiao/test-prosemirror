import { mergeAttributes, Node } from '@tiptap/core'
import { replaceNodeRule } from './input-rule'
import { inputRules } from 'prosemirror-inputrules'
import { NodeViewRendererProps } from '@tiptap/core'
import { InlineMathView } from './math-view'
import { GetPos } from './types'

export const InlineMath = Node.create({
  name: 'inlineMath',

  group: 'inline',

  content: 'text*',

  inline: true,

  atom: true,

  parseHTML() {
    return [{ tag: 'math[inline]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['math', { inline: '' }, 0]
  },

  addProseMirrorPlugins() {
    const schema = this.editor.schema
    return [
      inputRules({
        rules: [
          replaceNodeRule(
            // $Ax=b$ or $$, only select if there is not content.
            /(\$([^$]*)\$)$/,
            schema.nodes.inlineMath,
            (match: string[]) => {
              if (match[2] === '') return {}
              return { content: schema.text(match[2]) }
            },
            (match: string[]) => match[2] === '',
            (match: string[]) => {
              // "$1.00 and $"
              // "$1.00 and ($"
              if (match[2].match(/^\d/) && match[2].match(/(\s|\()$/))
                return false
              return true
            }
          ),
        ],
      }),
    ]
  },

  addNodeView() {
    return (props: NodeViewRendererProps) => {
      return InlineMathView(
        props.node,
        props.editor.view,
        props.getPos as GetPos
      )
    }
  },
})
