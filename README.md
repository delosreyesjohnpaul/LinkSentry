# LinkSentry

A first local prototype for checking URL reputation and domain signals. The web interface uses Next.js and TypeScript; the scanner API uses Python and FastAPI.

## Start the scanner API

```bash
cd scanner
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

On Windows, copy `.env.example` to `.env` instead of using `cp`.

## Start the web app

In a second terminal from the project root:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The scanner API defaults to `http://localhost:8000`; set `NEXT_PUBLIC_SCANNER_API_URL` if it runs elsewhere.

## Threat reputation

Add a VirusTotal API key to `scanner/.env` as `VIRUSTOTAL_API_KEY=...` to enable lookups of existing URL reports. The prototype does not submit new URLs to VirusTotal. Without a key, threat reputation is shown as unavailable and the app returns **Not enough data** unless the URL itself has obvious warning patterns.

## Scope and safety

- The first version does not open or fetch the submitted website. It performs DNS-over-HTTPS queries and optional reputation lookups only.
- Page titles, redirects, screenshots, certificate details, and IP network/ASN attribution are not implemented yet.
- A low result means only that the configured checks found no known threat; it is not a guarantee the site is safe.
- Before public deployment, add rate limits, abuse monitoring, API-key protection, scan quotas, and stricter origin settings. Page inspection should run in a separate locked-down worker/container with outbound-network controls.
