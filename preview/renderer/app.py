import asyncio
import base64
import hmac
import ipaddress
import os
from urllib.parse import urlsplit

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

app = FastAPI(title="LinkSentry Isolated Preview")
capture_limit = asyncio.Semaphore(1)


class PreviewRequest(BaseModel):
    url: str = Field(min_length=4, max_length=2048)


def validate_url(raw: str) -> str:
    value = raw.strip()
    if "://" not in value:
        value = "https://" + value

    try:
        parts = urlsplit(value)
        host = (parts.hostname or "").rstrip(".").lower()
        port = parts.port
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid website address.")

    if parts.scheme not in {"http", "https"} or not host:
        raise HTTPException(status_code=422, detail="Use an HTTP or HTTPS website address.")
    if parts.username or parts.password:
        raise HTTPException(status_code=422, detail="URLs with embedded credentials are not accepted.")
    if port and port not in {80, 443}:
        raise HTTPException(status_code=422, detail="Only standard web ports 80 and 443 are supported.")

    try:
        host = host.encode("idna").decode("ascii")
        address = ipaddress.ip_address(host)
        if not address.is_global:
            raise HTTPException(status_code=422, detail="Private or non-public IP addresses are blocked.")
    except ValueError:
        if (
            "." not in host
            or len(host) > 253
            or host == "localhost"
            or host.endswith((".localhost", ".local", ".internal", ".test"))
            or any(not label or len(label) > 63 for label in host.split("."))
        ):
            raise HTTPException(status_code=422, detail="Use a public website domain.")

    return value


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/screenshot")
async def screenshot(
    request: PreviewRequest,
    authorization: str | None = Header(default=None),
):
    expected = os.getenv("PREVIEW_SERVICE_TOKEN", "").strip()
    if not expected or not authorization or not hmac.compare_digest(
        authorization, f"Bearer {expected}"
    ):
        raise HTTPException(status_code=401, detail="Unauthorized.")

    url = validate_url(request.url)

    async with capture_limit:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(
                headless=True,
                proxy={"server": "http://proxy:3128"},
                args=["--proxy-bypass-list=<-loopback>"],
            )
            try:
                context = await browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    device_scale_factor=1,
                    service_workers="block",
                    accept_downloads=False,
                    ignore_https_errors=False,
                )

                async def allow_web_requests(route):
                    scheme = urlsplit(route.request.url).scheme.lower()
                    if scheme in {"http", "https", "data", "blob", "about"}:
                        await route.continue_()
                    else:
                        await route.abort()

                await context.route("**/*", allow_web_requests)
                page = await context.new_page()
                page.set_default_timeout(12_000)

                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=15_000)
                except PlaywrightTimeoutError:
                    pass

                await page.wait_for_timeout(1200)
                image = await page.screenshot(
                    type="jpeg",
                    quality=72,
                    full_page=False,
                    animations="disabled",
                    timeout=8_000,
                )
                if len(image) > 1_500_000:
                    raise HTTPException(status_code=502, detail="Preview image was too large.")

                return {
                    "image": base64.b64encode(image).decode("ascii"),
                    "contentType": "image/jpeg",
                }
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code=502, detail="A preview could not be captured.")
            finally:
                await browser.close()
