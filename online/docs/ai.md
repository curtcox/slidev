# AI editing

Ask AI lets you request changes to Markdown and CSS. Opening a deck does not call a model or load the AI interface.

## Use your chat

Paste handoff works without an API key or a network connection in this editor:

1. Select Ask AI. On a phone, open More first.
2. Describe the change and select the paste model.
3. Select Copy prompt to prepare the request. Review What will be sent.
4. Select Copy prompt again. Paste the prompt into your chat.
5. Paste the JSON reply into Paste model reply, then select Review pasted reply.
6. Review the proposed changes. Select Check proposal to compile every slide in a separate, isolated sandbox.
7. Select Accept change to update the editor. Select Render when you want to run the changed deck.

The compilation sandbox checks Markdown, Vue and CSS syntax without running slide scripts. A successful compilation does not test runtime behavior or external media.

Applying a proposal pauses rendering and saves a draft. Its URL also keeps rendering paused after reload. Undo AI change restores the previous document unless you edited it afterward. Browser Back also opens the previous document with rendering paused.

## Connect a provider

AI settings offers OpenAI, OpenRouter, Anthropic and Gemini connections. Keys stay in memory for the current page session. Disconnect or reload to remove them. OpenRouter also offers sign-in through a separate window.

Spending caps start at zero. Set your total, daily and monthly caps before sending a paid request. Review the destination and allow sending the document before each request. Unknown model prices require a positive maximum cost for that call. Use provider limits as well because the browser ledger cannot enforce your provider bill.

The recovery site uses direct connections. Scripts on this page can access a connected key during that session. The future canonical site will use a separate AI host. Unrecognized deployment URLs offer paste handoff only.

Add a local model in AI settings to use a server on localhost or 127.0.0.1. The page permits HTTP and HTTPS loopback connections. Browser models require explicit inspection, download approval and compatible hardware. The optional browser engine is not part of the offline download.

## Compare models

Compare models offers six tasks for summaries, columns, themes, click reveals, heading styles and frontmatter corrections. Select two to four models with known prices, review their destinations, and set a spending cap. Start the comparison only after allowing its requests. You can also compare a request for your current deck.

Results stay on this device. Reports exclude private cases by default. Applying a comparison proposal also pauses rendering until you select Render.

The current deck must contain a visible slide and valid YAML before you prepare an AI prompt. Correct YAML syntax errors in the editor first. Proposals can change only Markdown and CSS. Other document extension fields stay outside the model request and remain unchanged.

Do not put API keys in a deck, stylesheet or shared URL. Anyone with a shared link can read its document text.
