/* eslint-disable style/quotes, style/comma-dangle, style/quote-props */
// Generated from examples/*.md by npm run examples.
export const examples = [
  {
    "id": "clicks",
    "title": "Clicks and motion",
    "description": "Reveal a list, move a heading and change slides.",
    "tags": [
      "clicks",
      "animation"
    ],
    "cover": "gallery/clicks.png",
    "document": {
      "src": "---\ntheme: default\ntitle: \"Clicks and motion\"\ninfo: \"Reveal a list, move a heading and change slides.\"\nonlineTags: [\"clicks\", \"animation\"]\nlayout: cover\ntransition: none\n---\n\n# One idea at a time\n\nUse the next arrow or tap to reveal each point.\n\n<v-clicks>\n\n- Start with the question.\n- Show the evidence.\n- State the result.\n\n</v-clicks>\n\n---\ntransition: slide-left\n---\n\n# Motion with a purpose\n\n<div v-motion :initial=\"{ opacity: 0, y: 30 }\" :enter=\"{ opacity: 1, y: 0 }\">A heading enters once.</div>\n\n<v-click>A final thought appears on the next click.</v-click>\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "code",
    "title": "Code and Magic Move",
    "description": "Highlight lines and animate between code versions.",
    "tags": [
      "code",
      "clicks"
    ],
    "cover": "gallery/code.png",
    "document": {
      "src": "---\ntheme: default\ntitle: \"Code and Magic Move\"\ninfo: \"Highlight lines and animate between code versions.\"\nonlineTags: [\"code\", \"clicks\"]\nlayout: cover\ntransition: none\n---\n\n# Show the change\n\n```ts {1|2|all}\nconst message: string = 'Hello'\nconsole.log(message)\n```\n\n---\n\n# From value to function\n\n````md magic-move\n```ts\nconst answer = 42\n```\n\n```ts\nfunction answer() {\n  return 42\n}\n```\n````\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "columns",
    "title": "Two columns and slots",
    "description": "Compare two ideas with the named right slot.",
    "tags": [
      "layouts",
      "slots"
    ],
    "cover": "gallery/columns.png",
    "document": {
      "src": "---\ntheme: default\ntitle: \"Two columns and slots\"\ninfo: \"Compare two ideas with the named right slot.\"\nonlineTags: [\"layouts\", \"slots\"]\nlayout: cover\ntransition: none\n---\n\n# Compare two approaches\n\n---\nlayout: two-cols\n---\n\n# Write\n\n- Put the question first.\n- Keep each slide focused.\n\n::right::\n\n# Present\n\n- Pause after a new idea.\n- Leave room for questions.\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "conference",
    "title": "A conference talk",
    "description": "A five-slide outline with speaker notes.",
    "tags": [
      "template",
      "starter"
    ],
    "cover": "gallery/conference.png",
    "document": {
      "src": "---\ntheme: default\ntitle: \"A conference talk\"\ninfo: \"A five-slide outline with speaker notes.\"\nonlineTags: [\"template\", \"starter\"]\nlayout: cover\ntransition: none\n---\n\n# Your talk title\n\nYour name · Your event\n\n<!--\nIntroduce yourself and give the audience one reason to care.\n-->\n\n---\n\n# The question\n\nWhat problem does your audience want to solve?\n\n<!--\nDescribe a concrete situation.\n-->\n\n---\nlayout: two-cols\n---\n\n# Before\n\nDescribe the current approach.\n\n::right::\n\n# After\n\nExplain the change and show the result.\n\n---\n\n# What we learned\n\n<v-clicks>\n\n- One result\n- One limitation\n- One next step\n\n</v-clicks>\n\n---\nlayout: center\n---\n\n# Questions?\n\nYour contact information\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "drag",
    "title": "Position elements",
    "description": "Move a box or arrow and keep its position in Markdown.",
    "tags": [
      "drag",
      "layouts"
    ],
    "cover": "gallery/drag.png",
    "document": {
      "src": "---\ntheme: default\ntitle: \"Position elements\"\ninfo: \"Move a box or arrow and keep its position in Markdown.\"\nonlineTags: [\"drag\", \"layouts\"]\nlayout: default\ntransition: none\n---\n\n# Place the emphasis\n\nDrag the blue box or the arrow. Markdown keeps the new coordinates.\n\n<VDrag pos=\"120,220,240,100\" class=\"bg-blue-100 text-blue-900 p-4 rounded\">Move this idea</VDrag>\n\n<VDragArrow pos=\"440,240,160,30\" color=\"red\" />\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "interactivity",
    "title": "A slide that responds",
    "description": "A local Vue counter with per-slide script setup.",
    "tags": [
      "vue",
      "interactive"
    ],
    "cover": "gallery/interactivity.png",
    "document": {
      "src": "---\ntheme: default\ntitle: \"A slide that responds\"\ninfo: \"A local Vue counter with per-slide script setup.\"\nonlineTags: [\"vue\", \"interactive\"]\nlayout: cover\ntransition: none\n---\n\n# Ask the audience\n\n<button class=\"px-6 py-3 bg-blue-700 text-white rounded\" @click=\"votes++\">Votes: {{ votes }}</button>\n\nThe counter lives inside this preview. Rendering again resets it.\n\n<script setup lang=\"ts\">\nimport { shallowRef } from 'vue'\nconst votes = shallowRef(0)\n</script>\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "layouts",
    "title": "A tour of layouts",
    "description": "Cover, section, fact and quotation layouts.",
    "tags": [
      "layouts",
      "starter"
    ],
    "cover": "gallery/layouts.png",
    "document": {
      "src": "---\ntheme: default\ntitle: \"A tour of layouts\"\ninfo: \"Cover, section, fact and quotation layouts.\"\nonlineTags: [\"layouts\", \"starter\"]\nlayout: cover\ntransition: none\n---\n\n# Give each idea a shape\n\nA short tour of built-in layouts.\n\n---\nlayout: section\n---\n\n# A new section\n\n---\nlayout: fact\n---\n\n# 42\n\nOne number can carry a slide.\n\n---\nlayout: quote\n---\n\n# Make the next step clear.\n\nA reminder for your next talk.\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "math-diagrams",
    "title": "Equations and diagrams",
    "description": "KaTeX math and a local Mermaid flowchart.",
    "tags": [
      "math",
      "diagrams"
    ],
    "cover": "gallery/math-diagrams.png",
    "document": {
      "src": "---\ntheme: default\ntitle: \"Equations and diagrams\"\ninfo: \"KaTeX math and a local Mermaid flowchart.\"\nonlineTags: [\"math\", \"diagrams\"]\nlayout: cover\ntransition: none\n---\n\n# Explain a relationship\n\nEnergy and mass: $E = mc^2$.\n\n$$\na^2 + b^2 = c^2\n$$\n\n---\n\n# From idea to presentation\n\n```mermaid\ngraph LR\n  A[Write] --> B[Preview]\n  B --> C[Present]\n```\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "starter",
    "title": "A first presentation",
    "description": "An editable starter adapted from the Slidev demo.",
    "tags": [
      "starter",
      "markdown"
    ],
    "cover": "gallery/starter.png",
    "document": {
      "src": "---\ntheme: default\ntitle: \"A first presentation\"\ninfo: \"An editable starter adapted from the Slidev demo.\"\nonlineTags: [\"starter\", \"markdown\"]\nlayout: cover\ntransition: none\n---\n\n# A first presentation\n\nWrite your idea. Add a slide. Tell the story.\n\n---\n\n# What can a slide contain?\n\n- Markdown text and lists\n- Highlighted code and equations\n- Vue components and click reveals\n\n<!--\nThese notes are visible below the preview.\n-->\n\n---\nlayout: center\n---\n\n# Your next idea\n\nReplace this slide with your own conclusion.\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "theme-apple-basic",
    "title": "apple-basic theme",
    "description": "A showcase of the bundled apple-basic theme.",
    "tags": [
      "themes",
      "apple-basic"
    ],
    "cover": "gallery/theme-apple-basic.png",
    "document": {
      "src": "---\ntheme: apple-basic\ntitle: \"apple-basic theme\"\ninfo: \"A showcase of the bundled apple-basic theme.\"\nonlineTags: [\"themes\", \"apple-basic\"]\nlayout: intro\ntransition: none\n---\n\n# The apple-basic theme\n\nA bundled theme for your next presentation.\n\n---\nlayout: statement\n---\n\n# Let the idea lead.\n\nKeep the words that move your story forward.\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "theme-bricks",
    "title": "bricks theme",
    "description": "A showcase of the bundled bricks theme.",
    "tags": [
      "themes",
      "bricks"
    ],
    "cover": "gallery/theme-bricks.png",
    "document": {
      "src": "---\ntheme: bricks\ntitle: \"bricks theme\"\ninfo: \"A showcase of the bundled bricks theme.\"\nonlineTags: [\"themes\", \"bricks\"]\nlayout: cover\ntransition: none\n---\n\n# The bricks theme\n\nA bundled theme for your next presentation.\n\n---\nlayout: statement\n---\n\n# Let the idea lead.\n\nKeep the words that move your story forward.\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "theme-default",
    "title": "default theme",
    "description": "A showcase of the bundled default theme.",
    "tags": [
      "themes",
      "default"
    ],
    "cover": "gallery/theme-default.png",
    "document": {
      "src": "---\ntheme: default\ntitle: \"default theme\"\ninfo: \"A showcase of the bundled default theme.\"\nonlineTags: [\"themes\", \"default\"]\nlayout: cover\ntransition: none\n---\n\n# The default theme\n\nA bundled theme for your next presentation.\n\n---\nlayout: statement\n---\n\n# Let the idea lead.\n\nKeep the words that move your story forward.\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "theme-seriph",
    "title": "seriph theme",
    "description": "A showcase of the bundled seriph theme.",
    "tags": [
      "themes",
      "seriph"
    ],
    "cover": "gallery/theme-seriph.png",
    "document": {
      "src": "---\ntheme: seriph\ntitle: \"seriph theme\"\ninfo: \"A showcase of the bundled seriph theme.\"\nonlineTags: [\"themes\", \"seriph\"]\nlayout: cover\ntransition: none\n---\n\n# The seriph theme\n\nA bundled theme for your next presentation.\n\n---\nlayout: statement\n---\n\n# Let the idea lead.\n\nKeep the words that move your story forward.\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "theme-shibainu",
    "title": "shibainu theme",
    "description": "A showcase of the bundled shibainu theme.",
    "tags": [
      "themes",
      "shibainu"
    ],
    "cover": "gallery/theme-shibainu.png",
    "document": {
      "src": "---\ntheme: shibainu\ntitle: \"shibainu theme\"\ninfo: \"A showcase of the bundled shibainu theme.\"\nonlineTags: [\"themes\", \"shibainu\"]\nlayout: cover\ntransition: none\n---\n\n# The shibainu theme\n\nA bundled theme for your next presentation.\n\n---\nlayout: section\n---\n\n# Let the idea lead.\n\nKeep the words that move your story forward.\n",
      "slidev": {
        "css": ""
      }
    }
  },
  {
    "id": "welcome",
    "title": "Hello, Slidev.",
    "description": "Write, share, and present your ideas in the browser.",
    "tags": [
      "starter"
    ],
    "cover": "gallery/welcome.png",
    "document": {
      "src": "---\ntheme: default\n---\n\n# Hello, Slidev.\n\nWrite, share, and present your ideas in the browser.\n",
      "slidev": {
        "css": ""
      }
    }
  }
]
