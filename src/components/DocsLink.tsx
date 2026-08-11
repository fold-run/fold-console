import { docsLink, type DocTopic } from '@/lib/docs'

interface Props {
  topic: DocTopic
  version: string | undefined
  children: string
}

/**
 * A versioned link out to the docs, as a page action rather than a phrase
 * inside the lede.
 *
 * Inline it read badly and set badly: the sentence ended in a link whose text
 * ran past the lede's measure and orphaned its last word on a line of its own,
 * on every page. Out here it also fills the right side of the page header,
 * which was otherwise empty on the two read-only routes.
 */
export function DocsLink({ topic, version, children }: Props) {
  return (
    <a class="group-action" href={docsLink(topic, version)} rel="noopener">
      {children} →
    </a>
  )
}
