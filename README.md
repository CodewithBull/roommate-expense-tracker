# Hostel Hisab 🏠₹

**Monthly hisab for hostel rooms, PGs and shared flats in India — split rent, bijli, doodh and mess, and settle up in the fewest UPI payments.**

No sign-up. No server. No app to install from a store. Your kharcha lives only in your browser, works completely offline, and at the end of the month you get a ready-to-paste WhatsApp message with UPI payment links.

## Why this exists

Every hostel room / PG / shared flat in India has the same month-end scene:
one person paid the rent, another paid the bijli bill, the doodhwala's hisab is on a paper diary, the mess bill is in someone's WhatsApp — and then four people spend an evening doing maths on a calculator and still end up with "tu mujhe de, main usko dunga" chains.

Hostel Hisab replaces that with: note expenses as they happen, and at month-end get the **minimum number of payments** that settles everyone.

## Features

- **Roommates** — add members, optionally store each person's UPI ID for payment links
- **Expenses** — title, amount (₹), paid-by, date, and categories made for this life: Rent, Bijli / Electricity, Doodh / Milk, Khana / Mess, Safai, Other
- **Equal or custom splits** — split equally, or give each person an exact share (Kabir ate double biryani? He pays double)
- **Month filter** — see one month at a time, with its total
- **Per-member balances** — who gets back money, who owes, who is settled
- **Debt simplification** — the settlement is computed so the whole room clears in the fewest transfers (see below)
- **WhatsApp-ready message** — one tap copies a formatted settlement message with a `upi://pay` link per payment; also opens directly in WhatsApp
- **Offline-first PWA** — installable, works with no internet after the first load (service worker caches the app shell)
- **Your data stays yours** — everything is in `localStorage`; export / import a JSON backup when you change phones
- **Demo data** — one button loads a realistic month: 4 roommates in a PG, rent ₹12,000, UPPCL bijli bill ₹1,846, doodh ₹1,560, mess ₹8,000, and more

## Screenshots

_Photos coming soon — drop PNGs into `screenshots/` and link them here._

| Home / expenses | Settlement |
|---|---|
| `screenshots/expenses.png` (placeholder) | `screenshots/settlement.png` (placeholder) |

## Run it

No build step, no dependencies.

**Option 1 — just open it**

```bash
# Clone, then double-click index.html — or:
open index.html          # macOS
xdg-open index.html      # Linux
```

> Note: opening via `file://` works fully except the service worker (browsers only allow service workers over http/https/localhost), so offline-install needs Option 2.

**Option 2 — serve it locally (enables the PWA / offline mode)**

```bash
cd hostel-hisab
python3 -m http.server 8000
# then visit http://localhost:8000
```

Deploy it anywhere static files are hosted (GitHub Pages, Netlify, Vercel) — there is no backend.

## How settlement works

Say the room has 4 people. This month:

| Expense | Amount | Paid by | Split |
|---|---|---|---|
| Rent | ₹12,000 | Aarav | equally (₹3,000 each) |
| Bijli bill | ₹1,846 | Kabir | equally (₹461.50 each) |
| Doodh | ₹1,560 | Meera | equally (₹390 each) |

Each person's share is ₹3,000 + ₹461.50 + ₹390 = ₹3,851.50, so the net balances (paid − share) are: Aarav **+₹8,148.50**, Kabir **−₹2,005.50**, Meera **−₹2,291.50**, Rohan **−₹3,851.50**… and instead of every person paying every other person (up to 12 transfers in a 4-person room), the greedy largest-first algorithm in [`js/settle.js`](js/settle.js) matches the biggest debtor to the biggest creditor first. Every transfer fully settles at least one side, so you never need more than *(people with a balance − 1)* payments:

```
Rohan → Aarav : ₹3,851.50
Meera → Aarav : ₹2,291.50
Kabir → Aarav : ₹2,005.50
```

Three payments, hisab khatam. The WhatsApp message the app generates contains a UPI deep link for each of these, so the payer can tap and pay the exact amount.

## Tests

The settlement maths is a pure JS module with **no DOM dependencies**, tested in Node:

```bash
node --test tests/settle.test.js
```

Covered: equal split (including paise-remainder handling), unequal/custom split validation, minimum-transfer simplification, and the zero-balance case.

## Tech notes

- Pure HTML / CSS / JS — no framework, no bundler, no npm install
- Data: `localStorage` key `hostel-hisab-v1`; **no data ever leaves the device** — there is no analytics, no server, no account
- PWA: `manifest.json` + `service-worker.js` cache the app shell (cache-first with network refresh); user data is never cached by the worker
- Money: all calculations rounded to paise (2 decimals); equal-split remainders go to the last member so shares always sum exactly to the bill
- Settlement algorithm: greedy largest-creditor / largest-debtor matching in `js/settle.js` (`computeBalances` → `simplifyDebts`)
- Accessibility: labelled inputs everywhere, `aria-live` status messages, visible focus rings, works keyboard-only

## Roadmap

- [ ] Recurring monthly expenses (rent, Wi-Fi) added automatically
- [ ] Per-category monthly summary chart
- [ ] Hindi / Hinglish UI toggle
- [ ] Share a read-only month summary as an image card
- [ ] Optional multi-device sync — only if it can stay local-first

## Licence

MIT — see [LICENSE](LICENSE). Use it for your room, your PG, your mess.
