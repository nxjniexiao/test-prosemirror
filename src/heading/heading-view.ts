import { Fragment, Node, Slice } from 'prosemirror-model';
import { EditorView, NodeView } from 'prosemirror-view';
import { StepMap } from 'prosemirror-transform';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import { chainCommands, deleteSelection } from 'prosemirror-commands';
import { GetPos, isMacOS } from './types';

import './heading.css';

export class CustomHeadingView implements NodeView {
  dom: HTMLElement;

  headingEditor: HTMLElement;

  headingContent: HTMLElement;

  // These are used when the footnote is selected
  innerView: EditorView;

  node: Node;

  outerView: EditorView;

  getPos: GetPos;

  constructor(node: Node, view: EditorView, getPos: GetPos) {
    this.node = node;
    this.outerView = view;
    this.getPos = getPos;
    const level = node.attrs.level;
    this.dom = document.createElement('div');
    this.headingEditor = document.createElement(`h${level}`);
    this.headingEditor.classList.add('heading-editor');
    this.headingContent = document.createElement(`h${level}`);
    this.headingContent.classList.add('heading-content');
    this.headingContent.addEventListener('click', () => this.selectNode());
    this.dom.appendChild(this.headingEditor);
    this.dom.appendChild(this.headingContent);

    this.addFakeCursor();
    this.dom.classList.add('heading');
    this.dom.classList.remove('editing');
    this.renderHeading();

    const unFocus = () => {
      this.dom.classList.remove('editing');
      this.outerView.focus();
      return true;
    };

    const mac = isMacOS();

    const doc = this.insertHashToNode();

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
        handleClick(view, pos, event) {
          console.log(`click on: ${pos}`);
          console.log(view.state.doc.resolve(pos));
        },
        handleDOMEvents: {
          blur: () => {
            this.deselectNode();
          },
          mousedown: () => {
            // Kludge to prevent issues due to the fact that the whole
            // footnote is node-selected (and thus DOM-selected) when
            // the parent editor is focused.
            if (this.outerView.hasFocus()) this.innerView.focus();
            return false;
          },
        },
      }
    );
  }

  update(node: Node) {
    if (!node.sameMarkup(this.node)) return false;
    this.node = node;
    this.addFakeCursor();
    if (this.innerView) {
      const { state } = this.innerView;
      const fixedNode = this.removeHashFromNode();
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
    this.renderHeading();
    return true;
  }

  dispatchInner(tr: Transaction) {
    const { state, transactions } = this.innerView.state.applyTransaction(tr);
    this.innerView.updateState(state);

    if (!tr.getMeta('fromOutside')) {
      const outerTr = this.outerView.state.tr;
      const offsetMap = StepMap.offset(this.getPos() - 1);
      for (let i = 0; i < transactions.length; i += 1) {
        const { steps } = transactions[i];
        for (let j = 0; j < steps.length; j += 1)
          outerTr.step(steps[j].map(offsetMap) as any);
      }
      if (outerTr.docChanged) {
        this.outerView.dispatch(outerTr);
      }
    }
  }

  renderHeading() {
    this.headingContent.innerHTML = this.node.textContent;
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
    this.dom.classList.add('ProseMirror-selectedNode');
    this.dom.classList.add('editing');
    // This is necessary on first insert.
    setTimeout(() => this.innerView.focus(), 1);
  }

  deselectNode() {
    this.dom.classList.remove('ProseMirror-selectedNode');
    this.dom.classList.remove('editing');
  }

  insertHashToNode() {
    const hashNode = this.outerView.state.schema.text('# ');
    const slice = new Slice(Fragment.fromArray([hashNode]), 0, 0);
    return this.node.replace(0, 0, slice);
  }

  removeHashFromNode() {
    return this.innerView.state.doc.replace(0, 2, Slice.empty);
  }
}
