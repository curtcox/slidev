export const PRESENTER_CHANNEL = 'slidevonline:presenter'

const MAX_BYTES = 5 * 1024 * 1024
const encoder = new TextEncoder()

export function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map(n => String(n).padStart(2, '0')).join(':')
}

export function isValidSession(value) {
  return typeof value === 'string' && /^[a-z0-9-]{8,64}$/i.test(value)
}

function validPosition(slide, click, total) {
  if (!Number.isSafeInteger(slide) || slide < 1 || slide > 10000)
    return false
  if (!Number.isSafeInteger(click) || click < 0 || click > 1000000)
    return false
  if (total !== undefined && (!Number.isSafeInteger(total) || total < 0 || total > 10000))
    return false
  return true
}

export function parsePresenterMessage(raw, expectedSession) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null
  if (!isValidSession(expectedSession) || raw.session !== expectedSession)
    return null
  switch (raw.type) {
    case 'hello':
    case 'next':
    case 'prev':
      return { session: expectedSession, type: raw.type }
    case 'dark':
      if (typeof raw.dark !== 'boolean')
        return null
      return { session: expectedSession, type: 'dark', dark: raw.dark }
    case 'goto':
      if (!validPosition(raw.slide, raw.click))
        return null
      return {
        session: expectedSession,
        type: 'goto',
        slide: raw.slide,
        click: raw.click,
      }
    case 'position':
      if (!Number.isSafeInteger(raw.docVersion) || raw.docVersion < 0)
        return null
      if (!validPosition(raw.slide, raw.click, raw.total) || typeof raw.dark !== 'boolean' || typeof raw.run !== 'boolean')
        return null
      return {
        session: expectedSession,
        type: 'position',
        docVersion: raw.docVersion,
        slide: raw.slide,
        click: raw.click,
        total: raw.total,
        dark: raw.dark,
        run: raw.run,
      }
    case 'document': {
      if (!Number.isSafeInteger(raw.docVersion) || raw.docVersion < 0)
        return null
      if (typeof raw.src !== 'string' || typeof raw.css !== 'string')
        return null
      if (encoder.encode(raw.src).byteLength + encoder.encode(raw.css).byteLength > MAX_BYTES)
        return null
      if (!validPosition(raw.slide, raw.click, raw.total) || typeof raw.dark !== 'boolean' || typeof raw.run !== 'boolean')
        return null
      if (!Array.isArray(raw.notes) || raw.notes.length > 10000 || raw.notes.some(n => typeof n !== 'string'))
        return null
      if (!Array.isArray(raw.titles) || raw.titles.length > 10000 || raw.titles.some(t => typeof t !== 'string'))
        return null
      return {
        session: expectedSession,
        type: 'document',
        docVersion: raw.docVersion,
        src: raw.src,
        css: raw.css,
        slide: raw.slide,
        click: raw.click,
        total: raw.total,
        dark: raw.dark,
        run: raw.run,
        notes: raw.notes,
        titles: raw.titles,
      }
    }
    default:
      return null
  }
}

export function createPresenterChannel(session, onMessage) {
  if (!isValidSession(session))
    throw new Error('Invalid presenter session')
  if (typeof globalThis.BroadcastChannel !== 'function') {
    return {
      post() {},
      close() {},
    }
  }
  const channel = new globalThis.BroadcastChannel(PRESENTER_CHANNEL)
  channel.onmessage = (event) => {
    const parsed = parsePresenterMessage(event.data, session)
    if (parsed)
      onMessage(parsed)
  }
  return {
    post(message) {
      channel.postMessage({ ...message, session })
    },
    close() {
      channel.close()
    },
  }
}
