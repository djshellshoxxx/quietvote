# QuietVote wiki source

This folder holds the source for the QuietVote GitHub wiki. Each `.md` file here is one wiki page, named in GitHub wiki style (`Page-Name.md`, spaces become hyphens).

- `Home.md` is the wiki's landing page.
- `_Sidebar.md` and `_Footer.md` are special GitHub wiki files that appear on every page.
- Links between pages use `[[Page Name]]`. Links to specifications use absolute GitHub URLs to `docs/`, because files in a wiki cannot link to relative paths in the main repository.

## Syncing to the GitHub wiki

GitHub wikis are separate git repositories (`<repo>.wiki.git`). This folder is the editable source, and it is not automatically published. To update the live wiki, copy these files into a checkout of the wiki repository and push. No sync workflow exists yet.

Edit pages here, not in the wiki web editor, so changes stay reviewable in the main repository.
