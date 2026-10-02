
import asyncio, json, os, secrets
from dataclasses import dataclass, field
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP_DIR = HERE if (HERE / "index.html").exists() else HERE.parent / "app"
app = FastAPI(title="Finance Auction Topic 15")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HOST_PASSWORD = os.environ.get("HOST_PASSWORD", "")
START_BALANCE = 1000
MAX_BID = 1000
CORRECT_REWARD = 500
WRONG_PENALTY = 100
MAX_PLAYERS = 120
TOTAL_ROUNDS = 10

QUESTIONS = [
 {"title":"Mission Scanner","question":"What is the primary focus of Topic 15 in the ACCA Business and Technology (BT) syllabus?","options":["Personal effectiveness and communication in business","Preparing financial statements","Corporate governance and ethics","Designing information systems"],"answer":0},
 {"title":"SMART Builder","question":"Learning objectives in a Personal Development Plan (PDP) should satisfy which criteria?","options":["Specific, Measurable, Achievable, Relevant, Time-bound","Simple, Managed, Approved, Reviewed, Tested","Strategic, Monitored, Accountable, Recorded, Targeted","Specific, Mandatory, Audited, Regulated, Timed"],"answer":0},
 {"title":"Time Allocation","question":"How is Time Management defined within an organisational context?","options":["Working as many hours as possible","Planning and controlling how time is spent so objectives are met effectively","Delegating every task to others","Holding more meetings"],"answer":1},
 {"title":"Inbox Rescue","question":"In the ABCD method for managing an in-tray, what does the letter B stand for?","options":["Action immediately","Bin it","Calendar it","Delegate it"],"answer":1},
 {"title":"Manager Decision","question":"How should a manager handle a task that is Urgent but NOT Important?","options":["Do it yourself at once","Delegate it","Ignore it completely","Do it tomorrow"],"answer":1},
 {"title":"Sequence Rush","question":"What is the correct sequence of the four basic steps in work planning?","options":["Scheduling, Priorities, Sequencing, Allocation","Priorities, Task loading and allocation, Task sequencing, Scheduling","Task sequencing, Scheduling, Priorities, Allocation","Allocation, Scheduling, Sequencing, Priorities"],"answer":1},
 {"title":"Role Match","question":"What is a key distinction between Coaching and Mentoring?","options":["Coaching is short-term; mentoring is longer-term and broader","They are exactly the same","Mentoring only concerns today's tasks","Coaching is only for finance teams"],"answer":0},
 {"title":"Signal Repair","question":"Which element ensures the sender knows whether the receiver correctly decoded and understood the message?","options":["Encoding","Feedback","Noise","Channel"],"answer":1},
 {"title":"Communication Crisis","question":"Which barrier occurs when someone receives more information than they can process in the time available?","options":["Information overload","Delegation","Mentoring","Scheduling"],"answer":0},
 {"title":"Final Boss","question":"Why is mastering Topic 15 essential for individuals and managers?","options":["It removes the need for planning","It improves personal effectiveness, productivity and communication, supporting organisational goals","It only matters for auditors","It replaces technical knowledge"],"answer":1}
]

@dataclass
class Player:
    name: str
    ws: Optional[WebSocket] = field(default=None, repr=False)
    balance: int = START_BALANCE
    correct: int = 0
    total_bid: int = 0
    answered: bool = False

@dataclass
class Room:
    host: Optional[WebSocket] = field(default=None, repr=False)
    players: dict = field(default_factory=dict)
    round: int = 0
    phase: str = "lobby"       # lobby, auction, challenge, round_end, finished, duel
    current_bid: int = 0
    current_bidder: Optional[str] = None
    sold: bool = False
    picked: Optional[int] = None
    last_correct: Optional[bool] = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

rooms = {}

def safe_name(room, name):
    name = (name or "Student").strip()[:32]
    base = name or "Student"
    name = base
    n = 2
    while name in room.players:
        name = f"{base} {n}"
        n += 1
    return name

def pub_q(room, viewer=None):
    if room.round >= TOTAL_ROUNDS:
        return None
    q = QUESTIONS[room.round]
    out = {"title": q["title"], "question": q["question"], "options": None}
    if room.phase == "round_end" or (
        room.phase == "challenge" and (viewer is None or viewer == room.current_bidder)
    ):
        out["options"] = q["options"]
    if room.phase == "round_end":
        out["answer"] = q["answer"]
    return out

def public_state(room, viewer=None):
    players = []
    for p in room.players.values():
        players.append({
            "name": p.name,
            "balance": p.balance,
            "correct": p.correct,
            "total_bid": p.total_bid,
        })
    players.sort(key=lambda x: (-x["balance"], -x["correct"], -x["total_bid"], x["name"]))
    me = room.players.get(viewer) if viewer else None
    return {
        "round": room.round,
        "round_number": room.round + 1,
        "total_rounds": TOTAL_ROUNDS,
        "phase": room.phase,
        "current_bid": room.current_bid,
        "current_bidder": room.current_bidder,
        "sold": room.sold,
        "max_bid": MAX_BID,
        "players": players,
        "player": None if not me else {
            "name": me.name, "balance": me.balance,
            "correct": me.correct, "total_bid": me.total_bid
        },
        "question": pub_q(room, viewer),
        "picked": room.picked,
        "last_correct": room.last_correct
    }

