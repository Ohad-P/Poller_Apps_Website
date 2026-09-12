# Poller Apps Website

The clean, responsive home of Poller Apps. The first release showcased and distributed through the site is the Table Close PWA.

Production domain: `https://pollerapps.com/`.

## Status

Version `0.1` includes:

- Responsive Poller Apps landing page.
- Original CSS-based brand graphics with no stock imagery.
- Featured Table Close project and working launch links.
- Production metadata, sitemap, robots rules, redirects, and security headers.
- A dependency-free local server and build process.
- Automatic inclusion of the existing Table Close production build.

## Project Locations

The website and app remain separate projects:

```text
C:\Users\User\projects\Poller_Labs_Website
C:\Users\User\projects\Poker_Stattle_App
```

The Poller Apps production build copies Table Close into:

```text
dist/apps/table-close/
```

The public URL will therefore be:

```text
https://pollerapps.com/apps/table-close/
```

## Quick Start

Prerequisite: Node.js 20 or newer.

Sync the tested Table Close release once, then start the Poller Apps development server:

```powershell
cd C:\Users\User\projects\Poller_Labs_Website
npm install
npm run sync:apps
npm run dev
```

Open `http://localhost:5174`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Serve the source homepage and current Table Close production build. |
| `npm run sync:apps` | Test/build Table Close and update its versioned release inside this project. |
| `npm run build` | Create the deployable combined site in `dist/`. |
| `npm test` | Verify required production files and integration links. |
| `npm run check` | Check JavaScript syntax, build, and verify the combined site. |
| `npm run preview` | Serve the combined production output at `http://localhost:4174`. |

Cloudflare Workers Builds uses `npm run build` followed by `npx wrangler deploy`. The checked-in `wrangler.jsonc` pins the Worker name, compatibility date, and `dist/` static-assets directory.

The website has no package dependencies. `npm install` only creates or validates the lockfile. A normal website build uses the versioned app release already under `public/apps/`, so cloud builds do not require sibling projects.

## Documentation

- [Brand system](docs/BRAND.md)
- [Content guide](docs/CONTENT.md)
- [Deployment and domain setup](docs/DEPLOYMENT.md)
- [Future admin and CMS architecture](docs/ADMIN_CMS.md)

## Adding A New Project

Do not add placeholder portfolio cards. Add a project when it has a truthful description, a useful visual, and either a working launch link or a clearly labeled case study.

For another static app:

1. Give the app its own project directory and production build.
2. Add a sync step that updates a versioned release under `public/apps/<slug>/`.
3. Add the project card to `index.html`.
4. Add the final URL to `public/sitemap.xml`.
5. Run `npm run check` and test the combined production preview.

Apps requiring a backend should be deployed independently and linked from the portfolio rather than copied into this static build.

## Social Card Regeneration

The sharing image is already included. After changing the brand graphic, install Pillow and run:

```powershell
python -m pip install Pillow
python scripts/generate_social_card.py
```
