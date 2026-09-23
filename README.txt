RiskPulse Intelligence — complete shareable project

The ZIP and containing folder use this name. The website branding remains unchanged.

WINDOWS QUICK START
1. Install Node.js 24 or newer and Python 3.10 or newer, available on PATH.
2. Extract this entire ZIP to a folder. Do not run it inside the ZIP viewer.
3. Double-click Start-RiskPulse.cmd and keep its server window open.
4. Open http://127.0.0.1:4173/ for the cover page.
5. Create your own account with email, mobile number and password.
6. Choose a plan on the second page, then continue to the dashboard.

MAC / LINUX
In the riskpulse folder, run: npm run build
Then run: RISK_PYTHON=python3 npm run desktop
Open http://127.0.0.1:4173/ in your browser.

No npm dependencies or paid market-data SDKs are required for the basic local app.
Licensed Bloomberg/LSEG feeds require separate SDK installation and entitlements.
Plan selection saves interest only; payment collection and active subscriptions are not connected.
Email/mobile verification and password recovery are not implemented.

Each recipient runs their own local copy. localhost does not share your computer remotely.
This archive contains no owner password-free access, user databases, passwords, sessions,
virtual environments, private deployment settings, or account backups.
Accounts and portfolios are created in riskpulse/data on the recipient's computer.
Do not distribute that generated data directory in future copies.

SOURCE
riskpulse/: customer cover, account service, subscription plans, dashboard,
public-data adapters, portfolio storage, paper trading, and tests.
Root Python files and scientific_operator/: supporting simulation engine and tools.
Those optional engine/API tools may require their own Python packages.

Support: bjtmusic12@gmail.com
