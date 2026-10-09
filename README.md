# Daydream.exe
Local-first diary: cassette notes that play on a CRT, a photo scrapbook, profile, quotes, backup.
**Stack:** Node + Express (static server only, bound to 127.0.0.1), vanilla JS modules, CSS, IndexedDB, Web Audio.

## Run
    npm install
    npm start        # http://127.0.0.1:3000  (PORT=4000 npm start to change)
## Data & privacy
Everything lives in your browser (IndexedDB for profile/notes/photos, localStorage for theme/sound/quote category). Nothing is sent anywhere. Clearing browser data deletes memories, so use **Export backup** regularly.
## Backup
Export writes one JSON file (photos embedded as data URLs). Import validates it, asks before merging, and skips records whose IDs already exist, so nothing is overwritten.
## Known gaps
No automated tests yet; no replace-all import mode; no tag filter UI (tags are saved and searchable).
