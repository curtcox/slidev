# Fonts

The default theme includes Nunito Sans and Fira Code. The seriph theme includes PT Serif and PT Mono. Bricks includes Signika Negative, Sigmar One and Fira Code. Shibainu includes Titillium Web and Fira Code. Apple Basic uses Helvetica Neue when installed, with system fallbacks. These fonts work offline after the preview reports “Available offline.” The default theme uses Avenir Next first when your device has it.

Slidev Online loads font styles inside the isolated slide preview. Each font includes its available character sets. Some characters can still need a system font.

You can select other Google fonts in the YAML configuration at the start of your deck:

```yaml
---
fonts:
  sans: Roboto
  mono: Fira Code
  weights: [400, 700]
  italic: true
---
# My presentation
```

Additional Google fonts require an internet connection. Google receives the requested font names and your network address. Requests for the stylesheet omit the page referrer. These fonts are not included in the offline download.

To prevent font downloads, set `fonts.provider: none`. To use fonts installed on your device, list them in `fonts.local`. An empty `fonts.webfonts: []` also prevents downloads. The `coollabs` provider is unavailable online.

If a font fails to load, the preview shows a notice and uses the next available font. Rendering again retries the request. Loading waits up to five seconds for each stage before the preview continues.

Bundled fonts come from pinned Fontsource 5.3.0 packages under the SIL Open Font License 1.1. The offline download includes the original font bytes, attribution and licenses. [Read the font audit](../runtime/fonts/audit.json).

[Online documentation](index.md) · [Open the preview](../)
