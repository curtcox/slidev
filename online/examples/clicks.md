---
theme: default
title: "Clicks and motion"
info: "Reveal a list, move a heading and change slides."
onlineTags: ["clicks", "animation"]
layout: cover
transition: none
---

# One idea at a time

Use the next arrow or tap to reveal each point.

<v-clicks>

- Start with the question.
- Show the evidence.
- State the result.

</v-clicks>

---
transition: slide-left
---

# Motion with a purpose

<div v-motion :initial="{ opacity: 0, y: 30 }" :enter="{ opacity: 1, y: 0 }">A heading enters once.</div>

<v-click>A final thought appears on the next click.</v-click>
