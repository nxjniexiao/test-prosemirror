import { InputRule, mergeAttributes, Node } from '@tiptap/core';
import { replaceNodeRule } from './input-rule';
import { inputRules } from 'prosemirror-inputrules';
import { NodeViewRendererProps } from '@tiptap/core';
import { InlineMathView } from './math-view';
import { GetPos } from './types';

export const InlineMath = Node.create({
  name: 'inlineMath',

  group: 'inline',

  content: 'text*',

  inline: true,

  atom: true,

  parseHTML() {
    return [{ tag: 'math[inline]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['math', { inline: '' }, 0];
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\$([^$]*)\$$/,
        handler: ({ state, range, match }) => {
          const { tr, schema } = state;
          const start = range.from;
          let end = range.to;
          let content;
          if (match[1]) {
            // "$1.00 and $"
            // "$1.00 and ($"
            if (/^\d/.test(match[1]) || /(\s|\()$/.test(match[1])) {
              return;
            }
            content = schema.text(match[1]);
          }
          tr.replaceWith(start, end, this.type.create({}, content));
        },
      }),
    ];
  },

  addNodeView() {
    return (props: NodeViewRendererProps) => {
      return InlineMathView(
        props.node,
        props.editor.view,
        props.getPos as GetPos
      );
    };
  },
});
