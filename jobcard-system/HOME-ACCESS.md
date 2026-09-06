# Home access (reach the app from outside the office)

The app stays on the workshop computer. A Cloudflare Tunnel running on that
computer lets a home browser reach it at a fixed web address. Nothing is
opened on the office router, and nothing is installed on home computers.

Cost: the domain name only (a few dollars a year). Cloudflare's part is free.

## One-time setup (about 30 minutes)

### A. Domain and Cloudflare account

1. Buy a domain name anywhere (e.g. `93120050.online`).
2. Sign up free at cloudflare.com and click **Add a domain**. Type the domain.
3. Cloudflare shows two "nameserver" names. In the registrar's control panel
   (where you bought the domain), replace its nameservers with those two.
   Wait until Cloudflare says the domain is active (minutes to a few hours).

### B. The tunnel, on the workshop computer

4. Open one.dash.cloudflare.com → **Networks → Tunnels → Create a tunnel**.
5. Choose **Cloudflared**, name it `jobcards`, save.
6. Copy the **Windows** install command it shows.
7. On the workshop computer: search **PowerShell**, right-click → *Run as
   administrator*, paste the command, press Enter. It installs as a Windows
   service that starts with Windows and stays up whether the app is open or not.
8. Back in the browser the tunnel shows **Healthy**.

### C. Point the address at the app

9. Same page → **Public Hostname → Add**.
10. Subdomain `jobs`, domain: yours (gives `jobs.93120050.online`).
11. Service type **HTTPS**, URL `localhost:443`.
12. **Additional application settings → TLS → No TLS Verify: on.** (The app
    uses its own locally-minted certificate; the tunnel must accept it.)
13. Save.

### D. In the app

14. Sign in as an admin → **Settings → Home Access**.
15. Type the address (`https://jobs.93120050.online`) and save it, so staff
    can see where to go.
16. Choose a **home access code** (8+ characters) and save it. Nobody can sign
    in from home until one is set.

### E. Optional extra lock: Cloudflare's email gate

Free, up to 50 people. Visitors must first enter a code emailed to them.

17. **Access → Applications → Add → Self-hosted**, name `Job Cards`, domain
    `jobs.93120050.online`.
18. Add a policy: Allow → Emails → list each home user's email. Save.

## What a home user does

Open the address in any browser → (email code, if step E was done) → the
normal sign-in appears with an extra **Home access code** box → type the
code and their PIN. Office computers never see that box.

## Switching it off

- Quick: Settings → Home Access → clear the code → **Switch off**. The tunnel
  stays up but every home sign-in is refused.
- Fully: in Cloudflare delete the tunnel, then on the workshop computer run
  `cloudflared service uninstall` in an administrator PowerShell.
