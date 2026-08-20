# Remito

Static deployment files:

- `index.html` — page structure
- `styles.css` — all visual styles
- `app.js` — calculator, settings, flags, and Google Finance rate logic

## GitHub Pages

Upload these three files to the root of the repository and enable GitHub Pages for the branch. Keep all three files in the same directory.

## Live-rate reliability

The app reads the Google Finance CAD/USD quote through multiple CORS readers in parallel, retries failures, stores the last successful quote in browser storage, refreshes every five minutes, and refreshes again when the browser reconnects or the tab becomes active. The calculator continues using the last successful rate if a live reader is temporarily unavailable.
