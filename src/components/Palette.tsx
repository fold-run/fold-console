// Jump to a route, an upstream, or one tool in the catalog.
//
// The console already filters well: /upstreams and /catalog both keep their
// query in the URL, and both are instant because the whole federation arrives
// in one snapshot. What neither can do is get you there from somewhere else.
// Success here is defined as an answer in under thirty seconds, and "go to the
// broken upstream from wherever you are" is the shortest version of that.
//
// It only navigates. There is no write API to reach and nothing here mutates,
// so the palette is a faster way to reach a page rather than a second way to
// do anything.
//
// Two details are constraints rather than taste:
//
//   - The shipped font subset is latin plus U+2190-2193. No command glyph, no
//     return arrow — those would come from whatever the machine fell back to,
//     which is the exact defect docs/design.md records about arrows. The hints
//     use words and the arrows that are actually in the file.
//   - The trigger lives after the skip link in DOM order, because the skip
//     link is asserted to be the first tab stop.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { FederationState } from '@/lib/federation'
import type { Catalog, Mode } from '@/lib/mcp'

interface Item {
  group: string
  label: string
  hint?: string
  run: () => void
}

const ROUTES: Array<{ label: string; to: string }> = [
  { label: 'Overview', to: '/' },
  { label: 'Upstreams', to: '/upstreams' },
  { label: 'Catalog', to: '/catalog' },
  { label: 'Test console', to: '/test' },
]

export function Palette({
  state,
  catalog,
  onClose,
}: {
  state: FederationState | undefined
  catalog: Catalog | undefined
  onClose: () => void
}) {
  const navigate = useNavigate()
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const items = useMemo<Item[]>(() => {
    const all: Item[] = ROUTES.map((r) => ({
      group: 'Go to',
      label: r.label,
      run: () => void navigate({ to: r.to }),
    }))

    for (const u of state?.upstreams ?? []) {
      all.push({
        group: 'Upstreams',
        label: u.id,
        hint: u.connected ? undefined : 'not connected',
        run: () => void navigate({ to: '/upstreams/$id', params: { id: u.id } }),
      })
    }

    // The catalog is only populated once the operator has connected, so this
    // group is absent rather than empty before that.
    for (const mode of ['tools', 'prompts', 'resources'] as Mode[]) {
      for (const item of catalog?.[mode] ?? []) {
        const name = item.name ?? item.uri
        if (!name) continue
        all.push({
          group: 'Catalog',
          label: name,
          hint: mode.slice(0, -1),
          run: () => void navigate({ to: '/test', search: { mode, item: name } }),
        })
      }
    }

    return all
  }, [state, catalog, navigate])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items.slice(0, 50)
    return items.filter((i) => `${i.label} ${i.group}`.toLowerCase().includes(needle)).slice(0, 50)
  }, [items, query])

  const selected = Math.min(cursor, Math.max(matches.length - 1, 0))

  const run = (item: Item | undefined) => {
    if (!item) return
    onClose()
    item.run()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!matches.length) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setCursor((c) => (Math.min(c, matches.length - 1) + step + matches.length) % matches.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(matches[selected])
    }
  }

  const grouped: Array<{ name: string; items: Array<{ item: Item; index: number }> }> = []
  matches.forEach((item, index) => {
    const tail = grouped[grouped.length - 1]
    if (tail && tail.name === item.group) tail.items.push({ item, index })
    else grouped.push({ name: item.group, items: [{ item, index }] })
  })

  return (
    <dialog
      ref={dialog}
      class="palette"
      aria-label="Jump to"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close()
      }}
    >
      <div class="pal-input">
        <input
          value={query}
          placeholder="Search routes, upstreams, tools"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="pal-list"
          aria-activedescendant={matches.length ? `pal-${selected}` : undefined}
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value)
            setCursor(0)
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {matches.length === 0 ? (
        <p class="pal-empty" id="pal-list">
          Nothing matches that. Routes, upstream ids and catalog names are searched.
        </p>
      ) : (
        <ul class="pal-list" id="pal-list" role="listbox" aria-label="Results">
          {grouped.map((group) => (
            <li role="group" aria-label={group.name} key={group.name}>
              <p class="pal-group" aria-hidden="true">{group.name}</p>
              {group.items.map(({ item, index }) => (
                <div
                  key={`${group.name}:${item.label}`}
                  id={`pal-${index}`}
                  role="option"
                  class="pal-item"
                  aria-selected={index === selected}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => run(item)}
                >
                  <span class="pal-label">{item.label}</span>
                  {item.hint ? <span class="pal-hint">{item.hint}</span> : null}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      <p class="pal-foot">↑ ↓ to move, Enter to open, Esc to close</p>
    </dialog>
  )
}
