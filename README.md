# Portfolio

Static site with no build step. Open `index.html`, or serve the folder:

    python3 -m http.server 8000

- `index.html` holds all the content (name, projects, email). Replace the placeholders.
- `main.js` runs the agent cursors. Hero choreography is in `intro()`; per-section behaviour is in `updateScene()`.
- `styles.css` sets the palette at the top. The background hue follows scroll position through `--p`.
