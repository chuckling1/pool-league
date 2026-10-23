# Pool League

A tiny, free win/loss tracker and rulebook for a pool (billiards) group. There are no logins: open the link, pick who played, tap the winner.

- **Standings:** win/loss and win % overall or per game type, with streaks, head to head between any two players, and recent games.
- **Log a game:** 8-ball, 9-ball (1-on-1) or cutthroat (3–5 players: one winner, everyone else takes a loss).
- **Rules:** house rules plus 8-ball, 9-ball and cutthroat, as Markdown files in `rules/`.

It's a static site on GitHub Pages. The data lives in Firebase Firestore on the free Spark plan, with no credit card.

## Try it first (no setup)

Until `js/config.js` has real values, the site runs in **demo mode**, which saves games only in your browser. To run it locally:

```
python -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly from disk won't work because browsers block ES modules on `file://`.

## Setup (about 10 minutes)

### 1. Firebase

1. Go to https://console.firebase.google.com, choose **Add project** and name it `pool-league`. You can turn Google Analytics off.
2. Open **Build > Firestore Database > Create database**. Choose **production mode** and a US location (for example `nam5` or `us-east1`).
3. Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
4. Open **Project settings (gear icon) > General > Your apps**, click the web icon `</>`, register an app called `pool-league`, and skip Firebase Hosting.
5. Copy the `firebaseConfig` values into `js/config.js`.

You don't need to turn on Authentication.

### 2. GitHub Pages

1. Create a public repo (for example `pool-league`) and upload everything in this folder to the root of `main`, including `.nojekyll`.
2. Go to **Settings > Pages > Build and deployment**, choose **Deploy from a branch**, and pick `main` and `/ (root)`.
3. After a minute or so, the site is live at `https://<your-username>.github.io/pool-league/`.

### 3. Share it

Open the site, enter a league code (for example `office-pool`), and use **Share link**. The link includes the code, so people just tap it. Each phone remembers the code after the first visit.

If you'd rather nobody had to type a code at all, set `defaultLeague` in `js/config.js`. The trade-off is that the code becomes visible in the public repo.

## How it's protected

There are no accounts, so anyone with a league code can log games in that league. Keep the code within your group. `firestore.rules` makes sure every game has a valid type, player count and winner, and lets a game be undone only within 24 hours. Your Firebase API key isn't a secret, since Firebase web keys are meant to be public and access is controlled by the rules.

Optionally, in Google Cloud Console under **APIs & Services > Credentials**, restrict the API key to HTTP referrer `https://<your-username>.github.io/*`.

Anyone can start their own league by entering a new code, so other groups can use the same site.

## Free tier limits

The Firestore Spark plan allows 50,000 reads and 20,000 writes per day. Each page load reads every game in the league once, so a league with 1,000 games could be opened about 50 times a day. That's plenty for an office group.

## Changing things

- **Rules:** edit the files in `rules/`. GitHub keeps the history of who changed what.
- **Game types:** `GAME_TYPES` in `js/stats.js`, the `RULES` list in `js/app.js`, and the `type in [...]` list in `firestore.rules`.
- **Standings order:** `computeStandings` in `js/stats.js` (currently win %, then wins).
