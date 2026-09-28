# NAMBWA Digital Training Institute — Launch Checklist

## 1. Put the code in GitHub
- Upload the contents of this folder so `render.yaml` is at the repository root.
- Do not commit `.env`, M-Pesa secrets, or private credentials.

## 2. Deploy on Render
- Create a new Blueprint from the GitHub repository.
- Render will use `render.yaml` to create the Node web service and PostgreSQL database.
- The web service build uses `npm install` and starts with `npm start`.

## 3. Configure secrets
Set these in the Render web-service environment:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH`
- `MPESA_CONSUMER_KEY`
- `MPESA_CONSUMER_SECRET`
- `MPESA_PASSKEY`
- `MPESA_SHORTCODE`
- `MPESA_CALLBACK_URL` (use the final HTTPS domain)

Automatic M-Pesa is optional; the Till-payment workflow can be used while STK credentials are not configured.

## 4. Connect the domain
- Add the custom domain in Render.
- Follow the DNS records Render gives you at your domain registrar.
- Confirm the website opens over HTTPS.

## 5. Test before public promotion
- Open `/health` and confirm it reports the service is healthy.
- Submit a test application.
- Verify all five document uploads.
- Verify the KSh 1,000 payment workflow.
- Test administrator login.
- Activate a student account and test the portal.

## 6. Add to Google Search
- Add the live website to Google Search Console and verify ownership.
- Submit `/sitemap.xml`.
- Inspect the homepage URL and request indexing.

## Important
This package is a Node.js/Express application with PostgreSQL and persistent document storage. Google Sites is not the appropriate deployment target for this application. Google Cloud Run can host a Node.js/Express service, but the included deployment configuration is prepared for Render.
