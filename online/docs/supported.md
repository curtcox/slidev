# Supported features

Slidev Online uses Slidev's Markdown transforms and Vue client inside an isolated preview. It accepts `slides.md` and optional `style.css`. Together, these files must fit within 5 MiB of UTF-8 text.

Headmatter is the YAML configuration at the start of a deck. Per-slide frontmatter sets a slide's layout and other properties. Separate slides with a line that contains `---`.

| Feature                                                              | Online support                                                                                                                               |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Headmatter, per-slide frontmatter, notes, hidden and disabled slides | Supported                                                                                                                                    |
| Bundled themes and their layouts                                     | `default`, `seriph`, `apple-basic`, `bricks` and `shibainu`                                                                                  |
| Markdown, HTML, inline Vue and per-slide `<script setup>`            | Supported inside the isolated preview                                                                                                        |
| Named slots, including `::right::`                                   | Supported                                                                                                                                    |
| `v-click`, `v-clicks`, `v-after` and code highlight steps            | Supported                                                                                                                                    |
| Magic Move, `v-motion`, CSS transitions and dark mode                | Supported                                                                                                                                    |
| Named view transitions                                               | Supported when the browser provides the API, with a fade fallback                                                                            |
| Scoped styles, global CSS and UnoCSS utilities                       | Supported                                                                                                                                    |
| `VDrag`, `VDragArrow` and `v-drag`                                   | Supported, with position updates written to Markdown                                                                                         |
| Code highlighting                                                    | Forty bundled languages and their aliases, with plain text fallback                                                                          |
| KaTeX equations and Mermaid diagrams                                 | Supported, with assets loaded on demand                                                                                                      |
| Icons                                                                | `carbon`, `ph`, `mdi`, `logos`, `simple-icons`, `twemoji` and `svg-spinners`                                                                 |
| Built-in components                                                  | `Toc`, `Arrow`, `Link`, `Youtube`, `RenderWhen`, `AutoFitText`, `LightOrDark`, `Transform`, `CodeGroup`, `SlideCurrentNo`, `SlidesTotal`, `PoweredBySlidev` |
| PlantUML                                                             | Requires a click for each new preview and an internet connection                                                                             |
| `{monaco}`, `{monaco-diff}` and `{monaco-run}`                       | Loaded lazily inside the isolated preview; `{monaco-run}` runs JS/TS without module imports; TypeScript ATA is disabled (no CDN fetches); `{monaco-write}` is unavailable |
| Twoslash                                                             | Unavailable; code blocks use static highlighting with a visible notice                                                                       |
| `src:` slide imports and `<<<` file snippets                         | Unavailable; the slide shows an error                                                                                                        |
| Custom components, layouts, setup directories and npm imports        | Unavailable; use bundled components and supported imports                                                                                    |
| Themes and addons downloaded from npm                                | Unavailable                                                                                                                                  |
| Present, Presenter window and Print / PDF export                     | Fullscreen **Present**, synced **Presenter** window with opaque previews, text notes and timer, and script-free printable standalone HTML    |
| Camera, recording and remote-control synchronization                 | Unavailable                                                                                                                                  |

Missing components, icons, imports and languages produce visible errors or notices. The `Tweet` and `SlidevVideo` components are unavailable. Remote media and additional Google fonts need an internet connection.

## Offline use

Wait for the editor to report “Available offline” before disconnecting. The app caches the editor, docs, examples, themes, bundled fonts, icon collections, grammars, math, Mermaid and Monaco assets. You can install Slidev Online as a web app from your browser. Use **More → Repair offline copy** if cached files need verification, and **More → Apply update** when a new release is ready without losing your current slides.

Remote images, videos, additional Google fonts, PlantUML and the optional browser AI engine are excluded from the automatic offline download. Browser storage can be cleared or evicted. Keep a downloaded copy of important work.

## Isolation

Author scripts and Vue expressions execute only inside the isolated preview. They cannot read the editor's document, cookies or browser storage. This isolation does not prevent permitted requests for remote media. Read [sharing and privacy](sharing.md) before opening a deck with private content.

[Online documentation](index.md) · [Open the editor](../)
