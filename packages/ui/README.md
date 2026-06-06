# @forkd/ui

Shared React component library for Forkd, built on HeroUI v2 and Tailwind CSS v4. Wraps HeroUI primitives (buttons, modals, tables, inputs) and composes them into Forkd-specific components (restaurant cards, status badges, star-rating inputs, filter panels). Importing from this package instead of HeroUI directly means visual changes can be made in one place. Components here must be client-safe (no server-only imports). See §3.1 and §3.10 of `docs/master-requirements.md` for the UI patterns this package will need to support.

## Components

### `RestaurantMap`

An interactive Leaflet + OpenStreetMap map that renders restaurants as color-coded pins. Requires Leaflet CSS to be loaded — the component imports it directly (`import "leaflet/dist/leaflet.css"`), so the consuming Next.js app must include `@forkd/ui` in `transpilePackages` in `next.config.ts`.

**Props:**

```typescript
interface MapRestaurant {
  id: string;
  name: string;
  status: RestaurantStatus;
  latitude: string; // Drizzle numeric as string; parseFloat applied internally
  longitude: string;
}

interface Props {
  restaurants: MapRestaurant[];
}
```

- Pass only restaurants that have coordinates (both `latitude` and `longitude` non-null).
- Pins are color-coded by status using `RESTAURANT_STATUS_PIN_COLORS` from `@forkd/shared`.
- Each pin has a popup with the restaurant name, status label, and a link to the detail page.
- Auto-fits map bounds to visible pins. Falls back to a US-centered view when no pins are shown.
- Must be loaded with `next/dynamic({ ssr: false })` because Leaflet requires the browser `window`.

**Usage in Next.js:**

```typescript
// In a "use client" component:
const DynamicMap = dynamic(() => import("@forkd/ui").then((m) => m.RestaurantMap), { ssr: false });
```
