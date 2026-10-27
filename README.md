# Secure Web System as an Enterprise Risk Control

AREM workshop implementation: a React SPA authenticates users with Auth0 and
consumes a Spring Boot API that validates the JWT issuer, audience, and
`read:risk` permission. In production, Apache serves the SPA and reverse
proxies `/api/` to the local backend; only ports 80 and 443 are public.

## Delivery status

The application is published at:

<https://arep-enterprise-risk.duckdns.org>

The backend runs as the dedicated `riskapi` user and is bound to
`127.0.0.1:8080`. Apache serves the SPA and proxies only `/api/` to the
backend. The firewall allows SSH, HTTP, and HTTPS and blocks port 8080.

The infrastructure and API protection have been verified. The Auth0 interactive
login still requires correcting the API resource in the tenant: Auth0 returns
`Service not found: https://arep-enterprise-risk-api` when the SPA requests an
access token. The application must not be considered fully validated until
login completes and `/api/risk-status` returns `200` with a valid token.

### Available evidence

Workshop evidence is stored in [docs/images](./docs/images/):

- [EvidenceDeploy.png](./docs/images/EvidenceDeploy.png): SPA client
  registered in Auth0.
- [EvidenceEndpoint.png](./docs/images/EvidenceEndpoint.png): local health
  check returning `200`.
- [EvidenceServer.png](./docs/images/EvidenceServer.png): SSH access to the
  Ubuntu server with the `ubuntu` user.
- [EvidenceServerConf.png](./docs/images/EvidenceServerConf.png): Java 21 and
  UFW allowing SSH, HTTP, and HTTPS.
- [EvidenceSesionCorrect.png](./docs/images/EvidenceSesionCorrect.png):
  protected endpoint returning `401` without a token.
- [EvidenceTests.png](./docs/images/EvidenceTests.png): successful `mvn test`
  run with no failures.
- [EvidenceHTTPS.png](./docs/images/EvidenceHTTPS.png): application served
  over HTTPS.
- [EvidenceCertificate.png](./docs/images/EvidenceCertificate.png): Let's
  Encrypt TLS certificate.
- [EvidenceCertbotRenew.png](./docs/images/EvidenceCertbotRenew.png):
  successful `certbot renew --dry-run` execution.

The remaining evidence is a successful authenticated call from the HTTPS URL.
It must show `status: "protected"` and the user's `subject`. Do not show
access tokens, client secrets, or passwords.

### Completed checks

```text
DNS:
arep-enterprise-risk.duckdns.org -> 54.147.115.13

Frontend:
HTTPS responds with 200 OK

Unauthenticated API:
HTTPS /api/risk-status responds with 401 Unauthorized

CORS:
The preflight from https://arep-enterprise-risk.duckdns.org responds with 200

Backend:
enterprise-risk-api.service is active (running)
Spring Boot is bound to 127.0.0.1:8080

Certbot:
Congratulations, all simulated renewals succeeded

Build:
mvn clean test -> 3 tests, 0 failures
npm run build -> successful
```

The deployed configuration uses:

```text
Auth0 issuer: https://dev-fn3v0pak3325bn1p.us.auth0.com/
Auth0 audience: https://arep-enterprise-risk-api
Production URL: https://arep-enterprise-risk.duckdns.org
```

## 1. Key concepts

- **Authentication** answers “who are you?”. Auth0 performs the login and
  issues an access token.
- **Authorization** answers “what are you allowed to do?”. The API requires
  the `read:risk` scope in addition to a valid JWT.
- **Issuer** identifies the tenant that signed the token.
- **Audience** identifies the API for which the token was issued and prevents
  token reuse against another service.
- **HTTPS** encrypts credentials and tokens in transit.

## 2. Auth0 configuration

1. In **Applications → APIs**, create an API named `AREP Enterprise Risk API`
   with this exact Identifier and the `RS256` signing algorithm:

   ```text
   https://arep-enterprise-risk-api
   ```

2. In **Permissions**, add:

   ```text
   Permission: read:risk
   Description: Read the protected risk status
   ```

3. Create an application of type **Single Page Application** named `AREP
   Enterprise Risk Lab Frontend`.
4. In the SPA under **APIs → User-Delegated Access**, grant `read:risk` to the
   API. **Client Access does not replace User-Delegated Access** for a SPA
   login.
5. Create a test user under **Authentication → Database → Users**.
6. Configure these exact SPA URLs:

   ```text
   Allowed Callback URLs:
   https://arep-enterprise-risk.duckdns.org

   Allowed Logout URLs:
   https://arep-enterprise-risk.duckdns.org

   Allowed Web Origins:
   https://arep-enterprise-risk.duckdns.org
   ```

Never copy a client secret into the SPA. Vite values are visible in the
browser bundle; only the client ID is appropriate for this flow.

## 3. Local execution

### Backend

From `backend/`:

