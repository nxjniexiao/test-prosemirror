import { useState, useEffect, useCallback } from 'react';
import { EditorContent, JSONContent, useEditor } from '@tiptap/react';
import { Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { InlineMath } from './math';
import './App.css';
import { Heading } from './heading/heading';

const App = () => {
  const [json, setJson] = useState(null);
  const editor = useEditor({
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '12',
            },
            {
              type: 'inlineMath',
              content: [
                {
                  type: 'text',
                  text: 'a=b',
                },
              ],
            },
            {
              type: 'text',
              text: '34',
            },
          ],
        },
      ],
    },
    extensions: [
      Extension.create({
        name: 'test',
        // priority: 1000,
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              return true;
            },
            // 'Shift-Enter': () => {
            //   return false
            // }
          };
        },
      }),
      StarterKit.configure({ heading: false }),
      InlineMath,
      Heading,
    ],
    onSelectionUpdate: (prop) => {
      console.log('========> onSelectionUpdate: ', prop);
    },
    onTransaction: (prop) => {
      console.log('========> onTransaction: ', prop);
    },
  });

  useEffect(() => {
    if (!editor) {
      return undefined;
    }

    // Get the initial content …
    setJson(editor.getJSON());

    // … and get the content after every change.
    editor.on('update', () => {
      setJson(editor.getJSON());
    });
  }, [editor]);

  const setContent = useCallback(() => {
    // You can pass a JSON document to the editor.
    editor.commands.setContent(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'It’s 19871. You can’t turn on a radio, or go to a mall without hearing Olivia Newton-John’s hit song, Physical.',
              },
            ],
          },
        ],
      },
      true
    );

    // It’s likely that you’d like to focus the Editor after most commands.
    editor.commands.focus();
  }, [editor]);

  const clearContent = useCallback(() => {
    editor.chain().clearContent(true).focus().run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <>
      <div className="actions">
        <button className="button" onClick={setContent}>
          Set Content
        </button>
        <button className="button" onClick={clearContent}>
          Clear Content
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'is-active' : ''}
        >
          Bold
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'is-active' : ''}
        >
          Italic
        </button>
      </div>

      <EditorContent editor={editor} />

      <div className="export">
        <h3>JSON</h3>
        <pre>
          <code>{JSON.stringify(json, null, 2)}</code>
        </pre>
      </div>
    </>
  );
};

export default App;
