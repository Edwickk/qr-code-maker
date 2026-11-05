# QR Studio

QR Studio is a browser-based QR label designer. It creates QR codes locally, imports CSV and XLSX records, lays labels out on paper, and prints through the browser.

## Start the app

```sh
npm install
npm run dev
```

The development server listens on the local network. Vite prints the local and network URLs when it starts. To build a static production version, run `npm run build`; the output is in `dist/`. Preview that build with `npm run preview`.

## Project map

- `src/App.jsx` — application shell, navigation, standalone QR generator, and history.
- `src/LabelStudio.jsx` — label editor, CSV/XLSX import, page setup, print preview, templates, and exports.
- `src/App.css` and `src/LabelStudio.css` — workspace and label studio styles.
- `src/index.css` — global styles and typography.
- `src/main.jsx` — React entry point.
- `vite.config.js` — Vite and React configuration.

## Main libraries

- `qrcode` generates QR images in the browser.
- `papaparse` reads CSV files; `read-excel-file` reads XLSX workbooks.
- `jszip` packages batch PNG exports.
- `lucide-react` supplies interface icons.

Label geometry is stored in millimeters for print layout. The editor displays and accepts physical measurements in inches, converting them to millimeters internally. Saved designs and templates use browser storage.

## Private Vercel deployment

The Vercel routing proxy protects the app and its static assets with a password login. Before deploying, add these environment variables in **Vercel → Project → Settings → Environment Variables**:

- `SITE_PASSWORD` — the password users enter on the login screen.
- `SITE_SESSION_SECRET` — a separate long, random secret used to sign 12-hour login sessions.

Add both variables to the Production environment (and Preview too if preview deployments should also be private), then redeploy. If either variable is missing, the app stays locked and explains what needs configuring. The Vercel middleware runs on deployments; the regular Vite development server is not password-protected.

## Formatting

Run `npm run format` to format source files and project configuration with Prettier.
