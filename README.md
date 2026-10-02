# Finance Auction Topic 15 — v2

This version connects the browser frontend to the FastAPI WebSocket backend.

## Run locally on Mac

Open Terminal:

```bash
cd ~/Downloads
unzip Finance_Auction_Topic15_v2.zip
cd Finance_Auction_Topic15_v2/server

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python server.py
```

Then open:

```text
http://localhost:8000
```

Open one browser window as HOST and other tabs/windows as STUDENTS. Use the same room code.

## What is now connected

- Student browser -> WebSocket -> FastAPI
- Host browser -> WebSocket -> FastAPI
- Server-authoritative bids
- Maximum bid $1,000
- Bid cannot exceed player's balance
- Winning bid deducted from balance
- Correct +$500
- Wrong -$100
- Balance persists between rounds
- Up to 120 students per room
- Live leaderboard
- 10 rounds
- Final state
- Reset
- Tie-break data: final balance, correct answers, total bid

## Important production step

Localhost is for testing only. To use one Zoom link for 60–120 students, deploy this folder to a public HTTPS host that supports WebSockets. The final public URL can then be pasted into Zoom chat.

For production reliability at 120 users, use a managed server and persistent store (PostgreSQL/Redis) rather than relying on in-memory room state.

## Security/logic

The server, not the browser, decides whether a bid is valid and changes balances. This prevents students from changing their balance through browser developer tools.
