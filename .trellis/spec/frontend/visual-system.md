# Frontend Visual System and Interaction Contract

## Scope

Apply this specification whenever changing the LUI Agent frontend shell, theme, navigation, authentication UI, chat messages, composer, presentation cards, or responsive behavior.

The goal is executable consistency: business data remains owned by existing stores and services; visual behavior is implemented through semantic tokens, focused components, and accessible primitives.

## Theme Contract

```ts
type ThemePreference = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';
```

- Persist preference under `lui-agent:theme`.
- Apply the resolved value to `document.documentElement.dataset.theme`.
- Resolve `system` through `prefers-color-scheme` and listen for changes.
- Apply the initial theme before React mounts to avoid a light-theme flash.
- Initialize the UI store from the same validated persisted preference used by the pre-mount script. Do not render `system` once and overwrite the already-resolved first paint.
- Component CSS consumes semantic variables; theme-specific literal colors belong only in the global token declarations.

```css
/* Correct */
.card {
  color: var(--text-primary);
  background: var(--surface-raised);
  border: 1px solid var(--border);
}

/* Wrong: theme literals leak into a component */
.card {
  color: #19202d;
  background: #fff;
}
```

Required token groups: background/surfaces, text levels, borders, accent states, semantic status colors, shadows, radii, and motion durations.

## Component Ownership

- `AppShell` owns page layout and responsive regions.
- `TopBar` owns brand, sidebar trigger, and theme trigger.
- `Sidebar` owns thread search/list rendering and account entry placement, but thread data remains in the thread store.
- `AuthDialog` owns form presentation; authentication requests remain in the auth store/service.
- `ChatComposer` owns draft input behavior and keyboard handling; run creation remains in the chat/run boundary.
- Message and presentation components render typed projections; they do not parse raw SSE payloads.

Do not grow one page component into a monolithic UI controller. Extract a component when it owns a distinct interaction state, Radix primitive, or responsive region.

## Radix Primitive Boundary

Radix Primitives may be used as needed for dialogs, dropdowns, collapsibles, scroll areas, tooltips, and related accessible interactions.

- Radix owns keyboard behavior, focus management, portal layering, and primitive state attributes.
- CSS Modules own every visual decision.
- Do not add Radix Themes or depend on its visual tokens.
- Keep trigger labels and ARIA descriptions in Chinese for user-facing UI.

## Responsive Shell Contract

Desktop:

- Sidebar supports expanded and collapsed modes.
- Expanded sidebar header owns the brand on the left and collapse control on the right. The desktop content top bar must not duplicate either control and keeps the theme control right-aligned.
- Collapsed mode remains usable through icon buttons and tooltips for expand, new thread, search, and account access.
- Expanded sidebar places search immediately before the collapse control; do not keep a second inline search field in the thread list.
- Expanded and collapsed search controls open one shared Radix dialog. The dialog focuses its search input, filters real threads without changing backend order, and closes on result selection, `Esc`, overlay, or close control.
- Collapsed authenticated account access uses the same initial avatar and account menu as expanded mode; when the email is unavailable, use a neutral initial instead of fabricating identity data.
- New-thread actions use a lightweight navigation-row treatment; avoid a prominent bordered call-to-action inside the sidebar.
- Main content keeps a centered reading column.

Mobile:

- Sidebar is a left drawer with overlay.
- Opening the drawer locks main-page scrolling.
- Overlay click, thread selection, and the shared toggle close it.
- Composer must remain visible without covering the last message.

Thread titles are one line with ellipsis. Thread ordering follows backend order. Never invent date groups without timestamp fields.

## Authentication UI Contract

- Unauthenticated users do not see the thread list or prompt suggestions.
- The composer is visibly disabled and cannot send.
- Authentication appears in a dialog opened from the sidebar account entry.
- Closing the dialog preserves form fields; successful authentication clears them.
- Display the captured login email only when it was actually provided and stored. If a token exists without profile data, show a neutral authenticated label.

