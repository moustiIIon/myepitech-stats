# Privacy policy — MyEpitechStats

**Last updated: 2026-08-19**

MyEpitechStats is a browser extension that displays a timeline of your
Epitech modules and projects. This document explains what data it handles.

## What data is collected

While you browse pages on `my.epitech.eu` that list your projects (Upcoming,
Current, Past, etc.), the extension reads the project cards already visible
on the page — title, module name, status, and the three dates shown (start,
end, deadline) — and saves them in your browser's local extension storage
(available on both Chrome and Firefox).

No other data is read from the page. The extension does not read your
grades, messages, personal files, or any content outside of these project
listing pages.

## Where the data goes

Nowhere but your own browser. The extension has no backend server and makes
no network requests of its own — it only reads the my.epitech.eu page you
already have open and writes to your browser's local storage for that
profile. Nothing is transmitted to the extension's developer or any third
party.

## How to remove your data

Open the extension's dashboard (via the "Timeline" sidebar entry on
my.epitech.eu, or the toolbar icon) and click **Clear data**, or uninstall
the extension — either immediately removes everything it has stored.

## Permissions

- **storage** — to save scraped project data locally between visits, so the
  timeline builds up as you browse instead of needing to be re-scraped
  every time.
- **tabs** — only to detect whether a MyEpitechStats dashboard tab is
  already open, so the toolbar icon focuses it instead of opening a
  duplicate. The extension does not read the URLs, titles, or content of
  your other tabs.

## Contact

This is an independent, unofficial tool and is not affiliated with or
endorsed by Epitech. For questions about this policy, contact the developer
through the extension's store listing (Chrome Web Store or addons.mozilla.org)
or its source repository.
