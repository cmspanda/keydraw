# Keydraw

> Diagrams at the speed of typing.

Keydraw is a keyboard-first diagramming app for quickly sketching shapes, flows, and ideas without leaving the home row. It runs entirely in the browser as a static SVG canvas — no backend, no sign-in, no install — with auto-save, undo/redo, theming, and PNG / SVG / JSON export.

## Features

- Shapes: rectangle, square, circle, diamond, arrow, text — all reachable with one keystroke.
- Auto-connecting arrows when you place a shape next to a selection.
- Layout commands: horizontal, vertical, and grid auto-arrange.
- Multi-select, group/ungroup, copy/paste, duplicate, undo/redo.
- Per-object color, line style, stroke width, and image fill.
- Pan, zoom, marquee select, grid snap.
- Light / dark / system themes.
- Auto-saves to the browser; import/export JSON; export PNG and SVG.

## Run locally

```sh
python3 -m http.server 8000 -d .
# open http://localhost:8000
```

## Build & run with Docker

```sh
docker build -t keydraw .
docker run --rm -p 8080:80 keydraw
# open http://localhost:8080
```

## Keyboard

| Key | Action |
|-----|--------|
| `s` | Open shape menu |
| `r` / `s` / `c` / `d` / `a` / `t` (in shape menu) | Rectangle / Square / Circle / Diamond / Arrow / Text |
| `Esc` | Cancel / deselect |
| `Tab` | Edit text on selected object (Enter saves, Esc cancels, Shift+Enter newline) |
| `Shift + Arrows` | Move selected by its size + 25% |
| `Arrows` | Nudge selected by 1px |
| `c` | Color picker for selected |
| `i` | Upload image fill (used as cover-fill mask of the object) |
| `x` | Clear image fill |
| `l` / `w` / `b` | Cycle line style / cycle width / toggle bidirectional arrow |
| `g` | Toggle grid snap |
| `⌘Z` / `⌘⇧Z` | Undo / redo |
| `⌘C` / `⌘V` / `⌘D` | Copy / paste / duplicate |
| `⌘G` / `⌘⇧U` | Group / ungroup |
| `⌘⇧H` / `⌘⇧J` / `⌘⇧G` | Horizontal / vertical / grid layout |
| `Delete` / `Backspace` | Delete selected |
| `?` | Toggle help panel |

If no object is selected when a shape is placed, it is created at the mouse position. If an object is selected, the new shape is created to its right and auto-connected with an arrow.

Drag objects to move; drag corner handles to resize; drag arrow endpoints to reshape.