```powershell
$env:AUTH0_ISSUER_URI="https://dev-fn3v0pak3325bn1p.us.auth0.com/"
$env:AUTH0_AUDIENCE="https://arep-enterprise-risk-api"
$env:APP_CORS_ALLOWED_ORIGINS="http://localhost:5173"
mvn spring-boot:run
```

Without a token, this request must return `401`:

```powershell
curl.exe -i http://localhost:8080/api/risk-status
```

The public health endpoint must return `200`:

```powershell
curl.exe -i http://localhost:8080/actuator/health
```

### Frontend

From `frontend/`, create `.env.local` from `.env.example` and fill in the
tenant and client ID. Never commit this file.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:5173`, sign in, and select **Call protected API**. A
successful response contains `status: "protected"` and the user's `subject`.
The browser never displays or manually stores the access token.

## 4. Ubuntu, Duck DNS, and Apache deployment

Use a server you control. Change default credentials, create a non-root
deployment user, and allow only TCP 80, 443, and restricted SSH through the
firewall. Never expose port 8080.

Install the required packages:

```bash
sudo apt update
sudo apt install -y apache2 certbot python3-certbot-apache openjdk-21-jre
```

Build on a trusted development machine or CI runner:

```powershell
cd backend
mvn clean package
cd ../frontend
# Set VITE_API_URL to https://arep-enterprise-risk.duckdns.org in .env.local
npm run build
```

Copy `backend/target/*.jar` and `frontend/dist/` using `scp` or another secure
transfer method. Run the JAR as a dedicated user and bind it to loopback with
systemd:

```ini
[Unit]
Description=Enterprise Risk API
After=network.target

[Service]
User=riskapi
WorkingDirectory=/opt/enterprise-risk-api
Environment="AUTH0_ISSUER_URI=https://dev-fn3v0pak3325bn1p.us.auth0.com/"
Environment="AUTH0_AUDIENCE=https://arep-enterprise-risk-api"
Environment="APP_CORS_ALLOWED_ORIGINS=https://arep-enterprise-risk.duckdns.org"
Environment="SERVER_ADDRESS=127.0.0.1"
ExecStart=/usr/bin/java -jar /opt/enterprise-risk-api/app.jar
Restart=always

[Install]
WantedBy=multi-user.target
```

Apache serves `dist/` and proxies only `/api/` to
`http://127.0.0.1:8080/api/`. Enable `ssl`, `proxy`, `proxy_http`, `rewrite`,
and `headers`. The ready-to-copy templates are
`deploy/enterprise-risk-api.service` and `deploy/enterprise-risk.conf`.

Run:

```bash
sudo apachectl configtest
sudo systemctl reload apache2
sudo certbot --apache -d arep-enterprise-risk.duckdns.org
sudo certbot renew --dry-run
```

After obtaining HTTPS, update the three Auth0 allowed URLs and rebuild the
frontend with the HTTPS API URL. Delivery evidence must include a successful
authenticated call, a valid certificate, successful `certbot renew --dry-run`,
a `401` without a token, and proof that port 8080 is not public.

## 5. Pending Auth0 diagnosis

The deployed bundle contains:

```text
VITE_AUTH0_DOMAIN=dev-fn3v0pak3325bn1p.us.auth0.com
VITE_AUTH0_AUDIENCE=https://arep-enterprise-risk-api
VITE_API_URL=https://arep-enterprise-risk.duckdns.org
```

The remote service uses the same issuer and audience. The public API correctly
returns `401` without a token, proving that the backend and Apache are
connected. The failure occurs before a token is issued, inside Auth0:

```text
Service not found: https://arep-enterprise-risk-api
```

To resolve it, the API must exist under **Applications → APIs** in the same
tenant, `dev-fn3v0pak3325bn1p.us.auth0.com`, and its Identifier must be exactly
`https://arep-enterprise-risk-api`. Then grant `read:risk` to the SPA through
**User-Delegated Access**. If another Identifier is used, update it
consistently in `.env.local`, the production bundle, and the systemd
`AUTH0_AUDIENCE` value.

## 6. Final pending evidence

After correcting Auth0:

1. Open <https://arep-enterprise-risk.duckdns.org>.
2. Sign in with the test user.
3. Select **Call protected API**.
4. Save a screenshot showing the HTTPS URL and a response like:

   ```json
   {
     "status": "protected",
     "subject": "auth0|..."
   }
   ```

5. Confirm that no complete token is visible.

## 7. Controlled risks

| Control | Reduced risk | Evidence |
| --- | --- | --- |
| Auth0 | Impersonation and weak credential handling | Auth0 login and user identity |
| JWT issuer/audience | Unauthorized API access and token reuse | `401`/`403` responses and configuration |
| `read:risk` scope | Use of an authenticated identity without permission | `403` response without the scope |
| HTTPS | Credential or token exposure in transit | Browser certificate |
| Apache reverse proxy | Direct exposure of port 8080 | Only ports 80 and 443 are public |
| Service logs | Delayed incident investigation | `journalctl -u enterprise-risk-api` |
