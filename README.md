# Secure Web System as an Enterprise Risk Control

Implementación del taller AREM: una SPA React autentica usuarios con Auth0 y
consume una API Spring Boot que valida JWT, issuer, audience y el permiso
`read:risk`. En producción, Apache sirve la SPA y hace reverse proxy de `/api`
hacia el backend local; solo se publican los puertos 80 y 443.

## Estado de la entrega

La aplicación está publicada en:

<https://arep-enterprise-risk.duckdns.org>

El backend se ejecuta como el usuario dedicado `riskapi`, enlazado a
`127.0.0.1:8080`. Apache publica la SPA y redirige únicamente `/api/` hacia el
backend. El firewall permite SSH, HTTP y HTTPS, y bloquea el puerto 8080.

La infraestructura y la protección de la API están verificadas. El login
interactivo de Auth0 todavía requiere corregir el recurso API en el tenant:
Auth0 responde `Service not found: https://arep-enterprise-risk-api` cuando la
SPA solicita un access token. La aplicación no debe considerarse completamente
validada hasta que el login termine y `/api/risk-status` devuelva `200` con un
token válido.

### Evidencias disponibles

Las evidencias del laboratorio están en [docs/images](./docs/images/):

- [EvidenceDeploy.png](./docs/images/EvidenceDeploy.png): aplicación cliente
  SPA registrada en Auth0.
- [EvidenceEndpoint.png](./docs/images/EvidenceEndpoint.png): health check
  local con respuesta `200`.
- [EvidenceServer.png](./docs/images/EvidenceServer.png): acceso SSH al
  servidor Ubuntu con el usuario `ubuntu`.
- [EvidenceServerConf.png](./docs/images/EvidenceServerConf.png): Java 21 y
  UFW permitiendo SSH, HTTP y HTTPS.
- [EvidenceSesionCorrect.png](./docs/images/EvidenceSesionCorrect.png):
  endpoint protegido sin token con respuesta `401`.
- [EvidenceTests.png](./docs/images/EvidenceTests.png): `mvn test` exitoso,
  con tres pruebas sin fallos.
- [EvidenceHTTPS.png](./docs/images/EvidenceHTTPS.png): aplicación publicada
  mediante HTTPS.
- [EvidenceCertificate.png](./docs/images/EvidenceCertificate.png):
  certificado TLS de Let's Encrypt.
- [EvidenceCertbotRenew.png](./docs/images/EvidenceCertbotRenew.png):
  `certbot renew --dry-run` exitoso.

La evidencia pendiente es una llamada autenticada exitosa desde la URL HTTPS.
Debe mostrar `status: "protected"` y el `subject` del usuario. No se deben
mostrar access tokens, client secrets ni contraseñas.

### Verificaciones realizadas

```text
DNS:
arep-enterprise-risk.duckdns.org -> 54.147.115.13

Frontend:
HTTPS responde 200 OK

API sin token:
HTTPS /api/risk-status responde 401 Unauthorized

CORS:
El preflight desde https://arep-enterprise-risk.duckdns.org responde 200

Backend:
enterprise-risk-api.service active (running)
Spring Boot enlazado a 127.0.0.1:8080

Certbot:
Congratulations, all simulated renewals succeeded

Build:
mvn clean test -> 3 pruebas, 0 fallos
npm run build -> exitoso
```

La configuración real usa:

```text
Auth0 issuer: https://dev-fn3v0pak3325bn1p.us.auth0.com/
Auth0 audience: https://arep-enterprise-risk-api
Producción: https://arep-enterprise-risk.duckdns.org
```

## 1. Conceptos clave

- **Autenticación** responde “¿quién eres?”. Auth0 realiza el login y emite un
  access token.
- **Autorización** responde “¿qué puedes hacer?”. La API exige el scope
  `read:risk` además de un JWT válido.
- **Issuer** identifica al tenant que firmó el token.
- **Audience** identifica la API para la que fue emitido; evita reutilizar un
  token contra otro servicio.
- **HTTPS** cifra credenciales y tokens durante el transporte.

## 2. Configurar Auth0

1. Crea en **Applications → APIs** una API llamada `AREP Enterprise Risk
    API`, con Identifier exactamente
    `https://arep-enterprise-risk-api` y algoritmo `RS256`.
2. En Permissions agrega `read:risk` (“Read the protected risk status”).
3. Crea una aplicación de tipo **Single Page Application** llamada `AREP
    Enterprise Risk Lab Frontend`.
4. En la aplicación, en **APIs > User-Delegated Access**, otorga `read:risk` a
   la API. **Client Access no reemplaza User-Delegated Access** para el login
   de una SPA.
5. Crea un usuario en **Authentication > Database > Users**.
6. Configura estas URLs exactas en la SPA:

   ```text
   Allowed Callback URLs:
   https://arep-enterprise-risk.duckdns.org

   Allowed Logout URLs:
   https://arep-enterprise-risk.duckdns.org

   Allowed Web Origins:
   https://arep-enterprise-risk.duckdns.org
   ```

No copies un client secret en la SPA: los valores Vite quedan visibles en el
bundle y solo el client ID es apropiado para este flujo.

