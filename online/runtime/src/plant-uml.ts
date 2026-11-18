import type { InjectionKey, Ref } from 'vue'

// Owned by the renderer, shared by diagrams, and discarded with the deck frame.
export const plantUmlPermission: InjectionKey<Ref<boolean>> = Symbol('PlantUML permission')
export const plantUmlServer = 'https://www.plantuml.com/plantuml'
