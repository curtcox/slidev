# Supported features

Slidev Online uses Slidev's Markdown transforms and Vue client inside an isolated preview. It accepts `slides.md` and optional `style.css`. Together, these files must fit within 5 MiB of UTF-8 text.

Headmatter is the YAML configuration at the start of a deck. Per-slide frontmatter sets a slide's layout and other properties. Separate slides with a line that contains `---`.

| Feature                                                              | Online support                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Headmatter, per-slide frontmatter, notes, hidden and disabled slides | Supported                                                                |
| Bundled themes and their layouts                                     | default, seriph, apple-basic, bricks and shibainu                        |
| Markdown, HTML, inline Vue and per-slide `<script setup>`            | Supported inside the isolated preview                                    |
| Named slots, including `::right::`                                   | Supported                                                                |
| `v-click`, `v-clicks`, `v-after` and code highlight steps            | Supported                                                                |
| Magic Move, `v-motion`, CSS transitions and dark mode                | Supported                                                                |
| Named view transitions                                               | Supported when the browser provides the API, with a fade fallback        |
| Scoped styles, global CSS and UnoCSS utilities                       | Supported                                                                |
| `VDrag`, `VDragArrow` and `v-drag`                                   | Supported, with position updates written to Markdown                     |
| Code highlighting                                                    | Forty bundled languages and their aliases, with plain text fallback      |
| KaTeX equations and Mermaid diagrams                                 | Supported, with assets loaded on demand                                  |
| Icons                                                                | carbon, ph, mdi, logos, simple-icons, twemoji and svg-spinners           |
| Built-in components                                                  | Includes Toc, Arrow, Link, Youtube, RenderWhen and slide counters        |
| PlantUML                                                             | Requires a click for each new preview and an internet connection         |
| Monaco, `monaco-diff` and `monaco-run`                               | Supported lazily inside the isolated preview. TypeScript ATA is disabled (no CDN fetches) |
| Twoslash                                                             | Plain code, without TypeScript analysis                                  |
| `src:` slide imports and `<<<` file snippets                         | Unavailable. The slide shows an error                                    |
| Custom components, layouts, setup directories and npm imports        | Unavailable. Use bundled components and supported imports                |
| Themes and addons downloaded from npm                                | Unavailable                                                              |
| Presenter window, print/PDF and standalone HTML export               | Presenter opens in a second window with opaque previews, text notes and timer; Print/PDF downloads standalone script-free printable HTML |
| Camera, recording and remote-control synchronization                 | Unavailable                                                              |

Missing components, icons, imports and languages produce visible errors or notices. The Tweet widget is unavailable. Remote media and additional Google fonts need an internet connection.

## Offline use

Wait for the editor to report “Available offline” before disconnecting. The app caches the editor, docs, examples, themes, bundled fonts, icon collections, grammars, math and Mermaid assets. You can install Slidev Online as a web app from your browser. Use **More → Repair offline copy** if cached files need verification, and **More → Apply update** when a new release is ready without losing your current slides.

Remote images, videos, additional fonts and PlantUML are outside this download. Browser storage can be cleared or evicted. Keep a downloaded copy of important work.

## Isolation

Author scripts and Vue expressions execute only inside the isolated preview. They cannot read the editor's document, cookies or browser storage. This isolation does not prevent permitted requests for remote media. Read [sharing and privacy](sharing.md) before opening a deck with private content.
