---
theme: default
title: "Code and Magic Move"
info: "Highlight lines and animate between code versions."
onlineTags: ["code", "clicks"]
layout: cover
transition: none
---

# Show the change

```ts {1|2|all}
const message: string = 'Hello'
console.log(message)
```

---

# From value to function

````md magic-move
```ts
const answer = 42
```

```ts
function answer() {
  return 42
}
```
````
