# vim-bookmarks — plan

Rozszerzenie Chrome + Firefox: menedżer **natywnych zakładek** jako overlay w stylu TUI,
sterowany klawiaturą (domyślnie Vim, w pełni przemapowywalne).

## Decyzje
- Overlay nad bieżącą stroną, wywoływany skrótem (domyślnie `Alt+B`).
- Wygląd inspirowany TUI: monospace, klawiatura, nowoczesny CSS.
- Widok: drzewo (nvim-tree).
- MVP: otwieranie, wyszukiwanie, edycja/organizacja, undo + visual mode.
- Stack: TypeScript, bez frameworka, esbuild.

## Architektura
- **Background** (service worker w Chrome / event page w Firefox) jako jedyny użytkownik `bookmarks` API.
  UI komunikuje się z nim typowanymi wiadomościami (`getTree`, `move`, `create`, `remove`, `update`, `open`, `undo`).
- **Wstrzykiwanie na żądanie**: `commands`/kliknięcie ikony → `scripting.executeScript` z `activeTab`.
  Brak `<all_urls>` i stałego content scriptu.
- **Shadow DOM (closed)** izoluje style; klawisze przechwytywane w fazie capture tylko gdy overlay jest otwarty.
- **Fallback**: strony zastrzeżone (`chrome://`, `about:`, Web Store, PDF) → ten sam UI jako strona rozszerzenia w oknie popup.

## Dane i rendering
- Stan UI: drzewo, rozwinięte foldery, kursor, zaznaczenie, tryb, rejestr.
- Drzewo spłaszczane do listy widocznych wierszy + wirtualizacja; diff wierszy po `id`.
- Adapter ukrywa różnice Chrome/Firefox (ID rootów, separatory, niemodyfikowalne rooty, `chrome.*` vs `browser.*`).

## Silnik klawiszy
- Keymap jako dane `{ mode, keys, action }`; sekwencje (`gg`, `dd`), liczniki (`5j`), timeout, notacja `<C-d>`.
- Akcje to nazwane komendy (wspólne dla klawiszy i `:`).
- Tryby: NORMAL, VISUAL, INSERT, SEARCH (`/`), COMMAND (`:`).

## Domyślne skróty
| Klawisz | Akcja |
|---|---|
| `j k` `gg G` `<C-d> <C-u>` | ruch |
| `h l` `za` `zo zc` `zM zR` `-` | zwiń / rozwiń / przełącz / wszystko / do rodzica |
| `<CR>` `t` `T` `w` | otwórz: tutaj / nowa karta / tło / nowe okno |
| `/` `n` `N` | fuzzy filtr po tytule i URL (w prompcie: `<CR>` zatwierdź, `<Esc>` anuluj, `<C-n>`/`<C-p>` następne/poprzednie) |
| `a` `A` | dodaj bieżącą stronę / nowy folder |
| `r` `e` | zmień nazwę / edytuj URL |
| `dd` `yy` `p` `P` | wytnij / kopiuj / wklej za / przed |
| `x` | usuń |
| `V` + operator | operacje grupowe |
| `u` `<C-r>` | undo / redo |
| `:` | komendy (`:mkdir`, `:sort`, `:map`) |
| `q` `<Esc>` | zamknij (`<Esc>` najpierw zdejmuje aktywny filtr) |

## Undo
Odwrotne operacje: usunięcie → snapshot poddrzewa i rekurencyjne odtworzenie z mapą `stareID → noweID`;
przeniesienie → poprzedni rodzic/indeks; edycja → poprzedni tytuł/URL. Operacje grupowe = jeden wpis.
Stos w `storage.session` (SW w MV3 może zostać ubity).

## Kamienie milowe
- [x] **M0** — szkielet: build na obie przeglądarki, skrót otwiera/zamyka pusty overlay w Shadow DOM, fallback window.
- [x] **M1** — odczyt: drzewo, ruch, zwijanie/rozwijanie, otwieranie, statusline.
- [x] **M2** — wyszukiwanie: `/` fuzzy, `n`/`N`, podświetlanie.
- [ ] **M3** — edycja: dodaj/zmień/usuń/wytnij/kopiuj/wklej/foldery, live refresh po `bookmarks.on*`.
- [ ] **M4** — visual mode + undo/redo.
- [ ] **M5** — konfiguracja: strona opcji, keymap w `storage.sync`, `:map`, motyw.
- [ ] **M6** — szlif: wydajność (~10k zakładek), a11y (ARIA tree), paczki Chrome Web Store / AMO.

## Odłożone
- Incognito (`W`) — dodatkowe uprawnienie, po MVP.
- Favicony — tylko Chrome ma `_favicon` API; po MVP.
