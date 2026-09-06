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

---

## Home access: workshop day checklist

Full background in `HOME-ACCESS.md`. This is the no-subdomain flow: the
address is `https://93120050.online`. Done once; after that it starts with
Windows on its own.

**Tonight, at home**

1. Commit and push today's changes.
2. Optional: delete the `jobcard-test` tunnel in Cloudflare.

**A. Free up the bare domain name (browser, any PC)**

3. dash.cloudflare.com → click `93120050.online`.
4. Left menu → **DNS → Records**.
5. Row **A** with `162.255.119.156` → **Delete** → confirm.
6. Row **CNAME** named `www` → **Delete** → confirm.
7. Leave the 5 MX rows and the TXT row alone (email).

**B. Update the app on the workshop PC**

8. PowerShell in the app folder.
9. `git pull`
10. `cd client` then `npm run build:electron`
11. Run the installer it produces, same as always.
12. Open the app, sign in as admin, confirm it works.

**C. Create the real tunnel (browser)**

13. one.dash.cloudflare.com → **Networks → Tunnels**.
14. **Create a tunnel**.
15. Pick **Cloudflared**, Next.
16. Name `jobcards`, **Save tunnel**.
17. Click **Windows 64-bit**.
18. Copy only the long key after `service install`. Leave page open.

**D. Install the tunnel on the workshop PC**

19. File Explorer → the app folder.
20. Double-click `setup-home-access.bat`.
21. "Allow changes?" → **Yes**.
22. Black window downloads the tunnel program.
23. "Paste the key here" → right-click to paste, Enter.
24. **All done** → press any key.
25. Browser page shows **Healthy**. Click **Next**.

**E. Point the address at the app (browser)**

26. Tab **Published applications**.
27. Subdomain: **leave empty**.
28. Domain: pick `93120050.online`.
29. Path: leave empty.
30. Type: **HTTPS**.
31. URL: `localhost:443`.
32. Expand **Origin request and connection settings**.
33. **TLS → No TLS Verify** on.
34. **Complete setup**.

**F. Switch it on in the app (workshop PC)**

35. App → sign in as admin → **Settings → Home Access**.
36. Address: `https://93120050.online`. Save.
37. Home access code, 8+ characters. Save.
38. Write the code down. Hand it out in person.

**G. Test before you leave**

39. Phone, Wi-Fi off.
40. Open `https://93120050.online`.
41. Sign-in shows the **Home access code** box.
42. Code + PIN. You're in.
43. Restart the workshop PC, wait a minute, phone again. Still in.

**If it fails**

- Page won't load: step 25 wasn't Healthy, rerun the bat.
- "502 bad gateway": app not running, or step 30/31 wrong.
- No code box: step 33 off, or address typed with `http`.
- "Home access switched off": step 37 not saved.
- Step 34 says name in use: steps 5 and 6 not done.

**Home test PC (optional)**

`npm run prod` runs the app the same way the installed one does (HTTPS on
443). Tunnel `jobcard-test` → `https://test.93120050.online`. Both tunnels
work at once; test only stops when its tunnel is deleted or `npm run prod`
is closed.
