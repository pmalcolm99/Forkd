import { chromium } from "playwright-core";
import http from "node:http";

export type ScrapeResult = {
  title: string;
  bodyText: string;
};

// Chrome's DevTools HTTP endpoint rejects non-localhost Host headers (DNS-rebinding protection).
// Neither fetch nor undici allows overriding Host. node:http does.
// We fetch /json/version with Host: localhost, extract the browser WS URL, then swap
// 127.0.0.1 back to the real container hostname. Chrome accepts WS connections from any host.
function httpGetJson(hostname: string, port: number, path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path, headers: { Host: "localhost" } }, (res) => {
      let raw = "";
      res.on("data", (chunk: Buffer) => (raw += chunk.toString()));
      res.on("end", () => {
        if (res.statusCode !== 200) reject(new Error(`Chrome ${path} returned ${res.statusCode}`));
        else resolve(JSON.parse(raw));
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function getWsEndpoint(cdpEndpoint: string): Promise<string> {
  const { hostname, port } = new URL(cdpEndpoint);
  const info = (await httpGetJson(hostname, parseInt(port || "80", 10), "/json/version")) as {
    webSocketDebuggerUrl: string;
  };
  // webSocketDebuggerUrl uses 127.0.0.1; replace with the real container hostname
  return info.webSocketDebuggerUrl.replace("127.0.0.1", hostname).replace("[::1]", hostname);
}

export async function scrapePost(url: string): Promise<ScrapeResult> {
  const cdpEndpoint = process.env.CHROME_CDP_ENDPOINT;
  if (!cdpEndpoint) throw new Error("CHROME_CDP_ENDPOINT is not set");

  const wsUrl = await getWsEndpoint(cdpEndpoint);
  const browser = await chromium.connectOverCDP(wsUrl);
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const title = await page.title();
    const bodyText = await page.locator("body").innerText();
    await page.close();
    return { title, bodyText: bodyText.slice(0, 8_000) };
  } finally {
    await browser.close();
  }
}
