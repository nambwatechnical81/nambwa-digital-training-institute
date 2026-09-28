# NAMBWA Digital Training Institute — Production Deployment

## Recommended architecture
- Render Web Service (Node.js/Express)
- Render Managed PostgreSQL for applications, students, results, materials and sessions
- Render Persistent Disk mounted at `/var/data` for admission documents
- Safaricom Daraja for optional automatic M-Pesa STK Push
- Custom domain with HTTPS

Render services use an ephemeral filesystem by default, so uploaded admission documents are stored under the persistent disk path. Keep the service at one instance when using the local persistent disk. For horizontal scaling later, migrate documents to object storage.

## Deploy with Render Blueprint
1. Put this project in a GitHub repository.
2. In Render, create a new Blueprint and point it to the repository containing `render.yaml`.
3. Review the generated web service and Postgres database.
4. Add these secrets in the web service environment:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD_HASH`
   - `MPESA_CONSUMER_KEY` (optional until automatic M-Pesa is enabled)
   - `MPESA_CONSUMER_SECRET` (optional)
   - `MPESA_PASSKEY` (optional)
   - `MPESA_SHORTCODE` (the configured Daraja shortcode; for a Till integration use the shortcode supplied by Safaricom/Daraja)
   - `MPESA_CALLBACK_URL=https://YOUR-DOMAIN/api/mpesa/callback`
5. Render will deploy the web service, initialize the database tables on first boot, and expose `/health` for health checks.
6. Add your custom domain in Render after the first successful deployment. Use the final HTTPS domain in `MPESA_CALLBACK_URL`.

## Admin password hash
Run locally:
```bash
npm install
npm run hash-password -- "use-a-strong-password-at-least-12-chars"
```
Copy the printed bcrypt hash into Render as `ADMIN_PASSWORD_HASH`. Never commit the hash or `.env` file to Git.

## Local development
Requires PostgreSQL.
```bash
cp .env.example .env
npm install
npm start
```
Open `http://localhost:3000`.
Admin dashboard: `http://localhost:3000/admin.html`.

## Production notes
- The public website never exposes uploaded documents directly.
- Students authenticate through secure HTTP-only sessions backed by PostgreSQL.
- Admission document downloads are authorized against the logged-in student.
- Admin actions use a server-side admin session, not a client token.
- Rate limiting and security headers are enabled.
- M-Pesa callback handling stores the receipt against the matching CheckoutRequestID and marks valid KSh 1,000 payments as paid.
- Back up the database and persistent document disk according to institute policy.
- Before public launch, test the complete application flow, upload each document type, verify payment, activate a student account, log in, and test the portal on mobile.


## Google Search launch
1. After the site is live on its final HTTPS domain, open Google Search Console and add a Domain or URL-prefix property for the website.
2. Verify ownership using the method Google provides for the property.
3. Submit `https://YOUR-DOMAIN/sitemap.xml` in the Search Console Sitemaps report.
4. Use URL Inspection on the homepage and request indexing after the domain is working.

The application now serves `robots.txt` and a sitemap dynamically from the active domain. The admin page is marked `noindex,nofollow`.
