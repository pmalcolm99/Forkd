import { formatCents, moneyDisplay, type SplitMathResult } from "@forkd/shared";

/**
 * Hand-rendered HTML for the guest bill page.
 *
 * This page is deliberately self-contained: no Next.js client bundle, no
 * external stylesheet, no JavaScript. Everything it needs is in the document
 * it returns.
 *
 * The reason is the trust boundary. Every other route sits behind Cloudflare
 * Access; this one is reachable by anyone holding a link. A normal Next page
 * would drag ~20 chunks and a stylesheet from /_next/static/ with it, which
 * would each have to be opened up too — turning a narrow hole into a wide one,
 * and making the page break outright wherever those requests are challenged or
 * blocked. Rendering the whole thing server-side keeps the public surface to a
 * single path prefix and makes the page immune to anything that happens to the
 * app bundle.
 *
 * Consequence to keep in mind: because there is no client JS, the running total
 * reflects *saved* state. Ticking a box does not update it until the form is
 * submitted. That is a deliberate trade — the alternative is duplicating the
 * allocation math in an inline script, and two implementations of money
 * arithmetic is precisely the bug we do not want.
 */

/** Escape text for HTML body/attribute context. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface GuestPageItem {
  id: string;
  label: string;
  quantity: number;
  totalCents: number;
  claims: { participantId: string; shares: number }[];
}

export interface GuestPageParticipant {
  id: string;
  displayName: string;
  paidAt: Date | string | null;
  payment: {
    venmoHandle: string | null;
    cashAppHandle: string | null;
    paymentNote: string | null;
  } | null;
}

export interface GuestPageData {
  token: string;
  title: string;
  merchantName: string | null;
  restaurantName: string | null;
  purchasedAt: Date | string | null;
  currency: string;
  homeCurrency: string;
  effectiveFxRate: number | null;
  totalCents: number;
  paidByParticipantId: string | null;
  items: GuestPageItem[];
  participants: GuestPageParticipant[];
  math: SplitMathResult;
  myParticipantId: string;
  myDisplayName: string;
  hasVisibleImages: boolean;
  imageIds: string[];
  /** Set after a successful save so the page can confirm it. */
  flash?: "saved" | "paid" | "unpaid" | null;
}

const STYLES = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;background:#0a0a0a;color:#ededed;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:16px;line-height:1.5;
  /* No top padding: the sticky header owns the top of the page, including the
     safe-area inset. Bottom clearance is generous because the fixed bar is two
     lines tall and there is no JavaScript to measure it — running short hides
     the settle-up card behind the bar. */
  padding:0 max(env(safe-area-inset-right),16px)
          calc(env(safe-area-inset-bottom) + 140px) max(env(safe-area-inset-left),16px);
}
.wrap{max-width:34rem;margin:0 auto}

/* Sticky header. With viewport-fit=cover the page scrolls under the status bar
   and the Dynamic Island, so an opaque bar has to sit there — otherwise the
   clock overlaps whatever scrolls past. It doubles as context: on a long
   receipt the guest can always see which bill they are ticking. */
