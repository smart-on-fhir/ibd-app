import { useEffect, type RefObject } from 'react'
import { queryPattern }               from '../lib/search'

/** The `::highlight()` name the matches are painted under — see globals.css. */
const HIGHLIGHT_NAME = 'search-match'

/**
 * One highlight shared by every caller. The registry is keyed by name, so a
 * second `CSS.highlights.set()` would replace the first caller's matches;
 * adding and removing ranges on one shared set keeps them independent.
 */
let shared: Highlight | null = null

function sharedHighlight(): Highlight | null {
    if (!shared && typeof CSS !== 'undefined' && 'highlights' in CSS) {
        shared = new Highlight()
        CSS.highlights.set(HIGHLIGHT_NAME, shared)
    }
    return shared
}

/**
 * Highlights every match of `query` in the text rendered inside `ref`, however
 * that text got there — including components that know nothing about the
 * query, like the library's detail panels and source tree.
 *
 * Uses the CSS Custom Highlight API rather than wrapping matches in `<mark>`:
 * the text belongs to React, and splitting its nodes would break the next
 * render. Ranges are recomputed whenever the content changes, so a collapse
 * that opens later is highlighted too.
 *
 * A match that spans two text nodes is not found — JSX like `{a} {b}` renders
 * separate nodes — which in practice only affects multi-word terms, and a
 * query's terms are single words. Browsers without the API show no highlight.
 */
export function useTextHighlight(ref: RefObject<HTMLElement | null>, query?: string) {
    useEffect(() => {
        const root      = ref.current
        const highlight = sharedHighlight()
        const pattern   = query ? queryPattern(query, 'gi') : null

        if (!root || !highlight || !pattern) return

        let ranges: Range[] = []

        function clear() {
            ranges.forEach(range => highlight!.delete(range))
            ranges = []
        }

        function paint() {
            clear()

            const walker = document.createTreeWalker(root!, NodeFilter.SHOW_TEXT)

            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                for (const match of (node.nodeValue ?? '').matchAll(pattern!)) {
                    const range = new Range()
                    range.setStart(node, match.index)
                    range.setEnd(node, match.index + match[0].length)
                    highlight!.add(range)
                    ranges.push(range)
                }
            }
        }

        paint()

        // Painting does not touch the DOM, so this cannot trigger itself.
        const observer = new MutationObserver(paint)
        observer.observe(root, { subtree: true, childList: true, characterData: true })

        return () => {
            observer.disconnect()
            clear()
        }
    }, [ref, query])
}
