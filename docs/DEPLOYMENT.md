# Deployment And Domain Setup

## Production Domain

The registered production domain is `pollerapps.com`. It can remain parked until the site is ready to connect to a host.

## Recommended Hosting

Use Cloudflare Workers static assets for free hosting, Git-based deployments, and automatic HTTPS.

Recommended sequence:

1. Create a Git repository for `Poller_Labs_Website` and push it to GitHub.
2. In Cloudflare Workers, create a project connected to that repository.
3. Set the build command to `npm run build`.
4. Set the deploy command to `npx wrangler deploy`.
5. Leave the root directory blank.
6. Add `pollerapps.com` under the Worker's Domains & Routes settings.
7. Redirect `www.pollerapps.com` to the root domain, or make the opposite choice consistently.

## Included Apps

The tested Sogrim release is versioned under `public/apps/sogrim/`. Cloud builds therefore need only this website repository.

The editable Sogrim source remains in its separate project. After changing it locally, update the website's release copy with:

```powershell
cd C:\Users\User\projects\Poller_Labs_Website
npm run sync:apps
```

That command runs the app's complete checks before copying its production output. Commit the changed release files with the website update.

## Manual First Deployment

```powershell
cd C:\Users\User\projects\Poller_Labs_Website
npm run sync:apps
npm run check
```

Upload `C:\Users\User\projects\Poller_Labs_Website\dist` as the site output.

## DNS

When the domain and Pages project are in the same Cloudflare account, Cloudflare can create the required DNS records automatically. Otherwise, follow the hosting provider's exact CNAME/A record instructions.

Do not add guessed DNS values. Wait for the provider to issue the target for the specific site.

## Verification

After deployment, check:

- `https://pollerapps.com/` loads without redirects to HTTP.
- `https://www.pollerapps.com/` redirects consistently.
- `https://pollerapps.com/apps/sogrim/` opens and can be installed.
- Sogrim works after an offline reload.
- Legacy `/apps/table-close/` and `/table-close/` URLs redirect permanently to Sogrim.
- `https://pollerapps.com/robots.txt` and `/sitemap.xml` load.
- Browser developer tools report no Content Security Policy errors.
- Security headers are present in the production response.
