# DH Engineering Job Cards — How to Run

Everything you need fits on this page. Same commands on Mac and Windows.

---

## First time only

Install Node.js 18 or newer from https://nodejs.org

That's it. No other setup required — the app installs its own bits the first time you run it.

---

## Day-to-day use

Open a terminal in this folder, then:

```
npm run lan
```

What happens:

1. The app builds itself (only if you changed code since last time).
2. A desktop window opens — use it like any normal app.
3. The terminal prints a web address, e.g. `http://192.168.1.42:3000`.
4. Anyone on the same Wi-Fi can open that address in Chrome / Edge and use the app at the same time.

**First time only:** Mac may pop up a "Allow incoming connections?" prompt — click **Allow**, otherwise other PCs can't reach it.

---

## Stop it

- Close the desktop window, **or**
- Press `Ctrl+C` in the terminal.

Either way, both the desktop and the web access shut down together.

---

## Logging in

Default account on a fresh install:

- Username: `admin`
- PIN: `1234`

Change it from the app's Settings page once you're in.

---

## Filling with test data (optional)

If you want fake customers, jobs, suppliers to play with:

```
npm run seed
```

Or, just the supporting data without any sample jobs:

```
npm run seed:empty
```

Both ask "Are you sure?" before wiping the existing database.

---

## Other commands (rarely needed)

| Command | When you'd use it |
|---|---|
| `npm run lan -- --rebuild` | Force a fresh rebuild even if nothing changed (paranoia mode). |
| `npm run server` | Run the server only, no desktop window. For a headless box. |
| `npm run build` | Build the app without starting it. |
| `npm run reset-password` | Reset the admin login back to `admin` / `1234`. |
| `npm start` | Developer mode — live code reload, but no LAN sharing. |

---

## Troubleshooting

**Other PCs can't open the web address**
- Check they're on the same Wi-Fi.
- Check the macOS / Windows firewall isn't blocking the connection (the first launch should have prompted; you may need to allow it manually in System Settings → Network → Firewall).
- Guest Wi-Fi networks often isolate devices — won't work.

**The app shows old behaviour after I changed code**
- Run `npm run lan -- --rebuild` once to force a fresh build.

**Camera button doesn't work from another PC**
- Browsers only allow camera access on the local machine or over HTTPS. Take the photo on the device's camera app and upload it via the normal "Add file" button instead.

**Folder picker missing in Settings (from a browser)**
- The native folder picker only exists in the desktop window. Type the folder path manually, or set it up once from the Mac's desktop window.
