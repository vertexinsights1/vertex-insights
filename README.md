# Vertex Insights: final site (public website + private admin)

Static website + `/admin` (Supabase login) + enquiry capture + one-click "Publish changes to website".

## What the admin controls (after clicking **Publish changes to website**)
- **Insights & articles**: published articles get their own page and appear on the Insights page and sitemap. Body: blank line between paragraphs, `## ` starts a heading.
- **Images**: upload JPG/PNG/WebP/AVIF (max 5 MB) with alt text; pick one as an article's cover image (also used as the social-share image). Images are stored in a public Supabase bucket; only owner/editor can upload or delete. Re-run the SQL file if you ran an older version.
- **Services**: edits to the three existing services (slugs `bi`, `financial`, `market`) update the Services page; set a service to draft/hidden to remove it; a new slug adds a new section. Always "Request a quote".
- **Website pages**: SEO title + meta description for `home, about, services, industries, insights, contact, privacy, terms`.
- **Settings > Public contact details**: contact email / phone shown on the Connect page (blank = hidden).
- **Enquiries & leads**: saved from the contact form, with status, priority, follow-ups and notes. Roles: owner/editor edit, viewer is read-only (enforced in the database).

## Setup (one time, about 30 minutes)
1. **Supabase**: new project > SQL Editor > run `supabase/migrations/001_initial_schema.sql` (safe to re-run). Auth > Providers > Email: turn **sign-ups off**.
2. **Owner login**: Auth > Users > add user. Then run:
   ```sql
   insert into public.admin_profiles (user_id, display_name, role)
   values ('PASTE-USER-UUID', 'Your name', 'owner');
   ```
3. **Git**: push this folder to a GitHub repo. Netlify > Add new site > Import from Git (build settings are read from `netlify.toml`).
4. **Netlify env vars**: copy every key from `.env.example`. `BUILD_HOOK_URL` = Netlify > Build & deploy > Build hooks. `ALLOWED_ORIGINS` = your real domain and the `.netlify.app` URL.
5. **Domain**: add it in Netlify. Canonical links, Open Graph and sitemap pick it up automatically on each build (no manual find/replace).
6. Deploy, then test: `/admin` login, submit `/contact`, see the enquiry, edit an article, publish, confirm it appears. Settings > Setup status should be green (WhatsApp is not included).

Local alternative to Git: `npm i -g netlify-cli && netlify deploy --build --prod`. Drag-and-drop does not work for this package (needs build + functions).

## Domain and email (vertexinsights.co.in)
Netlify > Domain management > Add domain. At GoDaddy DNS: `A` record `@` to `75.2.60.5`, `CNAME` `www` to your `<site>.netlify.app`. Set env `SITE_URL=vertexinsights.co.in`. Contact email shown on the site: info@vertexinsights.co.in (create the mailbox first; Settings > Public contact details can override it).

## Adding a new page
Create the .html file, then run `node scripts/gen-headers.mjs` (rebuilds `_headers` with the right CSP). The sitemap is generated automatically on every build.

## Before promoting
Have `privacy.html` and `terms.html` reviewed by a qualified professional. Optional email alerts need a verified sender domain in Resend.

## Repository layout

Public pages live at the repository root, shared files in `assets/`, and the admin console in `admin/`. The public homepage currently reuses the About page content. Existing API handlers live in `netlify/functions/`, build tools in `scripts/`, and the database setup SQL in `supabase/migrations/`. The build publishes only public pages and assets to `dist/`; it generates `admin/config.js` from deployment configuration.
