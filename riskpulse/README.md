# RiskPulse 3

Risk decision-support application with separate executive and government surfaces.

## Run

Requires Node.js 22+ and Python 3.10+ for the optional desktop connector. No Node dependencies are required.

```powershell
npm run build
npm run dev
```

Open http://127.0.0.1:4173. To use local vendor adapters, stop the dev server and run `npm run desktop` instead. The desktop launcher runs an authenticated loopback-only Python helper on port 4174. It does not expose the terminal to the hosted website.

## Actual coverage

- Government monitor: server-retrieved OFR FSI, New York Fed SOFR, ECB FX references. Observation dates and retrieval dates are distinct. Public references are not executable quotes.
- Global directory: the complete downloaded ISO 10383 MIC register, including non-exchange venues and inactive records. It is **not global price-feed coverage**. Changes can have future effective dates.
- Executive dashboard: supplied positions, USD exposure, gross sector/counterparty concentration, deterministic shocks, normal-volume liquidity and alerts. No sample portfolio is loaded automatically.
- Decision evidence: downloadable inputs and current-session activity. Not immutable audit storage.
- Licensed snapshots: adapter code for Bloomberg Desktop reference data and LSEG close-price snapshots. End-to-end verification requires SDKs, authentication and entitlements not present in this workspace. B-PIPE server authentication and streaming are not implemented.

## Provider setup

Install SDKs only through provider-approved instructions. Keep credentials outside this repository and browser.

### Bloomberg Desktop

Install official BLPAPI Python/native components and sign in to Bloomberg Terminal on the same machine. Adapter uses localhost:8194 and `//blp/refdata`, requesting `PX_LAST` and `CRNCY`. It does not label reference responses as streaming real-time quotes. Since observation timestamps are not retrieved, they remain unknown. Field/security errors remain visible. Validate API entitlement and allowed application use with your data administrator.

### LSEG Workspace / Data Platform

Install `lseg-data` in the Python environment selected by `RISK_PYTHON` (defaults to `python`). Configure the official library outside the repository. Set `RISK_LSEG_CONFIG` to the config file path and `RISK_LSEG_SESSION` to `desktop.workspace` or `platform.ldp`. The adapter calls `open_session` and requests `TR.PriceClose`, `TR.PriceClose.Date`, `TR.PriceClose.Currency`, with field names in headers. Currency units and date field availability must be validated for subscribed asset classes. It is a close snapshot, not a streaming feed.

No keys are accepted by the hosted UI. No vendor data is forwarded to the hosted deployment. Licensed lookup displays returned prices; it does not silently merge ambiguous vendor IDs into holdings.

## Position CSV

Required: `ticker,shares,price,sector`. Optional: `name,day,beta,adv,counterparty,credit,side,currency,fx_to_usd,asof,instrument_id,mic,source`.

Prices are per full unit in the declared three-letter currency (USD if omitted). Non-USD requires a positive `fx_to_usd`. Convert pence and other minor-unit quotes before import. `asof` is YYYY-MM-DD. USD converted value is shares × price × FX × side. Day P&L excludes FX movement and assumes unchanged holdings/FX. Missing ADV is unknown; missing beta uses 1 as an explicitly approximate input. Missing price dates trigger an alert. Holdings stay in the browser tab and reset on reload.

## Verification

```powershell
npm test
python test-providers.py
```

Tests validate normalization, failures, currencies, signed exposures, CSV validation and adapter input handling. They do not certify vendor entitlements or production institutional readiness.

## Deployment and institutional prerequisites

`scripts/build.mjs` builds a self-contained Cloudflare Worker into `dist/server/index.js`, embedding only public web assets. `.openai/hosting.json` retains the existing Site identity. Public upstreams use fixed allowlisted HTTPS URLs, timeouts, format validation and per-isolate caching. There is no synthetic fallback on source failure.

The hosted edition retains existing Site access. Before use with executive/government production data: agree data residency, validate exchange entitlements and redistribution terms, configure approved enterprise access, implement organization roles and immutable audit storage, assess availability/security, and independently validate risk models. This application does not provide regulatory capital calculations, systemic-risk certification, guaranteed returns, execution, or complete worldwide securities coverage.

## Source documentation

- https://www.financialresearch.gov/financial-stress-index/
- https://www.newyorkfed.org/markets/reference-rates/sofr
- https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
- https://www.iso20022.org/market-identifier-codes
- https://bloomberg.github.io/blpapi-docs/
- https://developers.lseg.com/en/api-catalog/lseg-data-platform/lseg-data-library-for-python/quick-start/getting-started-with-python

## Systemic controls

The Systemic risk controls screen evaluates user-entered depth, duplicate liquidity, additional withdrawals, order exposure, quote age and funding resources. Inputs start as clearly marked illustrations. Export contains assumptions, formulas, outcomes and time. Playbooks cover the pending requests on cancellations, latency, inventory spirals, crowding, overload, funding and institutional incentives. They are operational proposals, not live detectors or regulatory certification. Official source links are included in the screen.

Pending external prerequisites remain: authenticated Bloomberg/LSEG desktop sessions and entitlements, B-PIPE streaming integration, synchronized order-level data, institutional model validation, durable audit and enterprise deployment controls. No trading gateway is connected.

## Portfolio application and paper execution

Start with Start-RiskPulse.cmd in the parent folder, then open http://127.0.0.1:4173/. The desktop application includes persistent named portfolio snapshots, multiple paper accounts, immediate simulated buy/sell fills, cash accounting, fee-inclusive cost basis, realized/unrealized P&L, order-size limits and a downloadable trade ledger. Whole-share long-only USD simulation. Prices are user-entered assumed fills, not broker quotes; marks update only on fills. Cost basis uses average cost with integer-cent allocation on partial sales. Dividends, tax accounting, execution slippage and live orders are not modeled.

Desktop records are stored in data/workspace.sqlite3. Keep a backup of this file while the application is stopped; the active installation is outside OneDrive. Export accounts for a readable copy of their records. The local database is not an immutable compliance log and is not uploaded to Sites. Hosted visitors receive an explicit desktop-only message for saved workspace operations. Importing a CSV alone does not save it: select Save current portfolio in Portfolio workspace.

Paper orders are applied within database transactions. Request identifiers prevent duplicate fills on unchanged retries. Limits and cash are checked at commit time. Browser mutations require a same-origin JSON request; the internal Python bridge requires a random per-launch token.

Run `python test-workspace.py` for accounting, limits, rollback, retry and persistence checks.

## Execution risk gates (local application)

Account-level controls now enforce the HFT scenario responses before a paper fill. Optional gates check assumed quote freshness, cancellation intensity, duplicate-adjusted and withdrawal-adjusted depth, post-buy inventory and uniform cross-asset shock losses. An independent pause flag blocks every new paper fill. Cash, whole-share availability and order-size checks always apply. All scenario inputs are manual assumptions; there is no connected real-time order book, automated cancellation detector, calibrated contagion forecast or systemic-risk guarantee. Settings and their history are stored with each account and included in exports. Depth and freshness gates also apply to sells; inventory and loss-budget gates apply to buys. Restarting does not clear a pause.

Active non-OneDrive installation: C:\Users\bhuva\Projects\RiskPulse. Start-RiskPulse.cmd launches the local server; open http://127.0.0.1:4173/. Database: riskpulse\data\workspace.sqlite3. The prior OneDrive working directory is retained as an earlier copy; use this installation for future records.
