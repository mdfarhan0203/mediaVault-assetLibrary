# Submission

Keep this tight. Bullet points are fine. We read this before we read your code,
and a clear account of your reasoning carries real weight — including where you
chose not to do something.

## Video walkthrough

Paste your Loom (or equivalent) link here. 5–10 minutes.

**Link:**

Not available yet.

---

## How to run it

Anything we need to know beyond `npm install && npm run dev`.

Requires Node 20.11 or newer. The default API chaos and latency remain enabled.

## Time spent

Roughly, and how you split it.

---

## Baseline defects found

| # | Defect | Where | Fixed / left / out of scope |
| --- | --- | --- | --- |
| 1 | Bulk update sends >50 ids in one call | `App.tsx` | fixed |
| 2 | Every search keystroke sends a request | `useAssets.ts` | fixed |
| 3 | Older search responses can overwrite newer results | `useAssets.ts` | fixed |
| 4 | Requests are not cancelled when query or detail asset changes | `useAssets.ts`, `AssetDetail.tsx` | fixed |
| 5 | No retry or `Retry-After` handling | `api/client.ts` | fixed |
| 6 | Concurrent identical requests are not de-duplicated | `api/client.ts` | fixed |
| 7 | Query state is not shareable through the URL | `App.tsx` | fixed |
| 8 | Cursor pagination is absent and all loaded cards render | `useAssets.ts`, `AssetGrid.tsx` | fixed |
| 9 | Missing thumbnails render as broken images | `AssetGrid.tsx`, `AssetDetail.tsx` | fixed |
| 10 | Selection re-renders every card | `AssetGrid.tsx` | fixed with memoized cards |
| 11 | Bulk failures are not reported per result | `App.tsx` | fixed |
| 12 | Detail saves leave visible list rows stale | `useAssets.ts`, `App.tsx` | fixed |
| 13 | Loading, empty and error states are conflated | `App.tsx`, `AssetGrid.tsx` | fixed |
| 14 | Keyboard focus management is incomplete | `AssetDetail.tsx` | knowingly left |

---

## Key decisions

For each significant choice: what you did, what you rejected, and why. Three to
six of these is about right.

**Data fetching and caching**

The client adds structured errors, abort signals, retries, and in-flight GET de-duplication without changing the fixed API.

**Stale response handling**

Search input is debounced by 300 ms. Query changes abort the previous request and increment a request generation so late responses cannot replace newer results.

**Virtualization approach**

`@tanstack/react-virtual` virtualizes grid rows while preserving responsive columns. Cards are memoized, thumbnails are lazy, and thumbnail space is reserved.

**Optimistic updates and rollback**

Writes are confirmed before visible rows are updated. This avoids showing a successful status after a legal-hold or conflict failure.

**Retry and backoff policy**

GET 503/429 responses retry up to three attempts and honor `Retry-After`; PATCH retries only `500 write_failed`. Validation and conflict responses are not retried.

**State placement and URL sync**

Search, status, and sort live in the URL. `replaceState` avoids one history entry per keystroke; cursors remain ephemeral and reset with the query.

---

## Performance

Fill in real measurements, not estimates. Say which machine and browser.

| Metric | Before | After | How measured |
| --- | --- | --- | --- |
| Rendered DOM nodes at 5,000 rows loaded | Not measured | Virtualized viewport plus overscan | Browser inspection still required |
| Cards re-rendered when toggling one selection | Not measured | Expected one card plus parent | React Profiler measurement still required |
| Longest task during sustained scroll | Not measured | Not measured | Chrome Performance trace still required |
| Requests fired while typing a 6-character query | 6 | 1 after 300 ms idle | Network-panel verification still required |
| Production bundle, gzipped | 48.3 kB | 57.5 kB | `npm run build` output |

What was the actual bottleneck, and how did you find it?

---

## Accessibility

- Keyboard model you implemented, in one paragraph.
- Cards use native buttons and checkboxes, so they can be opened and selected without a mouse. Status and error changes use live regions, focus is visible, and missing thumbnails use stable text placeholders.
- How you tested it, including any screen reader.
- Typecheck/build completed. Full screen-reader and axe verification remains to be recorded.
- Known gaps.

The detail panel still needs focus trapping and focus restoration.

---

## Interface decisions

Three or four sentences: what you were optimising for, and the decisions that
follow from it. Then briefly:

- **Visual system.** Your colour, spacing and type decisions, and where they live.
- **Status treatment.** How the four statuses read as a progression, and how they
  stay distinguishable without relying on colour.
- **States.** What you did with loading, empty, error, offline and partial
  failure.
- **Contrast.** What you checked against, and with what.
- **Copy.** Any user-facing message you rewrote and why.

Screenshots in the repo are welcome — link them here.

The interface prioritises fast scanning: a compact toolbar, persistent filters, stable card geometry, and a detail panel that does not replace the list. Loading, empty, error, offline, and partial bulk outcomes are separate states. Status labels remain textual and are not communicated by colour alone.

---

## Trade-offs and cuts

What you deliberately did not do, and what you would do with another day.

I did not add SSE reconciliation, a full conflict-resolution UI, focus trapping, or automated browser performance tests. With another day I would add Playwright coverage for search races, retries, stale cursors, 207 bulk results, and keyboard navigation, then record React Profiler and Chrome Performance measurements.

## Critique of the API

What you would change about the backend contract, and what it forced you to do in
the client that you would rather not have.

The API should return consistent retry metadata, expose a stable query key for page caching, and provide a bulk operation id for large updates. The client currently has to serialize bulk chunks, merge partial responses, and coordinate cursor invalidation itself.

## Anything you would like us to look at

Code you are proud of, or a decision you are unsure about and want to discuss.
