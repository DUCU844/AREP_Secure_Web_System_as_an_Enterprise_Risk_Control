# Secure Web System as an Enterprise Risk Control

Implementación del taller AREM: una SPA React autentica usuarios con Auth0 y
consume una API Spring Boot que valida JWT, issuer, audience y el permiso
`read:risk`. En producción, Apache sirve la SPA y hace reverse proxy de `/api`
hacia el backend local; solo se publican los puertos 80 y 443.

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

1. Crea una API llamada `Enterprise Risk Lab API`, con audience
   `https://enterprise-risk-api` y algoritmo `RS256`.
2. En Permissions agrega `read:risk` (“Read the protected risk status”).
3. Crea una aplicación de tipo **Single Page Application** llamada
   `Enterprise Risk Lab Frontend`.
4. En la aplicación, en **APIs > User-Delegated Access**, otorga `read:risk` a
   la API. **Client Access no reemplaza User-Delegated Access** para el login
   de una SPA.
5. Crea un usuario en **Authentication > Database > Users**.
6. Configura Callback URLs, Logout URLs y Web Origins con el origen exacto,
   inicialmente `http://localhost:5173`. En producción usa solo la URL HTTPS
   real; no uses comodines.

No copies un client secret en la SPA: los valores Vite quedan visibles en el
bundle y solo el client ID es apropiado para este flujo.

## 3. Ejecutar localmente

### Backend

Desde `backend/`:

```powershell
$env:AUTH0_ISSUER_URI="https://YOUR_TENANT.us.auth0.com/"
$env:AUTH0_AUDIENCE="https://enterprise-risk-api"
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
# En .env.local, cambia VITE_API_URL a https://YOUR-SUBDOMAIN.duckdns.org
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
Environment="AUTH0_ISSUER_URI=https://YOUR_TENANT.us.auth0.com/"
Environment="AUTH0_AUDIENCE=https://enterprise-risk-api"
Environment="APP_CORS_ALLOWED_ORIGINS=https://YOUR-SUBDOMAIN.duckdns.org"
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
sudo certbot --apache -d YOUR-SUBDOMAIN.duckdns.org
sudo certbot renew --dry-run
```

Después de obtener HTTPS, actualiza en Auth0 las tres URLs permitidas y
reconstruye el frontend con la URL HTTPS. La evidencia de entrega debe
incluir: llamada autenticada exitosa, certificado válido, `401` sin token,
`certbot renew --dry-run` exitoso y prueba de que 8080 no es público.

## 5. Riesgos controlados

| Control | Riesgo reducido | Evidencia |
| --- | --- | --- |
| Auth0 | Suplantación y credenciales débiles | Flujo de login e identidad |
| JWT + issuer/audience | Acceso no autorizado y reutilización del token | `401`/`403` y configuración |
| Scope `read:risk` | Uso de una identidad autenticada sin permiso | Respuesta `403` sin scope |
| HTTPS | Exposición de credenciales o tokens | Certificado del navegador |
| Apache reverse proxy | Exposición directa de 8080 | Solo 80/443 públicos |
| Logs del servicio | Investigación tardía de incidentes | `journalctl -u enterprise-risk-api` |
