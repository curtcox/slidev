# PlantUML diagrams

PlantUML renders diagrams through an external service. Slidev Online shows their source until you enable the service.

To render the diagrams, select Enable PlantUML for this deck inside the preview. This sends diagram text to `https://www.plantuml.com/plantuml`.

The permission lasts across slides in the current preview. Opening or rendering a deck again resets it. The permission is absent from saved documents and links.

PlantUML needs an internet connection. If a request fails or takes more than 15 seconds, the preview shows the source and a retry button.

Custom PlantUML servers are unavailable online. The `scale` and `alt` code-block attributes work with the default service.

[Online documentation](./) · [Open the preview](../)
