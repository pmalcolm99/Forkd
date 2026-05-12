# @forkd/ui

Shared React component library for Forkd, built on HeroUI v2 and Tailwind CSS v4. Wraps HeroUI primitives (buttons, modals, tables, inputs) and composes them into Forkd-specific components (restaurant cards, status badges, star-rating inputs, filter panels). Importing from this package instead of HeroUI directly means visual changes can be made in one place. Components here must be client-safe (no server-only imports). See §3.1 and §3.10 of `docs/master-requirements.md` for the UI patterns this package will need to support.
