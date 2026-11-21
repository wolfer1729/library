# Granthalaya · ग्रंथालय · గ్రంథాలయం

A personal library of famous novels and stories in **English, Hindi and Telugu**. You can read in the browser, listen to narrated audiobooks, have any book read aloud (including your own uploads), and add your own books. Books are sorted into genres, and the interface itself switches between English, हिन्दी and తెలుగు.

## Run it

Requires Node.js 18.17 or newer (no `npm install` needed; there are no dependencies).

On Windows, double-click **`start.bat`**. It starts the library and opens it in your browser. Or run:

```bash
npm start
```

Then open http://localhost:3000. You'll land on the **front page** (`public/index.html`): language cards, featured books, genres and an "Open the library" button. The library itself is `public/library.html`. The front page can also be opened directly as a file. In that case it shows how to start the server, because books need it. To use another port, set `PORT=8080`. To open the library from a phone on the same Wi-Fi, start it with `HOST=0.0.0.0` and visit `http://<this-computer's-IP>:3000`. There is no login, so only do this on a network you trust.

## What's in the catalogue (281 titles)

| Language | Free to read | Catalogue only (still under copyright) |
|---|---|---|
| English | 145 classics from Project Gutenberg + 6 built-in stories | 16 (e.g. *1984*, *The Guide*, *The God of Small Things*) |
| हिन्दी | 48 from Wikisource (Premchand's novels and stories, Prasad, Nirala, Chatursen, Bharatendu, Bankim in Hindi…) + 6 stories | 14 (e.g. *मैला आँचल*, *राग दरबारी*, *गुनाहों का देवता*) |
| తెలుగు | 28 from Wikisource (Gurajada, Kandukuri, Chilakamarti, Adivi Bapiraju, Kasi Majili Kathalu, Sri Sri, the prabandhas…) + 6 stories | 12 (e.g. *వేయిపడగలు*, *మైదానం*, *అసమర్థుని జీవయాత్ర*) |

The six built-in stories (The Thirsty Crow, The Monkey and the Crocodile, The Lion and the Clever Rabbit, The Talkative Tortoise, Tenali Rama and the Thieves, Birbal's Khichdi) are written in all three languages and work offline.

**Catalogue-only** books are famous modern works whose text cannot legally be included. Their pages have an **Add your copy** button: upload your own EPUB, PDF or TXT and it is linked to that entry.

Every source was verified when the catalogue was built. Run `npm run check` to re-verify, for example after adding books.

## Features

- **Genres:** 17 shelves (Classics, Social, Romance, Mystery, Adventure, Historical, Short Stories, Children's, Folk Tales, Fantasy, Sci-Fi, Horror, Humour, Plays, Poetry, Epics, Philosophy), filterable by book language.
- **Reader:** chapters, text size, paper/sepia/night themes, serif/sans fonts, and line width. Your position is remembered, and the home page shows *Continue reading*.
- **Read aloud:** uses the browser's speech voices (Web Speech API), highlights the paragraph being read, lets you tap any paragraph to start there, and continues into the next chapter. Speed and voice are adjustable.
- **Narrated audiobooks:** English classics are matched automatically to free LibriVox recordings (streamed from archive.org). The player keeps playing while you browse, remembers your position, and works with media keys and lock-screen controls.
- **Add books:** EPUB (keeps its chapters and cover), PDF (text and a cover from page 1), TXT, Markdown or HTML, or paste text. Pick genres, a cover, and optional audiobook files (MP3/M4A/M4B/OGG/WAV/FLAC). Uploads can be edited, deleted and downloaded again.

### Hindi and Telugu voices

Read aloud depends on the voices your browser has:

- **Microsoft Edge** (recommended) has free natural voices for both Hindi and Telugu.
- **Chrome on Android** uses Google's Hindi and Telugu voices.
- Desktop Chrome usually has a Hindi voice but often no Telugu one. The reader shows a notice when a voice is missing.

## How it works

```
server.js            HTTP server and API (no dependencies)
server/
  catalog.js         catalogue, background text downloads, cache
  gutenberg.js       downloads from Project Gutenberg mirrors
  wikisource.js      crawls a Wikisource work chapter by chapter (rate-limited)
  librivox.js        finds matching LibriVox audiobooks
  textproc.js        splits text into chapters; turns HTML into paragraphs
  uploads.js         storage for your books
public/index.html    front page (front.css + front.js, no server needed to display)
public/library.html  the library app (plain JavaScript modules in public/js/)
start.bat            Windows: start the server and open the browser
download-books.bat   Windows: save all book texts for offline use (same as npm run download)
scripts/             download-all.js, fetch-assets.js (fonts/libraries), check-catalog.js
data/catalog/        the book list: en.json, hi.json, te.json, stories.json, genres.json
data/cache/          downloaded texts (created automatically)
data/uploads/        books you add
```

- **First open of a book:** Gutenberg books download in a few seconds. Wikisource books arrive chapter by chapter, about 4–7 seconds per chapter (a long novel such as *Godaan* takes about 4 minutes in total), because Wikisource limits request speed. You can start reading once the first chapter appears. After that, every book opens instantly from `data/cache/`.
- **PDF and EPUB reading** happens in your browser, using local copies of pdf.js and JSZip in `public/vendor/`.

## Website version (GitHub Pages)

The library also runs as a plain website, with no server: **https://wolfer1729.github.io/library/**

- Open it on any phone or computer. On a phone, use the browser menu → **Add to Home screen**.
- On the library home page, **Download all books** (about 50 MB) saves every book in that browser so it works without internet. Books you open are also kept automatically.
- **Add a book** works too, but the book is stored only in that browser on that device (IndexedDB). It is never uploaded to the website, so it doesn't appear on your other devices.
- Narrated audiobooks stream from LibriVox. Saving audiobooks for offline use needs the computer version (`start.bat`).

To publish an update, run `npm run download` (to include any new books), then:

```bash
npm run deploy
```

This builds the site into `dist/` (`npm run build:site`) and pushes it to the `gh-pages` branch. GitHub Pages serves that branch (Settings → Pages → *Deploy from a branch* → `gh-pages`, folder `/ (root)`).

## On your phone

1. On the computer, double-click **`start-phone.bat`**. Optionally choose a password (recommended on shared Wi-Fi). Allow Node.js through the Windows firewall if asked.
2. The window lists addresses like `http://192.168.5.122:3000`. Open one in your phone's browser; the phone must be on the same Wi-Fi.
3. If you set a password, type any user name and the password.
4. In the browser menu choose **Add to Home screen** to get an app icon.

The computer must stay on with the window open. If Windows marks your Wi-Fi as a *Public* network, the firewall blocks phones. On your own home Wi-Fi, set it to *Private* (Settings → Network & internet → Wi-Fi → your network). With **Tailscale** on both the computer and the phone, the `100.x.x.x` address also works away from home, over mobile data. Read aloud on Android uses the phone's own voices, which include Hindi and Telugu.

## Using it offline (no internet)

Download everything once, while you have internet:

```bash
npm run download          # or double-click download-books.bat
```

This saves the text of all 221 downloadable books to `data/cache/content/` (about 150 MB; the 18 built-in stories are already in the project). The fonts and the PDF/EPUB readers are already in `public/fonts` and `public/vendor`. It can be stopped and run again at any time; it continues where it stopped. Options: `--lang=hi` (only one language), `--only=hi-godaan,te-ganapati` (specific books).

**What works without internet:** every saved book, the reader, your own uploads (adding them too), the front page, saved audiobooks, and read-aloud with voices installed on the computer.

**Audiobooks** stream from LibriVox, so they need internet unless saved. On a book's page, press **Download for offline** in the Listen panel. You can also save several from the command line: `npm run download -- --audio=en-kim,en-dracula`. Saving *every* English audiobook (`--audio`) needs tens of gigabytes; it stops automatically if free disk space drops below 2 GB. Saved audiobooks can be removed from the same panel.

**Read aloud offline** only uses voices installed on the computer. "Natural"/online voices need internet, and the reader switches to an installed voice automatically. This PC has English voices. For Hindi, add the Hindi language with its speech (text-to-speech) pack under *Windows Settings → Time & language*. Windows usually has no offline Telugu voice; an Android phone with Google's Telugu voice downloaded can read Telugu offline.

## Adding books to the catalogue

Add an entry to `data/catalog/<lang>.json`:

```json
{ "id": "en-the-jungle", "title": "The Jungle", "author": "Upton Sinclair", "year": 1906,
  "genres": ["social", "classics"], "desc": "…",
  "source": { "type": "gutenberg", "id": 140 } }
```

For Wikisource use `"source": { "type": "wikisource", "page": "<exact page title>" }` (the page's language is taken from the file). Leave `source` out for a catalogue-only entry. Hindi and Telugu entries can include `"alt": "Transliteration · Author"` so they can be found by typing in English. Then run `npm run check` and restart the server.

## Limitations

- Copyrighted modern books are listed but not included; add your own copies.
- Hindi and Telugu PDFs made with old non-Unicode fonts (Kruti Dev and similar) extract as garbled text. Use EPUB or TXT for those.
- Narrated audiobooks are mostly available for English classics. For Hindi and Telugu, read aloud covers everything.
