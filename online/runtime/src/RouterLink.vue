<script setup lang="ts">
import { useNav } from './navigation'

defineProps<{ to: string }>()
const { go } = useNav()
</script>

<template>
  <a :href="to.startsWith('/') ? to : `/${to}`" @click.prevent="go(to)"><slot /></a>
</template>
