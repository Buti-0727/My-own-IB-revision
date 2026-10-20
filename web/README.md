# IB Revision Studio

A local study workspace for six IB courses. Papers, markschemes, and progress will be stored in this browser. Local AI feedback will connect to LM Studio running on this laptop; there is no hosted AI or cloud sync.

## Start the app

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Use this exact address each time so the browser keeps one local library.

## Current scope

The workspace shell is in place. The paper library, practice flow, local model connection, and backup controls are being built next.

## Privacy

The app binds to `127.0.0.1`. Do not change this to a network-wide host. Uploaded PDFs and progress are intended to stay in browser storage. AI requests will go only to LM Studio on this same laptop.