.top{
  position:sticky;top:0;z-index:20;background:rgba(10,10,10,.97);
  backdrop-filter:saturate(180%) blur(12px);
  -webkit-backdrop-filter:saturate(180%) blur(12px);
  border-bottom:1px solid rgba(255,255,255,.1);
  margin:0 calc(-1 * max(env(safe-area-inset-right),16px)) 1rem
         calc(-1 * max(env(safe-area-inset-left),16px));
  padding:calc(env(safe-area-inset-top) + .6rem) max(env(safe-area-inset-right),16px) .6rem
          max(env(safe-area-inset-left),16px);
}
.topinner{max-width:34rem;margin:0 auto;display:flex;align-items:baseline;gap:.5rem}
.topinner .brand{margin:0;flex:0 0 auto}
.topttl{
  margin:0;font-size:.9rem;font-weight:600;color:#d4d4d8;min-width:0;flex:1 1 auto;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;
}
h1{font-size:1.4rem;line-height:1.25;margin:0 0 .25rem;overflow-wrap:anywhere}
.sub{color:#a1a1aa;font-size:.875rem;margin:0 0 1.25rem;overflow-wrap:anywhere}
.brand{color:#4aab7c;font-weight:700;font-size:1.05rem;margin:0 0 1rem}
.note{color:#a1a1aa;font-size:.875rem;margin:0 0 1rem}
.card{background:#141414;border:1px solid rgba(255,255,255,.1);border-radius:.9rem;padding:1rem;margin:0 0 1rem}
.card h2{font-size:1rem;margin:0 0 .75rem}
.flash{background:#15402b;border:1px solid #2a7d53;color:#ccebd8;border-radius:.7rem;padding:.7rem .9rem;margin:0 0 1rem;font-size:.9rem}
.warn{background:#3a2a10;border:1px solid #7a5a20;color:#f3ddb0;border-radius:.7rem;padding:.7rem .9rem;margin:0 0 1rem;font-size:.9rem}

ul.items{list-style:none;margin:0;padding:0}
li.item{border:1px solid rgba(255,255,255,.1);border-radius:.75rem;margin:0 0 .5rem;background:#141414}
li.item label{display:flex;gap:.75rem;align-items:flex-start;padding:.85rem;cursor:pointer}
li.item input[type=checkbox]{
  appearance:none;-webkit-appearance:none;flex:0 0 auto;
  width:1.4rem;height:1.4rem;margin:.1rem 0 0;border-radius:.4rem;
  border:2px solid #52525b;background:#0a0a0a;position:relative;cursor:pointer;
}
li.item input[type=checkbox]:checked{background:#3d7a52;border-color:#4aab7c}
li.item input[type=checkbox]:checked::after{
  content:"";position:absolute;left:.42rem;top:.15rem;width:.3rem;height:.62rem;
  border:solid #fff;border-width:0 .17rem .17rem 0;transform:rotate(45deg);
}
li.item input[type=checkbox]:focus-visible{outline:3px solid #4d9970;outline-offset:2px}
.itembody{min-width:0;flex:1 1 auto}
.itemrow{display:flex;justify-content:space-between;gap:.6rem;align-items:baseline}
.itemname{font-weight:600;overflow-wrap:anywhere}
.price{font-variant-numeric:tabular-nums;white-space:nowrap}
.meta{margin-top:.3rem;font-size:.78rem;color:#a1a1aa;overflow-wrap:anywhere}
.tag{display:inline-block;background:#262626;border-radius:1rem;padding:.08rem .5rem;margin:.15rem .25rem 0 0;font-size:.75rem}
.tag.split{background:#15402b;color:#a3d9bf}

table.share{width:100%;border-collapse:collapse;font-size:.875rem;table-layout:fixed}
table.share th{text-align:left;font-weight:500;color:#a1a1aa;font-size:.7rem;text-transform:uppercase;padding:0 0 .4rem}
table.share td{padding:.45rem 0;border-top:1px solid rgba(255,255,255,.08);vertical-align:top;overflow-wrap:anywhere}
/* Numeric columns are right-aligned and nowrap, so with no left padding the
   values in adjacent columns butt straight up against each other and read as
   one number ("$25.26$2.84"). The gutter has to be on the left, because the
   right edge is what the alignment pins them to. */
table.share th.num,table.share td.num{
  text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;
  padding-left:.75rem;overflow-wrap:normal;
}
/* Give the name column the slack and keep the money columns to their content. */
table.share th:first-child,table.share td:first-child{width:38%}
tr.me{background:rgba(61,122,82,.14)}
tr.unclaimed td{color:#f3ddb0}
tfoot td{font-weight:700;border-top:2px solid rgba(255,255,255,.18)}

.bar{
  position:fixed;left:0;right:0;bottom:0;background:rgba(10,10,10,.97);
  border-top:1px solid rgba(255,255,255,.12);
  padding:.7rem max(env(safe-area-inset-right),16px)
          calc(env(safe-area-inset-bottom) + .7rem) max(env(safe-area-inset-left),16px);
}
.barinner{max-width:34rem;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:1rem}
.owe{font-size:.72rem;color:#a1a1aa;margin:0}
.oweamt{font-size:1.5rem;font-weight:700;margin:0;font-variant-numeric:tabular-nums}
button.primary,a.btn{
  display:inline-block;background:#3d7a52;color:#fff;border:0;border-radius:.7rem;
  padding:.7rem 1.1rem;font-size:.95rem;font-weight:600;cursor:pointer;
  text-decoration:none;white-space:nowrap;font-family:inherit;
}
button.primary:active,a.btn:active{opacity:.85}
button.primary:focus-visible,a.btn:focus-visible{outline:3px solid #4d9970;outline-offset:2px}
a.btn.sec{background:#262626;color:#ededed}
button.link{background:none;border:0;color:#4aab7c;text-decoration:underline;font-size:.9rem;cursor:pointer;padding:0;font-family:inherit}
.paybtns{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.paid{color:#a3d9bf;font-weight:600;font-size:.9rem}
.footer{color:#71717a;font-size:.75rem;text-align:center;margin:1.5rem 0 0}
@media (min-width:600px){ body{font-size:17px} h1{font-size:1.7rem} }
`;

function fmtDate(d: Date | string | null): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Render the complete guest page document. */
export function renderGuestPage(d: GuestPageData): string {
  const display = moneyDisplay({
    currency: d.currency,
    homeCurrency: d.homeCurrency,
    effectiveFxRate: d.effectiveFxRate,
  });
  const converting = display.converting;
  const money = display.format;

  const nameById = new Map(d.participants.map((p) => [p.id, p.displayName]));
  const shareById = new Map(d.math.participants.map((p) => [p.participantId, p]));
  const mine = shareById.get(d.myParticipantId);
  const payer = d.participants.find((p) => p.id === d.paidByParticipantId) ?? null;
  const me = d.participants.find((p) => p.id === d.myParticipantId) ?? null;

  const subtitle = [
    d.merchantName ?? d.restaurantName,
    fmtDate(d.purchasedAt),
    payer ? `paid by ${payer.displayName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const flash =
    d.flash === "saved"
      ? `<p class="flash">Saved — your picks are recorded. Your total is below.</p>`
      : d.flash === "paid"
        ? `<p class="flash">Marked as paid. Thanks!</p>`
        : d.flash === "unpaid"
          ? `<p class="flash">Marked as not paid yet.</p>`
          : "";

  const itemsHtml = d.items
    .map((item) => {
      const others = item.claims.filter((c) => c.participantId !== d.myParticipantId);
      const isMine = item.claims.some((c) => c.participantId === d.myParticipantId);
      const shareCount = others.length + (isMine ? 1 : 0);
      const perHead = shareCount > 1 ? Math.round(item.totalCents / shareCount) : null;

      const tags = [
        perHead != null
          ? `<span class="tag split">split ${shareCount} ways · ${esc(money(perHead))} each</span>`
          : "",
        ...others.map(
          (c) => `<span class="tag">${esc(nameById.get(c.participantId) ?? "Someone")}</span>`
        ),
        shareCount === 0 ? `<span class="tag">nobody yet</span>` : "",
      ]
        .filter(Boolean)
        .join("");

      const qty = item.quantity > 1 ? `${esc(item.quantity)}× ` : "";

      return `<li class="item"><label>
  <input type="checkbox" name="item" value="${esc(item.id)}"${isMine ? " checked" : ""}>
  <span class="itembody">
    <span class="itemrow">
      <span class="itemname">${qty}${esc(item.label)}</span>
      <span class="price">${esc(money(item.totalCents))}</span>
    </span>
    <span class="meta">${tags}</span>
  </span>
</label></li>`;
    })
    .join("\n");

  const taxLabel = d.math.taxIncluded ? "Tax (incl.)" : "Tax";
  const shareRows = d.participants
    .map((p) => {
      const s = shareById.get(p.id);
      if (!s || s.totalCents === 0) return "";
      const isMe = p.id === d.myParticipantId;
      const badges = [
        p.id === d.paidByParticipantId ? " (paid the bill)" : "",
        p.paidAt ? " ✓ settled" : "",
      ].join("");
      return `<tr class="${isMe ? "me" : ""}">
  <td>${esc(p.displayName)}${esc(badges)}</td>
  <td class="num">${esc(money(s.itemsCents))}</td>
  <td class="num">${esc(money(s.tipCents))}</td>
  <td class="num"><strong>${esc(money(s.totalCents))}</strong></td>
</tr>`;
    })
    .join("\n");

  const unclaimedRow =
    d.math.unassigned.totalCents !== 0
      ? `<tr class="unclaimed">
  <td>Unclaimed<br><small>${esc(d.math.unclaimedItemIds.length)} item${
    d.math.unclaimedItemIds.length === 1 ? "" : "s"
  } nobody has picked</small></td>
  <td class="num">${esc(money(d.math.unassigned.itemsCents))}</td>
  <td class="num">${esc(money(d.math.unassigned.tipCents))}</td>
  <td class="num"><strong>${esc(money(d.math.unassigned.totalCents))}</strong></td>
</tr>`
      : "";

  const venmo = payer?.payment?.venmoHandle?.replace(/^@/, "") || null;
  const cashapp = payer?.payment?.cashAppHandle?.replace(/^\$/, "") || null;
  const payHtml = payer
    ? `<div class="card">
  <h2>Paying ${esc(payer.displayName)} back</h2>
  <div class="paybtns">
    ${venmo ? `<a class="btn sec" rel="noreferrer noopener" target="_blank" href="https://venmo.com/u/${encodeURIComponent(venmo)}">Venmo @${esc(venmo)}</a>` : ""}
    ${cashapp ? `<a class="btn sec" rel="noreferrer noopener" target="_blank" href="https://cash.app/$${encodeURIComponent(cashapp)}">Cash App $${esc(cashapp)}</a>` : ""}
    <form method="post" action="/g/${esc(d.token)}/paid" style="display:inline">
      <input type="hidden" name="paid" value="${me?.paidAt ? "false" : "true"}">
      <button class="primary" type="submit">${me?.paidAt ? "Undo — not paid yet" : "I've paid"}</button>
    </form>
    ${me?.paidAt ? `<span class="paid">✓ marked paid</span>` : ""}
  </div>
  ${payer.payment?.paymentNote ? `<p class="note" style="margin:.75rem 0 0">${esc(payer.payment.paymentNote)}</p>` : ""}
</div>`
    : "";

  const receiptHtml = d.hasVisibleImages
    ? `<div class="card"><h2>Receipt</h2><div class="paybtns">${d.imageIds
        .map(
          (id, i) =>
            `<a class="btn sec" href="/g/${esc(d.token)}/image/${esc(id)}">View photo ${i + 1}</a>`
        )
        .join("")}</div></div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0a0a0a">
<title>Your share · Forkd</title>
<style>${STYLES}</style>
</head>
<body>
<header class="top">
  <div class="topinner">
    <p class="brand">Forkd</p>
    <p class="topttl">${esc(d.title)}</p>
  </div>
</header>
<div class="wrap">
  ${flash}
  <h1>${esc(d.title)}</h1>
  <p class="sub">${esc(subtitle)}</p>

  <p class="note">Hi ${esc(d.myDisplayName)} — tick everything you had, then press Save.
  Ticking something someone else already picked splits it with them.${
    converting
      ? ` Amounts are shown in ${esc(d.homeCurrency)}; the receipt is in ${esc(d.currency)}.`
      : ""
  }</p>

  <!-- The claim form wraps ONLY the checkboxes. The "I've paid" control is its
       own form posting to a different endpoint, and HTML forbids nesting one
       form inside another — a browser silently drops the inner <form> tag and
       adopts its button into the outer form, which would turn "I've paid" into
       a second "Save my picks". The Save button therefore sits outside the form
       and is wired to it by id via the form= attribute. -->
  <form id="claim" method="post" action="/g/${esc(d.token)}/claim">
    <ul class="items">
${itemsHtml || `<li class="item"><label><span class="itembody">This bill has no items yet.</span></label></li>`}
    </ul>
  </form>

  <div class="card">
    <h2>Everyone's share</h2>
    <table class="share">
      <thead><tr><th>Person</th><th class="num">Items</th><th class="num">Tip</th><th class="num">Owes</th></tr></thead>
      <tbody>
${shareRows}
${unclaimedRow}
      </tbody>
      <tfoot><tr><td>Total</td><td class="num"></td><td class="num"></td><td class="num">${esc(money(d.math.grandTotalCents))}</td></tr></tfoot>
    </table>
    ${d.math.taxIncluded ? `<p class="note" style="margin:.75rem 0 0">${esc(taxLabel)} was already included in the item prices, so it isn't added again.</p>` : ""}
    <p class="note" style="margin:.5rem 0 0">Receipt total ${esc(formatCents(d.totalCents, d.currency))}${
      converting ? ` (${esc(money(d.totalCents))})` : ""
    }</p>
  </div>

  ${payHtml}
  ${receiptHtml}

  <p class="footer">Forkd · this link is private to you — please don't pass it on.</p>

  <div class="bar">
    <div class="barinner">
      <div>
        <p class="owe">Your share (saved)</p>
        <p class="oweamt">${esc(money(mine?.totalCents ?? 0))}</p>
      </div>
      <button class="primary" type="submit" form="claim">Save my picks</button>
    </div>
  </div>
</div>
</body>
</html>`;
}

/** Minimal standalone page for a dead/expired link or an error. */
export function renderGuestMessage(heading: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark">
<title>Forkd</title>
<style>${STYLES}
/* This page has no sticky header and no fixed bar, so it takes its own insets
   back — the shared rule zeroes the top and reserves 140px at the bottom. */
body{
  display:flex;align-items:center;justify-content:center;min-height:100svh;text-align:center;
  padding-top:calc(env(safe-area-inset-top) + 16px);
  padding-bottom:calc(env(safe-area-inset-bottom) + 16px);
}
</style>
</head>
<body><div class="wrap">
  <p class="brand">Forkd</p>
  <h1>${esc(heading)}</h1>
  <p class="sub">${esc(body)}</p>
</div></body>
</html>`;
}
