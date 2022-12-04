import { Fragment, Node, Slice } from 'prosemirror-model';
import { EditorView, NodeView } from 'prosemirror-view';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import { chainCommands, deleteSelection } from 'prosemirror-commands';
import { GetPos, isMacOS } from './types';

import './heading.css';

const HEADING_EXP = /^(#+)\s/;

export class CustomHeadingView implements NodeView {
  dom: HTMLElement;

  headingEditor: HTMLElement;

  // These are used when the footnote is selected
  innerView: EditorView;

  node: Node;

  outerView: EditorView;

  getPos: GetPos;

  editing: boolean;

  // focus 内部编辑器时光标的修正值
  cursorOffset: number;

  constructor(node: Node, view: EditorView, getPos: GetPos) {
    this.node = node;
    this.outerView = view;
    this.getPos = getPos;
    const level = node.attrs.level;
    this.dom = document.createElement(`h${level}`);
    this.headingEditor = document.createElement(`span`);
    this.headingEditor.classList.add('heading-editor');
    this.dom.appendChild(this.headingEditor);

    this.addFakeCursor();
    this.dom.classList.add('heading');
    this.dom.classList.remove('editing');

    const unFocus = () => {
      this.dom.classList.remove('editing');
      this.outerView.focus();
      return true;
    };

    const mac = isMacOS();

    const doc = this.node;

    this.innerView = new EditorView(
      { mount: this.headingEditor },
      {
        state: EditorState.create({
          doc,
          plugins: [
            keymap({
              'Mod-a': () => {
                const { doc, tr } = this.innerView.state;
                const sel = TextSelection.create(
                  doc,
                  0,
                  this.node.nodeSize - 2
                );
                this.innerView.dispatch(tr.setSelection(sel));
                return true;
              },
              'Mod-z': () =>
                undo(this.outerView.state, this.outerView.dispatch),
              'Mod-Z': () =>
                redo(this.outerView.state, this.outerView.dispatch),
              ...(mac
                ? {}
                : {
                    'Mod-y': () =>
                      redo(this.outerView.state, this.outerView.dispatch),
                  }),
              Escape: unFocus,
              Tab: unFocus,
              'Shift-Tab': unFocus,
              Enter: unFocus,

              Backspace: chainCommands(deleteSelection, (state) => {
                // default backspace behavior for non-empty selections
                if (!state.selection.empty) {
                  return false;
                }
                // default backspace behavior when math node is non-empty
                if (this.node.textContent.length > 0) {
                  return false;
                }
                // otherwise, we want to delete the empty math node and focus the outer view
                this.outerView.dispatch(this.outerView.state.tr.insertText(''));
                this.outerView.focus();
                return true;
              }),
            }),
          ],
        }),

        dispatchTransaction: this.dispatchInner.bind(this),
        handleClick: (view, pos, event) => {
          console.log(`click on: ${pos}`);
          console.log(view.state.doc.resolve(pos));
          if (this.cursorOffset) {
            let tr = view.state.tr;
            let newSelection;
            try {
              const anchor = view.state.doc.resolve(pos + this.cursorOffset);
              newSelection = TextSelection.near(anchor, -1);
            } catch (err) {
              newSelection = TextSelection.atEnd(view.state.doc);
            }
            tr = tr.setSelection(newSelection);
            this.cursorOffset = 0;
            view.dispatch(tr);
          }
        },
        handleDOMEvents: {
          click: (view, event) => {
            console.log('================== click', view, event);
          },
          focus: (view, event) => {
            console.log('================== focus', view, event);
            this.selectNode();
            // 内部编辑器中插入 #
            this.insertHash();
          },
          blur: () => {
            this.deselectNode();
            // 处理 h1-h6/p 之间的转换
            this.dispatchTypeChangeIfPossible();
            // 移除内部编辑器中的 #
            this.removeHash();
          },
          // mousedown: () => {
          //   // Kludge to prevent issues due to the fact that the whole
          //   // footnote is node-selected (and thus DOM-selected) when
          //   // the parent editor is focused.
          //   if (this.outerView.hasFocus()) this.innerView.focus();
          //   return false;
          // },
        },
      }
    );
  }

  // true: 需要被更新; false: 不需要被更新
  update(node: Node) {
    if (!this.editing && !node.sameMarkup(this.node)) return false;
    this.node = node;
    this.addFakeCursor();
    if (this.innerView) {
      const { state } = this.innerView;
      let fixedNode = node;
      let level = this.getLevelFromContent(fixedNode.textContent);
      if (level) fixedNode = node.replace(0, level + 1, Slice.empty);
      const start = node.content.findDiffStart(fixedNode.content);
      if (start != null) {
        const ends = node.content.findDiffEnd(state.doc.content as any);
        let { a: endA, b: endB } = ends ?? { a: 0, b: 0 };
        const overlap = start - Math.min(endA, endB);
        if (overlap > 0) {
          endA += overlap;
          endB += overlap;
        }
        this.innerView.dispatch(
          state.tr
            .replace(start, endB, node.slice(start, endA))
            .setMeta('fromOutside', true)
        );
      }
    }
    return true;
  }

  dispatchInner(tr: Transaction) {
    const prevState = this.innerView.state;
    const { state, transactions } = this.innerView.state.applyTransaction(tr);
    this.innerView.updateState(state);

    if (!tr.getMeta('fromOutside')) {
      // 根据内部编辑器 node 和外部编辑中 node 的差异生成 transaction
      const outerTr = this.outerView.state.tr;
      let innerNode = state.doc;
      const prevLevel = this.getLevelFromContent(prevState.doc.textContent);
      const level = this.getLevelFromContent(state.doc.textContent);
      // 移除内部编辑中 node 的 # 前缀
      if (level != null) {
        innerNode = this.innerView.state.doc.replace(0, level + 1, Slice.empty);
      }
      // 计算内部和外部 node 不同的位置
      const start = this.node.content.findDiffStart(innerNode.content);
      if (start != null) {
        const ends = this.node.content.findDiffEnd(innerNode.content);
        let { a: endA, b: endB } = ends ?? { a: 0, b: 0 };
        const overlap = start - Math.min(endA, endB);
        // 重叠部分，如： string => strString
        if (overlap > 0) {
          endA += overlap;
          endB += overlap;
        }
        const pos = this.getPos() + 1;
        outerTr.replace(pos + start, pos + endA, innerNode.slice(start, endB));
      }
      if (outerTr.docChanged) {
        this.outerView.dispatch(outerTr);
      }
      if (level !== prevLevel) {
        this.dom.classList.remove(`level-${prevLevel || 'paragraph'}`);
        this.dom.classList.add(`level-${level || 'paragraph'}`);
      }
    }
  }

  destroy() {
    this.innerView.destroy();
    this.dom.textContent = '';
  }

  stopEvent(event: any): boolean {
    return (
      (this.innerView && this.innerView.dom.contains(event.target)) ?? false
    );
  }

  ignoreMutation() {
    return true;
  }

  addFakeCursor() {
    const hasContent = this.node.textContent.length > 0;
    this.headingEditor.classList[hasContent ? 'remove' : 'add']('empty');
  }

  selectNode() {
    this.editing = true;
    this.dom.classList.add('ProseMirror-selectedNode');
    this.dom.classList.add('editing');
    // This is necessary on first insert.
    // setTimeout(() => this.innerView.focus(), 1);
  }

  deselectNode() {
    this.editing = false;
    this.dom.classList.remove('ProseMirror-selectedNode');
    this.dom.classList.remove('editing');
    const className = this.dom.className;
    const match = /(level-(?:h[1-6]|paragraph))/.exec(className);
    if (match?.[1]) this.dom.classList.remove(match[1]);
  }

  insertHash() {
    let text = ' ';
    let level = this.node.attrs.level;
    this.cursorOffset = level + 1;
    for (let i = 0; i < level; i++) {
      text = '#' + text;
    }
    let tr = this.innerView.state.tr;
    tr = tr.insertText(text, 0, 0);
    this.innerView.dispatch(tr);
  }

  removeHash() {
    const level = this.getLevelFromInnerViewContent(true);
    if (level) {
      let tr = this.innerView.state.tr;
      tr = tr.replace(0, level + 1, Slice.empty);
      tr = tr.setMeta('fromOutside', true);
      this.innerView.dispatch(tr);
    }
  }

  getLevelFromInnerViewContent(withoutFix?: boolean) {
    const textContent = this.innerView.state.doc.textContent;
    return this.getLevelFromContent(textContent, withoutFix);
  }

  getLevelFromContent(text: string, withoutFix?: boolean) {
    const match = HEADING_EXP.exec(text);
    if (match) {
      const matchedLevel = match[1].length;
      if (withoutFix) return matchedLevel;
      return Math.min(6, matchedLevel);
    }
  }

  dispatchTypeChangeIfPossible() {
    const level = this.getLevelFromInnerViewContent();
    if (level === this.node.attrs.level) return;
    const tr = this.outerView.state.tr;
    if (level == null) {
      // 转换成段落
      tr.setNodeMarkup(
        this.getPos(),
        this.outerView.state.schema.nodes.paragraph
      );
    } else if (level !== this.node.attrs.level) {
      // h1-h6 之间转换
      tr.setNodeAttribute(this.getPos(), 'level', level);
    }
    this.outerView.dispatch(tr);
  }
}