async def send(ws, obj):
    if ws:
        try:
            await ws.send_text(json.dumps(obj))
        except Exception:
            pass

async def broadcast(room):
    if room.host:
        await send(room.host, {"type":"state", "state": public_state(room, None)})
    for p in list(room.players.values()):
        if p.ws:
            await send(p.ws, {"type":"state", "state": public_state(room, p.name)})

@app.get("/")
async def index():
    return FileResponse(APP_DIR/"index.html")

@app.get("/app.js")
async def js():
    return FileResponse(APP_DIR/"app.js")

@app.post("/api/rooms")
async def create_room():
    code = secrets.token_hex(3).upper()
    rooms[code] = Room()
    return {"room": code}

@app.websocket("/ws/{room_id}/{role}")
async def websocket_endpoint(ws: WebSocket, room_id: str, role: str):
    await ws.accept()
    room = rooms.setdefault(room_id.upper(), Room())
    player_name = None

    try:
        hello = json.loads(await ws.receive_text())
        requested_name = hello.get("name", "Student")

        if role == "host":
            if HOST_PASSWORD and hello.get("password") != HOST_PASSWORD:
                await send(ws, {"type":"error","message":"Wrong host password."})
                await ws.close()
                return
            room.host = ws
            await send(ws, {"type":"state", "state":public_state(room)})
        elif role == "student":
            if len(room.players) >= MAX_PLAYERS:
                await send(ws, {"type":"error","message":"Room is full. Maximum 120 students."})
                await ws.close()
                return
            player_name = safe_name(room, requested_name)
            room.players[player_name] = Player(name=player_name, ws=ws)
            await broadcast(room)
        else:
            await ws.close()
            return

        while True:
            msg = json.loads(await ws.receive_text())
            action = msg.get("action")

            async with room.lock:
                if action == "open_auction" and role == "host":
                    if room.round >= TOTAL_ROUNDS:
                        room.phase = "finished"
                    else:
                        room.phase = "auction"
                        room.current_bid = 0
                        room.current_bidder = None
                        room.sold = False; room.picked = None; room.last_correct = None
                        for p in room.players.values():
                            p.answered = False

                elif action == "bid" and role == "student":
                    p = room.players.get(player_name)
                    amount = int(msg.get("amount", 0))
                    if (
                        p and room.phase == "auction" and not room.sold
                        and 0 < amount <= MAX_BID
                        and amount <= p.balance
                        and amount > room.current_bid
                    ):
                        room.current_bid = amount
                        room.current_bidder = p.name

                elif action in ("sell","sold") and role == "host":
                    if room.phase == "auction" and room.current_bidder:
                        winner = room.players.get(room.current_bidder)
                        if winner and room.current_bid <= winner.balance:
                            winner.balance -= room.current_bid
                            winner.total_bid += room.current_bid
                            room.sold = True
                            room.phase = "challenge"

                elif action == "answer" and role == "student":
                    p = room.players.get(player_name)
                    q = QUESTIONS[room.round] if room.round < TOTAL_ROUNDS else None
                    try:
                        idx = int(msg.get("index", -1))
                    except (TypeError, ValueError):
                        idx = -1
                    if (p and q and room.phase == "challenge" and p.name == room.current_bidder
                            and not p.answered and 0 <= idx < len(q["options"])):
                        ok = idx == q["answer"]
                        if ok:
                            p.balance += CORRECT_REWARD
                            p.correct += 1
                        else:
                            p.balance -= WRONG_PENALTY
                        p.answered = True
                        room.picked = idx
                        room.last_correct = ok
                        room.phase = "round_end"

                elif action == "mark_answer" and role == "host":
                    if room.phase == "challenge" and room.current_bidder:
                        winner = room.players.get(room.current_bidder)
                        if winner and not winner.answered:
                            correct = bool(msg.get("correct"))
                            if correct:
                                winner.balance += CORRECT_REWARD
                                winner.correct += 1
                            else:
                                winner.balance -= WRONG_PENALTY
                            winner.answered = True
                            room.phase = "round_end"

                elif action == "next_round" and role == "host":
                    if room.round < TOTAL_ROUNDS - 1:
                        room.round += 1
                        room.phase = "auction"
                        room.current_bid = 0
                        room.current_bidder = None
                        room.sold = False; room.picked = None; room.last_correct = None
                        for p in room.players.values():
                            p.answered = False
                    else:
                        room.phase = "finished"

                elif action == "start_duel" and role == "host":
                    room.phase = "duel"

                elif action == "reset" and role == "host":
                    for p in room.players.values():
                        p.balance = START_BALANCE
                        p.correct = 0
                        p.total_bid = 0
                        p.answered = False
                    room.round = 0
                    room.phase = "lobby"
                    room.current_bid = 0
                    room.current_bidder = None
                    room.sold = False; room.picked = None; room.last_correct = None

            await broadcast(room)

    except WebSocketDisconnect:
        if role == "host" and room.host is ws:
            room.host = None
        elif role == "student" and player_name in room.players:
            room.players[player_name].ws = None
        await broadcast(room)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
