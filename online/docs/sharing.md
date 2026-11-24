# Sharing and privacy

Share creates a URL that includes your Markdown and CSS in its fragment, the part after `#`. Anyone with the full URL can open the document. The link is compressed, not encrypted.

## Links and drafts

The current slide travels in `?slide=2`. Share can also select a view and disable Run on open. A `?run=0` link waits for the reader to select Render before it executes slide code.

A valid explicit link opens its own document. An invalid link shows an error and keeps the stored draft. Recovered drafts and imported files also wait for Render.

QR displays the current document link or a matching saved HashBin link. Large documents can exceed QR capacity. The QR dialog can offer a HashBin save to produce a shorter link.

The optional shortener sends the full share link to an external service through a proxy. Use the full link when you do not want that service to receive it.

## HashBin

A CID is a content identifier that names exact saved bytes. Slidev Online verifies a CID download before it opens the document. A saved HashBin link uses the CID instead of putting the full document in the URL.

Save to HashBin requires a registered Slidev Online client ID. Registration is still pending. Until registration is available, the save controls explain this requirement. No paid Publish round trip is part of the current acceptance evidence.

HashBin saving sends the document to HashBin. A content identifier is not a password or an access restriction. Do not publish private information that others must not retrieve.

## Remote requests

Remote images and videos can contact their hosts when the preview renders. Hosts receive your network address and requested resource. Image requests omit the editor URL as a referrer by default.

Bundled fonts work offline. Additional Google fonts send font names and your network address to Google. Read [fonts and privacy](fonts.md) for ways to disable font downloads.

[PlantUML](plantuml.md) sends diagram text to its external service only after you select Enable PlantUML for this deck. Each new preview resets that permission.

## Local copies

Download offers `slides.md`, `style.css`, a ZIP archive containing both, a JSON document, and printable standalone HTML (`slides.html` or `slides-with-notes.html`). Use JSON to retain future document extension fields. ZIP export contains only the two named files. Printable HTML strips scripts, enforces a strict `default-src 'none'` policy, and lets you print or save as PDF from a normal browser tab.

Browser drafts stay on the current device. They are separate from shared links and HashBin saves. Download a copy before clearing browser data.
