import { describe, expect, it } from "vitest";
import { computeSplit } from "@forkd/shared";
import { esc, renderGuestMessage, renderGuestPage, type GuestPageData } from "./guestPageHtml";

function makeData(over: Partial<GuestPageData> = {}): GuestPageData {
  const items = [
    {
      id: "i1",
      label: "Schnitzel",
      quantity: 1,
      totalCents: 2690,
      claims: [{ participantId: "me", shares: 1 }],
    },
    {
      id: "i2",
      label: "Gulasch",
      quantity: 1,
      totalCents: 1280,
      claims: [{ participantId: "p2", shares: 1 }],
    },
    { id: "i3", label: "Sekt", quantity: 1, totalCents: 690, claims: [] },
  ];
  const participants = [
    { id: "me", displayName: "Kim", paidAt: null, payment: null },
    {
      id: "p2",
      displayName: "Preston",
      paidAt: null,
      payment: { venmoHandle: "preston-m", cashAppHandle: "prestonm", paymentNote: "or Zelle" },
    },
  ];
  const math = computeSplit({
    items: items.map((i) => ({ id: i.id, totalCents: i.totalCents, claims: i.claims })),
    participantIds: ["me", "p2"],
    taxCents: 0,
    tipCents: 466,
    serviceCents: 0,
    discountCents: 0,
    tipMode: "proportional",
    taxMode: "proportional",
    partySize: null,
  });
  return {
    token: "tok_abc123",
    title: "Dinner",
    merchantName: "Gasthaus Pöschl",
    restaurantName: null,
    purchasedAt: "2026-08-15T12:00:00.000Z",
    currency: "EUR",
    homeCurrency: "USD",
    effectiveFxRate: null,
    totalCents: 5126,
    paidByParticipantId: "p2",
    items,
    participants,
    math,
    myParticipantId: "me",
    myDisplayName: "Kim",
    hasVisibleImages: false,
    imageIds: [],
    flash: null,
    ...over,
  };
}

describe("esc", () => {
  it("neutralises every HTML-significant character", () => {
    expect(esc(`<script>"x"&'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;"
    );
  });

  it("handles null and undefined without printing them oddly", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
});

describe("renderGuestPage — self-containment", () => {
  const html = renderGuestPage(makeData());

  it("pulls nothing from /_next/static — that is the entire point", () => {
    expect(html).not.toContain("/_next/");
  });

  it("ships no JavaScript at all", () => {
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html).not.toMatch(/\son[a-z]+=/i); // no inline event handlers either
  });

  it("has no external resource references of any kind", () => {
    const external =
      html.match(/(?:src|href)="(?!\/g\/|https:\/\/venmo|https:\/\/cash)[^"]*"/g) ?? [];
    expect(external).toEqual([]);
  });

  it("carries its styling inline so a blocked stylesheet cannot break it", () => {
    expect(html).toContain("<style>");
    expect(html).toContain("background:#0a0a0a");
  });

  it("is a complete document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain("</html>");
  });
});

describe("renderGuestPage — mobile layout", () => {
  const html = renderGuestPage(makeData());

  it("puts a gutter on the numeric columns so adjacent values can't run together", () => {
    // Right-aligned nowrap cells with no left padding render as "$25.26$2.84".
    expect(html).toMatch(/table\.share th\.num,table\.share td\.num\{[^}]*padding-left:\.75rem/);
  });

  it("carries a sticky header so the bill stays identified while scrolling", () => {
    expect(html).toContain('<header class="top">');
    expect(html).toMatch(/\.top\{[^}]*position:sticky/);
    expect(html).toMatch(/\.top\{[^}]*top:0/);
    // Opaque, because with viewport-fit=cover the page scrolls under the
    // status bar and the clock would otherwise overlap the content.
    expect(html).toMatch(/\.top\{[^}]*background:rgba\(10,10,10,\.97\)/);
  });

  it("insets the header for the notch rather than letting content sit under it", () => {
    expect(html).toMatch(/\.top\{[^}]*padding:calc\(env\(safe-area-inset-top\)/);
  });

  it("reserves enough room at the bottom for the fixed bar", () => {
    // The bar is two lines plus padding; 96px was short enough that the
    // settle-up card sat behind it.
    const m = /calc\(env\(safe-area-inset-bottom\) \+ (\d+)px\)/.exec(html);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(130);
  });

  it("names the bill in the sticky header, escaped", () => {
    const evil = renderGuestPage(makeData({ title: `<script>x</script>` }));
    expect(evil).toMatch(/<p class="topttl">&lt;script&gt;/);
  });
});

describe("renderGuestPage — XSS", () => {
  it("escapes a malicious item label", () => {
    const d = makeData();
    d.items[0]!.label = `<img src=x onerror="alert(1)">`;
    const html = renderGuestPage(d);
    // The payload survives as inert text, never as markup: the angle brackets
    // and quotes that would be needed to form a tag or an attribute are gone.
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    // No attribute can have been created, because no raw quote survives it.
    expect(html).not.toMatch(/onerror="/);
  });

  it("escapes a malicious participant name", () => {
    const d = makeData();
    d.participants[1]!.displayName = `</td><script>alert(1)</script>`;
    const html = renderGuestPage(d);
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("escapes a malicious bill title and merchant", () => {
    const html = renderGuestPage(
      makeData({ title: `"><script>bad()</script>`, merchantName: `<b>x</b>` })
    );
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html).not.toContain("<b>x</b>");
  });

  it("escapes a payment note", () => {
    const d = makeData();
    d.participants[1]!.payment!.paymentNote = `<script>x</script>`;
    expect(renderGuestPage(d).toLowerCase()).not.toContain("<script");
  });

  it("url-encodes payment handles rather than interpolating them raw", () => {
    const d = makeData();
    d.participants[1]!.payment!.venmoHandle = `a"onmouseover="x`;
    const html = renderGuestPage(d);
    expect(html).not.toContain(`"onmouseover="`);
  });
});

