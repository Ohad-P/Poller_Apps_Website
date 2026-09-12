# Content Guide

## Homepage Structure

The first homepage contains four parts:

1. A concise Poller Apps introduction.
2. One featured, usable release: Sogrim.
3. Three principles explaining how projects are approached.
4. A short statement that the portfolio will grow as work becomes ready.

This keeps the site credible at launch. Empty project slots and “coming soon” grids are intentionally avoided.

## Project Card Requirements

Every future project entry should answer:

- What is it?
- Who is it useful for?
- What makes it worth opening?
- Is it released, experimental, or a case study?
- Where can someone use it or learn more?

Status labels must be honest. Use `Available now`, `Prototype`, `Case study`, or `Archived` rather than vague hype.

## Updating Sogrim

The homepage links to `/apps/sogrim/`. Its preview is a deliberately simplified CSS illustration, not a screenshot. If the app's name, color system, or core workflow changes, update the preview and description together.

Run `npm run sync:apps` after changing Sogrim. This tests and rebuilds the app, then updates the versioned release that the Poller Apps build includes.

## Domain References

Canonical metadata, `robots.txt`, and `sitemap.xml` use `https://pollerapps.com/`. Keep all three synchronized if the production domain changes.
