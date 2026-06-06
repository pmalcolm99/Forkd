import { chromium } from "playwright-core";

export type ScrapeResult = {
  title: string;
  bodyText: string;
};

export async function scrapePost(url: string): Promise<ScrapeResult> {
  const wsEndpoint = process.env.CHROME_WS_ENDPOINT;
  if (!wsEndpoint) throw new Error("CHROME_WS_ENDPOINT is not set");

  const browser = await chromium.connectOverCDP(wsEndpoint);
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
