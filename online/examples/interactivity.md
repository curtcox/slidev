---
theme: default
title: "A slide that responds"
info: "A local Vue counter with per-slide script setup."
onlineTags: ["vue", "interactive"]
layout: cover
transition: none
---

# Ask the audience

<button class="px-6 py-3 bg-blue-700 text-white rounded" @click="votes++">Votes: {{ votes }}</button>

The counter lives inside this preview. Rendering again resets it.

<script setup lang="ts">
import { shallowRef } from 'vue'
const votes = shallowRef(0)
</script>
