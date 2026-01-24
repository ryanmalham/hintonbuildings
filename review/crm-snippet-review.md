# Review of provided CRM HTML/JS snippet

## Summary
The snippet embeds sensitive user data and API credentials directly into client-side JavaScript and exposes them to the browser environment. This creates immediate risk of credential leakage, account takeover, and unauthorized API access.

## Findings
### 1) Hard-coded API tokens in client-side code (critical)
The snippet includes `api_token`, `parent_api_token`, and `x-api-key` values in the HTML/JS payload. Any user (or third-party script) can read these values, leading to unauthorized API access, data exfiltration, or impersonation.

**Risks**:
- Token leakage via browser devtools, view source, XSS, or network proxies.
- API misuse or account takeover if tokens grant elevated permissions.

**Recommendation**:
- Move all secret tokens server-side.
- Use short-lived, scoped tokens minted by a backend with least privilege.
- Rotate and invalidate exposed tokens immediately.

### 2) PII exposure and localStorage persistence (high)
The snippet stores user email, name, and user ID into `localStorage`. This makes PII available to any script running on the page and persists across sessions.

**Risks**:
- XSS or third-party scripts can read PII.
- Data persists even after logout on shared devices.

**Recommendation**:
- Avoid storing PII in localStorage; use in-memory state or httpOnly cookies.
- If storage is required, minimize fields and use encryption + expiration.

### 3) Client-side configuration contains sensitive business logic (medium)
The `crmSetting` object exposes internal URLs, module IDs, and configuration flags that may assist attackers with recon and tampering.

**Recommendation**:
- Serve only non-sensitive config to the client.
- Gate internal IDs and flags behind server-side authorization checks.

## Additional notes
- Consider a Content Security Policy (CSP) to reduce the impact of XSS.
- Ensure third-party assets are integrity-protected (SRI) where possible.