describe("renderGuestPage — content", () => {
  it("pre-ticks the items this guest already claimed, and only those", () => {
    const html = renderGuestPage(makeData());
    expect(html).toMatch(/value="i1"\s+checked/);
    expect(html).not.toMatch(/value="i2"\s+checked/);
    expect(html).not.toMatch(/value="i3"\s+checked/);
  });

  it("posts back to a path under /g/ so only that prefix must be public", () => {
    const html = renderGuestPage(makeData());
    expect(html).toContain('action="/g/tok_abc123/claim"');
    expect(html).toContain('action="/g/tok_abc123/paid"');
  });

  /**
   * Locate each <form>…</form> as a character range, ignoring HTML comments.
   *
   * This workspace's tests run in the node environment with no DOM parser, so
   * the structure is checked directly on the markup. That is enough here because
   * we generate this HTML ourselves and it is small and regular.
   */
  function formRanges(raw: string) {
    const html = raw.replace(/<!--[\s\S]*?-->/g, "");
    const ranges: { action: string; start: number; end: number }[] = [];
    const re = /<form\b[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const end = html.indexOf("</form>", m.index);
      ranges.push({
        action: /action="([^"]*)"/.exec(m[0])?.[1] ?? "",
        start: m.index,
        end: end === -1 ? html.length : end,
      });
    }
    return { html, ranges };
  }

  // A nested <form> is invalid HTML that every browser silently repairs by
  // dropping the inner tag and adopting its button into the outer form — so the
  // markup can read perfectly while "I've paid" actually submits the claim form.
  // String-matching the actions cannot see that; checking the ranges can.
  it("never nests one form inside another", () => {
    const { ranges } = formRanges(renderGuestPage(makeData()));
    expect(ranges.map((r) => r.action)).toEqual(["/g/tok_abc123/claim", "/g/tok_abc123/paid"]);
    for (let i = 1; i < ranges.length; i++) {
      // Each form must start after the previous one has closed.
      expect(ranges[i]!.start).toBeGreaterThan(ranges[i - 1]!.end);
    }
  });

  it("keeps every item checkbox inside the claim form", () => {
    const { html, ranges } = formRanges(renderGuestPage(makeData()));
    const claim = ranges.find((r) => r.action.endsWith("/claim"))!;
    const positions: number[] = [];
    const re = /<input type="checkbox" name="item"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) positions.push(m.index);
    expect(positions).toHaveLength(3);
    for (const p of positions) {
      expect(p > claim.start && p < claim.end).toBe(true);
    }
  });

  it("wires the Save button to the claim form even though it sits outside it", () => {
    const { html, ranges } = formRanges(renderGuestPage(makeData()));
    const claim = ranges.find((r) => r.action.endsWith("/claim"))!;
    const save = html.indexOf("Save my picks");
    // It is outside the form element (it lives in the sticky bar)...
    expect(save > claim.end).toBe(true);
    // ...so it must carry form="claim" or pressing it would do nothing at all.
    expect(html.slice(0, save)).toMatch(/<button[^>]*form="claim"[^>]*>$/);
  });

  it("puts the paid button inside the paid form and nowhere else", () => {
    const { html, ranges } = formRanges(renderGuestPage(makeData()));
    const paid = ranges.find((r) => r.action.endsWith("/paid"))!;
    const btn = html.indexOf("I've paid");
    expect(btn > paid.start && btn < paid.end).toBe(true);
  });

  it("shows the saved share, and names the guest", () => {
    const html = renderGuestPage(makeData());
    expect(html).toContain("Hi Kim");
    expect(html).toContain("Your share (saved)");
  });

  it("labels a co-claimed item with the split and the other person", () => {
    const d = makeData();
    d.items[0]!.claims = [
      { participantId: "me", shares: 1 },
      { participantId: "p2", shares: 1 },
    ];
    d.math = computeSplit({
      items: d.items.map((i) => ({ id: i.id, totalCents: i.totalCents, claims: i.claims })),
      participantIds: ["me", "p2"],
      taxCents: 0,
      tipCents: 466,
      serviceCents: 0,
      discountCents: 0,
      tipMode: "proportional",
      taxMode: "proportional",
      partySize: null,
    });
    const html = renderGuestPage(d);
    expect(html).toContain("split 2 ways");
    expect(html).toContain("Preston");
  });

  it("surfaces unclaimed items rather than hiding them", () => {
    expect(renderGuestPage(makeData())).toContain("Unclaimed");
  });

  it("notes when tax was already inside the prices", () => {
    const d = makeData();
    d.math = { ...d.math, taxIncluded: true };
    expect(renderGuestPage(d)).toContain("already included in the item prices");
  });

  it("shows converted amounts and says so when an FX rate applies", () => {
    const html = renderGuestPage(makeData({ effectiveFxRate: 1.18 }));
    expect(html).toContain("the receipt is in EUR");
    expect(html).toContain("$");
  });

  it("offers pay-back links for the payer only", () => {
    const html = renderGuestPage(makeData());
    expect(html).toContain("venmo.com/u/preston-m");
    expect(html).toContain("Paying Preston back");
  });

  it("flips the paid button to an undo once settled", () => {
    const d = makeData();
    d.participants[0]!.paidAt = new Date();
    const html = renderGuestPage(d);
    expect(html).toContain("Undo — not paid yet");
    expect(html).toContain('value="false"');
  });

  it("confirms a save via the flash message", () => {
    expect(renderGuestPage(makeData({ flash: "saved" }))).toContain("Saved");
  });

  it("copes with a bill that has no items", () => {
    const d = makeData({ items: [] });
    d.math = computeSplit({
      items: [],
      participantIds: ["me", "p2"],
      taxCents: 0,
      tipCents: 0,
      serviceCents: 0,
      discountCents: 0,
      tipMode: "proportional",
      taxMode: "proportional",
      partySize: null,
    });
    expect(renderGuestPage(d)).toContain("no items yet");
  });

  it("links receipt photos under /g/ when they are visible", () => {
    const html = renderGuestPage(makeData({ hasVisibleImages: true, imageIds: ["img1"] }));
    expect(html).toContain("/g/tok_abc123/image/img1");
  });

  it("omits the receipt section when photos are hidden", () => {
    expect(renderGuestPage(makeData())).not.toContain("/image/");
  });
});

describe("renderGuestMessage", () => {
  it("renders a self-contained dead-link page", () => {
    const html = renderGuestMessage("This link isn't active", "Ask for a fresh one.");
    expect(html).not.toContain("/_next/");
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html).toContain("This link isn&#39;t active");
  });
});