## 3. Ejecutar localmente

### Backend

Desde `backend/`:

```powershell
$env:AUTH0_ISSUER_URI="https://dev-fn3v0pak3325bn1p.us.auth0.com/"
$env:AUTH0_AUDIENCE="https://arep-enterprise-risk-api"
$env:APP_CORS_ALLOWED_ORIGINS="http://localhost:5173"
mvn spring-boot:run
```

Sin token, esta comprobación debe devolver `401`:

```powershell
curl.exe -i http://localhost:8080/api/risk-status
```

El endpoint público de salud debe devolver `200`:

```powershell
curl.exe -i http://localhost:8080/actuator/health
```

### Frontend

Desde `frontend/`, crea `.env.local` a partir de `.env.example` y completa el
tenant y el client ID. Nunca lo subas al repositorio.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Abre `http://localhost:5173`, inicia sesión y pulsa **Llamar API protegida**.
Una respuesta correcta contiene `status: "protected"` y el `subject` del
usuario. El navegador nunca muestra ni almacena manualmente el access token.

## 4. Despliegue Ubuntu + Duck DNS + Apache

Usa un servidor que controles. Cambia credenciales por defecto, crea un
usuario de despliegue sin privilegios y permite en el firewall únicamente TCP
80, 443 y SSH restringido. Nunca publiques el puerto 8080.

Instala:

```bash
sudo apt update
sudo apt install -y apache2 certbot python3-certbot-apache openjdk-21-jre
```

Construye en una máquina confiable:

```powershell
cd backend
mvn clean package
cd ../frontend
# En .env.local, cambia VITE_API_URL a https://arep-enterprise-risk.duckdns.org
npm run build
```

Copia `backend/target/*.jar` y `frontend/dist/` mediante `scp` o un método
seguro. Ejecuta el JAR como usuario dedicado y enlázalo solo a loopback
mediante un servicio systemd:

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

Apache debe servir `dist/` y hacer proxy únicamente de `/api/` hacia
`http://127.0.0.1:8080/api/`. Habilita `ssl`, `proxy`, `proxy_http`,
`rewrite` y `headers`. Las plantillas listas para copiar están en
`deploy/enterprise-risk-api.service` y `deploy/enterprise-risk.conf`; crea el
VirtualHost para el hostname Duck DNS y luego
ejecuta:

```bash
sudo apachectl configtest
sudo systemctl reload apache2
sudo certbot --apache -d arep-enterprise-risk.duckdns.org
sudo certbot renew --dry-run
```

Después de obtener HTTPS, actualiza en Auth0 las tres URLs permitidas y
reconstruye el frontend con la URL HTTPS. La evidencia de entrega debe
incluir: llamada autenticada exitosa, certificado válido, `401` sin token,
`certbot renew --dry-run` exitoso y prueba de que 8080 no es público.

## 5. Diagnóstico pendiente de Auth0

El bundle desplegado contiene:

```text
VITE_AUTH0_DOMAIN=dev-fn3v0pak3325bn1p.us.auth0.com
VITE_AUTH0_AUDIENCE=https://arep-enterprise-risk-api
VITE_API_URL=https://arep-enterprise-risk.duckdns.org
```

El servicio remoto usa el mismo issuer y audience. La API pública responde
correctamente `401` sin token, por lo que el backend y Apache están
conectados. El error ocurre antes de emitir el token, dentro de Auth0:

```text
Service not found: https://arep-enterprise-risk-api
```

Para resolverlo, la API debe existir en **Applications → APIs** del mismo
tenant `dev-fn3v0pak3325bn1p.us.auth0.com` y su **Identifier** debe ser
exactamente `https://arep-enterprise-risk-api`. Después se debe otorgar
`read:risk` a la SPA mediante **User-Delegated Access**. Si se usa otro
Identifier, hay que cambiarlo de forma idéntica en `.env.local`, el bundle de
producción y `AUTH0_AUDIENCE` del servicio systemd.

## 6. Evidencia final pendiente

Después de corregir Auth0:

1. Abrir <https://arep-enterprise-risk.duckdns.org>.
2. Iniciar sesión con el usuario de prueba.
3. Pulsar **Llamar API protegida**.
4. Guardar una captura donde se vea la URL HTTPS y una respuesta con:

   ```json
   {
     "status": "protected",
     "subject": "auth0|..."
   }
   ```

5. Confirmar que no se muestra ningún token completo.

## 7. Riesgos controlados

| Control | Riesgo reducido | Evidencia |
| --- | --- | --- |
| Auth0 | Suplantación y credenciales débiles | Flujo de login e identidad |
| JWT + issuer/audience | Acceso no autorizado y reutilización del token | `401`/`403` y configuración |
| Scope `read:risk` | Uso de una identidad autenticada sin permiso | Respuesta `403` sin scope |
| HTTPS | Exposición de credenciales o tokens | Certificado del navegador |
| Apache reverse proxy | Exposición directa de 8080 | Solo 80/443 públicos |
| Logs del servicio | Investigación tardía de incidentes | `journalctl -u enterprise-risk-api` |