## Composer Keyboard Contract

```ts
const shouldSubmit =
  event.key === 'Enter' &&
  !event.shiftKey &&
  !event.nativeEvent.isComposing;
```

- Enter submits; Shift+Enter inserts a newline.
- IME composition never submits.
- Textarea grows to a maximum height, then scrolls internally.
- During an active run, the send control becomes a stop control.
- Track one shared active stream across normal runs and approval-resume runs.
- Stop aborts that local stream first, then invokes backend cancellation when a run ID exists, and immediately leaves the active UI state.
- Retry reuses the complete previous request context, not only its text.

## Message and Presentation Contract

- User messages: right-aligned bounded bubble.
- Assistant messages: left-aligned document flow without a large enclosing bubble.
- Markdown tables scroll horizontally.
- Fenced code exposes copy feedback and remains theme-readable.
- Tool, approval, structured output, generative UI, and error results use typed cards with restrained semantic accents.
- Multiple presentation results are represented as ordered items. Never store all results of one kind in a single overwrite-only field.
- Tool, approval, structured output, generative UI, and failed-run cards all enter the same ordered projection.
- Presentation order derives from event `sequence`; render cards at that projected position instead of moving an active approval or error to the end.
- A restored pending approval without a recoverable source event may render as a compatibility fallback after the ordered projection.

## Motion Contract

- Use short, restrained transitions for hover, focus, menus, dialogs, drawers, and message appearance.
- Respect `prefers-reduced-motion: reduce` and remove non-essential transforms/entrance animation.
- Theme changes must not animate every color property across the entire document.

## Validation and Error Matrix

| Condition | Required behavior |
|---|---|
| Invalid stored theme | Fall back to `system` |
| System theme changes in `system` mode | Update resolved theme immediately |
| Token exists without known email | Show neutral authenticated identity |
| Unauthenticated send attempt | Do not create a run |
| Enter during IME composition | Insert/confirm text; do not submit |
| Stop before run ID exists | Abort local stream; skip unavailable cancel request |
| Approval resume is streaming | Shared stop control can abort the resume stream |
| Clipboard write fails | Keep content intact and show recoverable feedback |
| Presentation event repeats sequence | Ignore duplicate item |
| Thread title is long | Ellipsis without changing list width |
| Mobile drawer opens | Lock page scroll and trap focus through Radix |

## Good, Base, and Bad Cases

- Good: dark theme + mobile drawer + authenticated long thread list + active stream remains usable without overflow.
- Base: light theme + empty authenticated thread list shows actionable empty state.
- Bad: invalid theme storage, missing user email, duplicate event sequence, failed clipboard, or absent backend cancel ID degrades safely.

## Tests Required

- Theme unit tests: stored preference, invalid value, system change, root data attribute.
- Composer tests: Enter, Shift+Enter, IME, disabled unauthenticated state, stop ordering.
- Presentation reducer tests: append order, duplicate sequence, multiple structured/generative results.
- Presentation reducer tests: approval and failed-run cards preserve source-event order.
- Authentication UI tests: close preserves fields, success clears fields, token-without-email fallback.
- Responsive browser checks: desktop expanded/collapsed and mobile drawer/overlay/scroll lock.
- Quality gates: `pnpm format:check`, `pnpm lint`, `pnpm build`, `pnpm test`.

## Common Mistakes

- Adding per-component light/dark color literals instead of semantic tokens.
- Rendering brand/sidebar controls in both the desktop sidebar and content top bar.
- Treating missing backend fields as permission to fabricate UI data.
- Using Radix Themes and then fighting its styling layer.
- Keeping result cards as one `structuredOutput` or `generativeUi` value that overwrites prior events.
- Retrying only message text and losing checkpoint or run mode context.
- Handling Enter without checking IME composition.
- Tracking only the initial chat stream locally, which leaves an approval-resume stream impossible to stop.
- Appending an approval to the ordered projection but rendering it separately at the bottom.
