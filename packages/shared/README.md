# @forkd/shared

Cross-cutting TypeScript types and pure utility functions shared across all Forkd workspaces. Nothing here has side effects or imports from other `@forkd/*` packages — it is the lowest layer of the dependency graph. Examples of what belongs here: the `RestaurantStatus` enum, the US state list, result-type helpers, and date-formatting utilities. If code is duplicated in two workspaces, it moves here.
