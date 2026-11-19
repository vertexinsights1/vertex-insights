# Implementation notes
Flow: Git push or "Publish" button > Netlify runs `scripts/build.mjs` > reads published content with the public anon key (RLS limits it to published rows) > writes `dist/` > deploy.
Enquiries: form > `/api/contact-submit` (function, service-role key server-side) > `enquiries` table (admins only) > optional Resend email.
Publish button: `/api/publish-site` verifies the Supabase session and an owner/editor profile, then calls the Netlify build hook.
Security: per-path CSP in `_headers` (site vs admin), supabase-js vendored in `admin/vendor`, RLS roles, honeypot + origin allow-list + size limits.
If Supabase is unreachable at build time the build keeps the static content instead of failing.

Test checklist: logged-out cannot read enquiries/drafts; non-profile user refused; viewer read-only; valid enquiry saved, invalid rejected, honeypot ignored, no-JS submit lands on /thanks.html; article/service/SEO/contact edits appear after Publish; mobile layouts.
Not built: WhatsApp alerts.
