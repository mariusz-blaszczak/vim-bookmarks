# vim-bookmarks

Keyboard-driven, TUI-style manager for your browser's **native bookmarks**, shown as an
overlay on top of the current page. Vim key bindings, tree view (nvim-tree style), fuzzy search.

Works in Chrome (and other Chromium browsers) and Firefox.

## Install

Download the latest files from [Releases](https://github.com/mariusz-blaszczak/vim-bookmarks/releases).

### Chrome / Edge / Brave

1. Download `vim-bookmarks-chrome-<version>.zip` and unzip it to a folder you will keep
   (Chrome loads the extension from that folder).
2. Open `chrome://extensions` and enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the unzipped folder.

To update: unzip the new version over the same folder and click ↻ on the extension card.

### Firefox

- **Signed `.xpi`** (if attached to the release): open the file in Firefox and confirm the installation.
- **Unsigned `.zip`**: regular Firefox only installs signed add-ons. You can either
  - load it temporarily: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select the zip
    (it is removed when Firefox restarts), or
  - use Firefox Developer Edition / Nightly, set `xpinstall.signatures.required` to `false` in `about:config`,
    then install the zip from `about:addons` → ⚙ → **Install Add-on From File…**.

## Usage

Press **`Alt+B`** (or click the toolbar icon) to toggle the overlay. Press **`?`** inside it for all key bindings.

| Keys | Action |
|---|---|
| `j` `k` `gg` `G` `<C-d>` `<C-u>` | move |
| `h` `l` `za` `zo` `zc` `zR` `zM` `-` | collapse / expand / toggle / all / go to parent |
| `<CR>` `t` `T` `w` | open here / new tab / background tab / new window |
| `/` `n` `N` | fuzzy search by title and URL |
| `a` `A` | bookmark the current page / new folder |
| `r` `e` | rename / edit URL |
| `dd` `yy` `p` `P` | cut / copy / paste after / before |
| `x` `<Del>` | delete |
| `q` `<Esc>` | close |

To change the shortcut, go to `chrome://extensions/shortcuts` in Chrome, or `about:addons` → ⚙ → **Manage Extension Shortcuts** in Firefox.

On pages where extensions can't run (`chrome://`, `about:`, store pages, PDFs), the overlay opens in a separate popup window.

## Privacy

The extension uses only the browser's bookmarks API and doesn't send any data anywhere.
It runs on a page only when you open it (`activeTab`). It has no access to all sites.

## Development

```sh
npm install
npm run build        # dist/chrome, dist/firefox
npm run watch
npm run check        # typecheck + tests + build + Firefox lint
npm run run:firefox  # launch Firefox with the extension
npm run package      # zips in web-ext-artifacts/
```

### Releasing

1. Bump `version` in `package.json`, commit.
2. `git tag v<version> && git push origin main v<version>`.
3. GitHub Actions builds, tests, and attaches the zips to a new GitHub release.
   If repo secrets `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` are set, it also signs the Firefox build
   as **unlisted** on addons.mozilla.org (not published in the store) and attaches a `.xpi`.

## License

[MIT](LICENSE)
