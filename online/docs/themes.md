# Bundled themes

Slidev Online includes default, seriph, apple-basic, bricks and shibainu. Choose a theme in the YAML at the start of your deck:

```yaml
---
theme: bricks
---
# My presentation
```

You can also use the full package name, such as `@slidev/theme-bricks`. An unavailable theme shows a notice and uses default.

All theme layouts and artwork work offline after the preview reports “Available offline.” Bricks includes the components `Polygon1` through `Polygon11`. These components are available when the deck uses Bricks.

Bricks starts in light mode. Shibainu starts in dark mode. A deck can set its own `colorSchema`, though a theme's artwork may be designed for its original mode.

Theme fonts are bundled too. Apple Basic prefers Helvetica Neue when installed on your device and otherwise uses system fonts. [Read about fonts and privacy](fonts.md).

Images supplied by your deck can use HTTPS URLs. These images need an internet connection and are not part of the verified offline download. Image hosts receive your IP address when a deck loads their images. By default, requests send no referrer, so they do not include the editor URL. Images in Markdown, HTML and theme backgrounds follow the same rule.

Other npm themes and local theme directories are unavailable online.

All five themes use the MIT license. The offline download includes their original licenses. [Read the theme audit](../runtime/theme-audit.json).

[Online documentation](./) · [Open the preview](../)
