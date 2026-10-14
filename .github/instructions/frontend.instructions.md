---
name: SAGE web conventions
description: Apply SAGE React, API-client, accessibility, styling, and test conventions when changing the web app.
applyTo: "apps/web/src/**"
---
# Frontend instructions

- Keep HTTP access and response validation in `src/api/`; keep reusable server-state and request lifecycle behavior in hooks; keep components focused on rendering and user interaction.
- Use the shared `@sage/contracts` schemas and inferred types for API response contracts instead of duplicating them in the web app.
- Follow the existing React, TypeScript, and Tailwind CSS 4 patterns. Preserve the current visual language unless the task explicitly calls for a redesign.
- Keep interactive controls accessible: use semantic elements, labels, keyboard behavior, visible focus, and appropriate loading/error states.
- Add or update focused Vitest and React Testing Library tests for visible behavior. Prefer user-observable assertions over component implementation details.