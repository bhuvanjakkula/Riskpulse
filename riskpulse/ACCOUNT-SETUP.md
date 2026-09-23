# RiskPulse landing page and local accounts

Launch with Node.js 24+ and Python 3: npm run build, then npm run desktop.
Open http://127.0.0.1:4173. The development command uses the same account checks.

The first page displays Professional ($199 per user/month), Business ($499/month, up to 3 users by agreement), and Enterprise (from $3,000/month, annual agreement).

Sign up takes an email address, mobile number with country code, password (12–128 characters), and plan interest. Sign in takes email and password. Passwords use salted scrypt hashes; 12-hour server-side sessions use HttpOnly, SameSite cookies. Sign out revokes the session. No passwords are stored in browser storage.

This edition runs only on loopback, on this computer. It does not collect payments, activate subscriptions, verify email/phone ownership, reset passwords by email, provision team seats, or provide hosted multi-tenant enterprise administration. A selected plan records interest only. Public hosting needs a deployed authentication service, HTTPS with Secure cookies, verified contact and recovery flows, and a separately configured billing integration.

Identity storage: data/identity.sqlite3. New account workspaces: data/users/<account-id>/workspace.sqlite3. Existing data/workspace.sqlite3 is preserved and is not automatically disclosed to new registrations. Assigning legacy data to an owner requires an explicit migration.

The full portfolio workspace, systemic-risk controls, public-data monitor, and analysis dashboard are retained at /app. Accounts start with their own empty saved workspace. Sample data, when explicitly loaded, remains illustrative.

Authentication checks: node --test test-auth.mjs.
Integration isolation check: start a disposable server with RISK_PORT=4183, RISK_BRIDGE_PORT=4184 and a temporary RISK_DATA_DIR, then run node test-isolation.mjs. Never run this test against customer storage.

Do not include data/, .venv/, .env, or vendor credentials in shared ZIP files.


## Free local owner access
Start-RiskPulse.cmd sets RISK_LOCAL_OWNER=1 for the loopback-only desktop server. This opens /app as bhuvanjakkula@gmail.com with no password, payment, or subscription. Anyone using this computer's local server can access this owner workspace while this mode is enabled. Remove the environment setting and restart to restore normal sign-in. Existing account credentials and data are preserved. Third-party licensed feeds still require their own entitlements. This setting does not change public hosting.

