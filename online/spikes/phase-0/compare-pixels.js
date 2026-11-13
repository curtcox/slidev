// Runs in a separate blank diagnostic page, never in the editor or deck.
globalThis.comparePixels = async ({ reference, actual }) => {
  const decode = async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([
      new Uint8Array(bytes),
    ], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)
    return {
      canvas,
      ctx,
      pixels: ctx.getImageData(0, 0, bitmap.width, bitmap.height),
    }
  }
  const a = await decode(reference)
  const b = await decode(actual)
  if (a.canvas.width !== b.canvas.width || a.canvas.height !== b.canvas.height)
    return { error: `Dimensions differ: ${a.canvas.width}x${a.canvas.height} vs ${b.canvas.width}x${b.canvas.height}` }
  let changed = 0
  let exactChanged = 0
  let maxChannelDelta = 0
  for (let offset = 0; offset < a.pixels.data.length; offset += 4) {
    let delta = 0
    for (let channel = 0; channel < 4; channel++)
      delta = Math.max(delta, Math.abs(a.pixels.data[offset + channel] - b.pixels.data[offset + channel]))
    if (delta)
      exactChanged++
    maxChannelDelta = Math.max(maxChannelDelta, delta)
    const different = delta > 8
    if (different)
      changed++
    b.pixels.data.set(different
      ? [255, 0, 0, 255]
      : [255, 255, 255, 255], offset)
  }
  b.ctx.putImageData(b.pixels, 0, 0)
  return {
    changed,
    exactChanged,
    maxChannelDelta,
    total: a.canvas.width * a.canvas.height,
    ratio: changed / (a.canvas.width * a.canvas.height),
    image: b.canvas.toDataURL('image/png'),
  }
}
