/**
 * Height of the graph canvas frame, shared by both graph tabs.
 *
 * The app shell's `<main>` is a padded, scrollable column rather than a fixed
 * viewport pane, so an Obsidian-style edge-to-edge canvas has to claim the
 * viewport height minus that chrome (topbar + `py-6` + the tab strip above it)
 * instead of just using `h-full`. The floor keeps it usable on short windows,
 * where the page scrolls a little rather than squashing the graph.
 */
export const GRAPH_FRAME_HEIGHT = "h-[calc(100dvh-11.5rem)] min-h-[460px]";
