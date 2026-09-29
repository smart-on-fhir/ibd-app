import { Fragment, type ReactNode } from 'react'


type Block =
    | { type: 'heading'  , text: string }
    | { type: 'list'     , ordered: boolean, start: number, items: string[] }
    | { type: 'paragraph', lines: string[] }

const HEADING = /^#{1,6}[ \t]+(.*?)[ \t#]*$/
const BULLET  = /^[ \t]*[-+][ \t]+(.*)$/
const NUMBER  = /^[ \t]*(\d+)[.)][ \t]+(.*)$/

/**
 * Splits a note into headings, lists and paragraphs — the line-level half of
 * Markdown, and deliberately nothing more.
 *
 * Inline syntax is left as text. Clinical notes use `*` to flag an abnormal
 * result (`HbA1c 7.2*`) and `_` inside identifiers, and emphasis rules would
 * swallow the one or italicise half a line for the other. Line-start markers
 * carry no such risk: prose rarely begins a line with `# ` or `- `.
 *
 * Flat by design: no nested lists, no lazy continuation — a line that is not a
 * marker starts or extends a paragraph.
 */
function parseBlocks(text: string): Block[] {
    const blocks: Block[] = []
    let current: Block | null = null

    for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
        if (!line.trim()) {
            current = null
            continue
        }

        const heading = HEADING.exec(line)
        if (heading) {
            blocks.push({ type: 'heading', text: heading[1] })
            current = null
            continue
        }

        const bullet = BULLET.exec(line)
        const number = bullet ? null : NUMBER.exec(line)

        if (bullet || number) {
            const ordered = !!number
            const item    = bullet ? bullet[1] : number![2]

            if (current?.type === 'list' && current.ordered === ordered) {
                current.items.push(item)
            } else {
                current = { type: 'list', ordered, start: number ? Number(number[1]) : 1, items: [item] }
                blocks.push(current)
            }
            continue
        }

        if (current?.type === 'paragraph') {
            current.lines.push(line.trim())
        } else {
            current = { type: 'paragraph', lines: [line.trim()] }
            blocks.push(current)
        }
    }

    return blocks
}

function renderBlock(block: Block, key: number): ReactNode {
    switch (block.type) {
        // One heading level for all: the notes this is for mix `#` and `##`
        // with no consistent hierarchy, so the level carries no meaning.
        case 'heading':
            return <h4 key={key}>{block.text}</h4>

        case 'list':
            return block.ordered
                ? <ol key={key} start={block.start}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ol>
                : <ul key={key}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>

        case 'paragraph':
            return (
                <p key={key}>
                    {block.lines.map((line, i) => <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>)}
                </p>
            )
    }
}

/**
 * A note's body: as formatted text when it is Markdown, as-is otherwise, with
 * its line breaks kept either way.
 *
 * Renders React elements, never HTML, so nothing in a note can become markup.
 * Styled by `.note-markdown` in globals.css — plain CSS rather than utility
 * classes, since this renders inside library panels whose reset would override
 * layered utilities.
 */
export function NoteText({ text, markdown }: { text: string, markdown: boolean }) {
    if (!markdown) {
        return <div className='text-slate-600' style={{ whiteSpace: 'pre-wrap' }}>{text.replace(/(\r?\n){2,}/g, '\n\n').trim()}</div>
    }

    return <div className="note-markdown text-slate-600">{parseBlocks(text).map(renderBlock)}</div>
}
