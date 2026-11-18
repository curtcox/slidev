import type { Component } from 'vue'
import { getIconData } from '@iconify/utils/lib/icon-set/get-icon'
import { iconToSVG } from '@iconify/utils/lib/svg/build'
import { replaceIDs } from '@iconify/utils/lib/svg/id'
import { defineComponent, h } from 'vue'
import collections from './icon-collections.json'

const pending = new Map<string, Promise<Parameters<typeof getIconData>[0]>>()
const MAX_BYTES = 12 * 1024 * 1024

export function parseIconName(name: string) {
  const prefix = collections.find(prefix => name.startsWith(`${prefix}-`) || name.startsWith(`${prefix}:`))
  if (prefix) {
    return {
      prefix,
      name: name.slice(prefix.length + 1),
    }
  }
  const colon = name.match(/^([a-z0-9-]+):([a-z0-9-]+)$/)
  return colon
    ? { prefix: colon[1], name: colon[2] }
    : undefined
}

function loadCollection(prefix: string) {
  if (!pending.has(prefix)) {
    const request = (async () => {
      // Fetch goes through the SDK's parent proxy and verified offline cache.
      // Never derive a URL from an unrecognized author-provided collection.
      const response = await fetch(`runtime/icons/${prefix}.json`, {
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok)
        throw new Error('Bundled icon data is unavailable')
      const bytes = await response.arrayBuffer()
      if (bytes.byteLength > MAX_BYTES)
        throw new Error('Icon collection exceeds its size limit')
      const data = JSON.parse(new TextDecoder().decode(bytes))
      if (data.prefix !== prefix || !data.icons || typeof data.icons !== 'object')
        throw new Error('Invalid bundled icon collection')
      return data
    })()
    pending.set(prefix, request)
    request.catch(() => pending.delete(prefix))
  }
  return pending.get(prefix)!
}

export async function resolveIcon(name: string): Promise<{ component: Component, warning?: string } | undefined> {
  const icon = parseIconName(name)
  if (!icon)
    return
  let warning: string | undefined
  try {
    if (!collections.includes(icon.prefix))
      throw new Error('Collection is not bundled')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(icon.name))
      throw new Error('Invalid icon name')
    const data = getIconData(await loadCollection(icon.prefix), icon.name)
    if (!data)
      throw new Error('Icon does not exist in the bundled collection')
    const svg = iconToSVG(data, { height: '1.2em' })
    return {
      component: defineComponent({
        name: 'OnlineIcon',
        setup() {
          // Gradients, masks and animation references need per-instance IDs.
          const body = replaceIDs(svg.body)
          return () => h('svg', {
            ...svg.attributes,
            'class': 'slidev-icon',
            'aria-hidden': 'true',
            'data-online-icon': `${icon.prefix}:${icon.name}`,
            'innerHTML': body,
          })
        },
      }),
    }
  }
  catch (error) {
    warning = `Icon ${name.slice(0, 150)} is unavailable online: ${String(error).slice(0, 200)}`
  }
  return {
    warning,
    component: defineComponent({
      setup: () => () => h('span', {
        'class': 'online-icon-missing',
        'role': 'img',
        'aria-label': `Missing icon ${name}`,
        'title': warning,
      }, '□'),
    }),
  }
}
