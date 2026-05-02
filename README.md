# Keydraw

A keyboard-focused, Excalidraw-style diagramming app for personal use. Fully client-side, served as a static site.

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
| `r` / `s` / `c` / `a` (in shape menu) | Rectangle / Square / Circle / Arrow |
| `Esc` | Cancel / deselect |
| `Tab` | Edit text on selected object (Enter saves, Esc cancels, Shift+Enter newline) |
| `Shift + Arrows` | Move selected by its size + 25% |
| `Arrows` | Nudge selected by 1px |
| `c` | Color picker for selected |
| `i` | Upload image fill (used as cover-fill mask of the object) |
| `x` | Clear image fill |
| `Delete` / `Backspace` | Delete selected |
| `?` | Toggle help panel |

If no object is selected when a shape is placed, it is created at the mouse position. If an object is selected, the new shape is created to its right.

Drag objects to move; drag corner handles to resize; drag arrow endpoints to reshape.
