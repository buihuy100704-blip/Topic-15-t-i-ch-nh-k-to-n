/* =========================================================
   FINANCE AUCTION — Topic 15  (frontend)
   Sections: state · helpers · audio · fx/animation · screens
             · websocket · actions · render
   Protocol (unchanged): WS /ws/{room}/{role}; hello {name,password};
   actions: open_auction, bid{amount}, sold, answer{index}, next_round, reset
   ========================================================= */

/* ---- state ---- */
let hostPw="",ws=null,role="",room="",myName="",latest=null,prev=null,rulesFromStart=false;
const $=id=>document.getElementById(id);
const money=n=>"$"+Number(n||0).toLocaleString();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const L="ABCD",ICONS=["💵","📈","🏦","🧮"];
const reduced=matchMedia("(prefers-reduced-motion:reduce)").matches;

/* ---- audio: optional files in assets/audio/, WebAudio synth fallback ---- */
let ac=null,sfxOn=true,musicOn=true,step=0,mt=null,started=false;
function tone(f,t=0,d=.2,type="sine",v=.12,music=false){if(!ac||(music?!musicOn:!sfxOn))return;
  const o=ac.createOscillator(),g=ac.createGain(),n=ac.currentTime+t;
  o.type=type;o.frequency.value=f;g.gain.setValueAtTime(.0001,n);g.gain.linearRampToValueAtTime(v,n+.02);
  g.gain.exponentialRampToValueAtTime(.0001,n+d);o.connect(g).connect(ac.destination);o.start(n);o.stop(n+d+.05)}
const files={}; // name -> Audio | false (missing)
function playFile(name){ // returns true if a real file is playing
  if(!sfxOn)return true;
  if(files[name]===false)return false;
  if(!files[name]){const a=new Audio(`assets/audio/${name}.mp3`);a.onerror=()=>{files[name]=false};files[name]=a}
  const a=files[name];if(!a||a.error)return false;
  try{a.currentTime=0;a.play().catch(()=>{files[name]=false});return true}catch(e){return false}}
const synth={
  click:()=>tone(520,0,.06,"triangle",.12),bid:()=>{tone(660,0,.12,"triangle",.2);tone(880,.08,.1,"triangle",.12)},
  hammer:()=>{tone(110,0,.12,"square",.18);tone(80,.05,.2,"sine",.2)},
  sold:()=>{tone(220,0,.15,"square",.1);tone(440,.12,.25,"triangle",.2);tone(660,.3,.4,"triangle",.2)},
  tick:()=>tone(900,0,.07,"square",.08),go:()=>[660,880,1320].forEach((f,i)=>tone(f,i*.07,.25,"triangle",.2)),
  correct:()=>{tone(784,0,.18,"sine",.25);tone(1047,.12,.4,"sine",.25)},wrong:()=>tone(140,0,.5,"sawtooth",.15),
  money:()=>[988,1319].forEach((f,i)=>tone(f,i*.07,.15,"square",.07)),
  win:()=>[523,659,784,1047,1319].forEach((f,i)=>tone(f,i*.13,.45,"sine",.25))};
const play=n=>{if(!playFile(n))synth[n]&&synth[n]()};
const CH=[[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66]],BASS=[130.81,110,87.31,98.0],PAT=[0,1,2,1,0,2,1,2];
function startAudio(){try{if(!ac)ac=new (window.AudioContext||window.webkitAudioContext)();ac.resume();
  if(!mt)mt=setInterval(()=>{const c=Math.floor(step/8)%4;
    tone(CH[c][PAT[step%8]]*2,0,.4,"triangle",.07,true);
    if(step%4===0)tone(BASS[c],0,1,"sine",.1,true);
    if(step%8===0)tone(CH[c][0],0,1.6,"sine",.04,true);step++},280)}catch(e){console.warn("audio off",e)}}
document.addEventListener("click",e=>{if(ac&&ac.state==="suspended")ac.resume();
  const b=e.target.closest(".btn,.chip,.opt");if(b&&!b.disabled){ripple(b,e);if(started)play("click")}});
function toggleSound(){sfxOn=!sfxOn;$("snd").textContent=sfxOn?"🔊":"🔇"}
function toggleMusic(){musicOn=!musicOn;$("mus").textContent=musicOn?"🎵":"🚫";startAudio()}

/* ---- fx / animation helpers ---- */
function ripple(el,e){if(reduced)return;const r=el.getBoundingClientRect(),s=Math.max(r.width,r.height),d=document.createElement("span");
  d.className="ripple";d.style.cssText=`width:${s}px;height:${s}px;left:${(e.clientX||r.left+r.width/2)-r.left-s/2}px;top:${(e.clientY||r.top+r.height/2)-r.top-s/2}px`;
  el.appendChild(d);setTimeout(()=>d.remove(),650)}
function retrigger(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls)}
function particles(n,kind,x=innerWidth/2,y=innerHeight/2){ // kind: coin | confetti
  if(reduced)return;const fx=$("fx"),cols=["#ffc633","#0f9d6e","#ef4b4b","#12233f","#cdf3e3"];
  for(let i=0;i<n;i++){const p=document.createElement("div"),a=Math.random()*Math.PI*2,v=80+Math.random()*220,dx=Math.cos(a)*v,dy=Math.sin(a)*v-120;
    p.className="p";p.style.left=x+"px";p.style.top=y+"px";
    if(kind==="coin"){p.style.cssText+=";width:20px;height:20px;border-radius:50%;background:#ffc633;border:2px solid #12233f"}
    else{p.style.cssText+=`;width:10px;height:14px;background:${cols[i%5]};border-radius:2px`}
    fx.appendChild(p);
    p.animate([{transform:"translate(0,0) rotate(0)",opacity:1},{transform:`translate(${dx}px,${dy+400}px) rotate(${Math.random()*720}deg)`,opacity:0}],{duration:1200+Math.random()*700,easing:"cubic-bezier(.2,.7,.4,1)"}).onfinish=()=>p.remove()}}
function floatMoney(text,good){const el=document.createElement("div");el.className="float-money";el.textContent=text;
  el.style.cssText+=`;left:${innerWidth/2-40}px;top:${innerHeight*.4}px;color:${good?"#0b7a56":"#ef4b4b"};text-shadow:0 2px 0 #fff`;$("fx").appendChild(el);setTimeout(()=>el.remove(),1500)}
function countTo(el,to,fmt=money){const from=el._v??to;el._v=to;if(reduced||from===to){el.textContent=fmt(to);return}
  const t0=performance.now(),D=700;(function f(t){const k=Math.min(1,(t-t0)/D);el.textContent=fmt(Math.round(from+(to-from)*(1-Math.pow(1-k,3))));if(k<1&&el._v===to)requestAnimationFrame(f)})(t0)}
function overlay(html,cls,ms){const o=$("ov");o.className=cls||"";o.innerHTML=html;clearTimeout(o._t);o._t=setTimeout(()=>o.classList.add("hidden"),ms)}
function countdown(){let n=3;const tick=()=>{if(n>0){overlay(`<div class="big" style="color:#fff">${n}</div>`,"",900);play("tick");n--;setTimeout(tick,800)}
  else{overlay(`<div class="big" style="color:#2fc27a">GO!</div>`,"",900);play("go");particles(24,"confetti")}};tick()}
function soldAnimation(s){overlay(`<div><div style="font-size:90px" class="hammer-swing">🔨</div><div class="big">SOLD!</div><div class="sub">${esc(s.current_bidder||"")} · ${money(s.current_bid)}</div></div>`,"sold",1900);
  play("hammer");setTimeout(()=>play("sold"),200);particles(40,"coin")}

/* ---- screens ---- */
function show(id){["start","join","rules","game"].forEach(x=>$(x).classList.toggle("hidden",x!==id))}
function showJoin(){started=true;show("join");startAudio();play("click")}
function showRules(){rulesFromStart=true;buildRules();$("rulesBtn").textContent="Back";show("rules")}
function hostMode(){started=true;startAudio();show("join")}
function buildRules(){const R=[["💰","Starting capital","$1,000"],["🔨","Maximum bid","$1,000"],["✅","Correct answer","+$500"],["❌","Wrong answer","−$100","bad"],["🎯","Total questions","10"],["⏱️","Time to answer","10 s or −$100","bad"],["🏆","Winner","Highest balance"]];
  $("rgrid").innerHTML=R.map((r,i)=>`<div class="rule ${r[3]||""}" style="animation-delay:${i*.12}s"><em>${r[0]}</em><small>${r[1]}</small><b>${r[2]}</b></div>`).join("")}

/* ---- websocket ---- */
function connect(){
  const proto=location.protocol==="https:"?"wss":"ws";
  ws=new WebSocket(`${proto}://${location.host}/ws/${encodeURIComponent(room)}/${role}`);
  ws.onopen=()=>{$("status").textContent="🟢 Online";ws.send(JSON.stringify({name:myName,password:hostPw}))};
  ws.onclose=()=>{$("status").textContent="🔴 Offline"};
  ws.onerror=()=>{$("status").textContent="🔴 Error"};
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.type==="error"){alert(m.message);return}
    if(m.type==="state"){prev=latest;latest=m.state;render()}};
}

/* ---- actions ---- */
function join(){myName=($("name").value||"").trim();if(!myName){alert("Please enter a nickname.");return}
  role="student";room=($("room").value||"FA2026").trim().toUpperCase();startAudio();connect();rulesFromStart=false;buildRules();$("rulesBtn").textContent="I'm ready!";show("rules")}
function host(){const p=prompt("Host password (leave empty if running locally):");if(p===null)return;hostPw=p.trim();
  role="host";myName="HOST";document.body.classList.add("host");room=($("room").value||"FA2026").trim().toUpperCase();startAudio();connect();show("game")}
function ready(){if(rulesFromStart){rulesFromStart=false;show("start")}else show("game")}
function send(action,extra={}){if(ws&&ws.readyState===1)ws.send(JSON.stringify({action,...extra}))}
let lastBid=0; // 350 ms cooldown: stops accidental double-taps from flooding the server
const bid=a=>{const t=Date.now();if(t-lastBid<350)return;lastBid=t;play("bid");send("bid",{amount:a})};
const pick=i=>send("answer",{index:i});

/* ---- render: reacts to state diffs, then paints ---- */
function effects(s){ // sounds + animations from prev -> latest
  const me=s.player,pme=prev&&prev.player;
  if(!prev)return;
  if(role==="host"&&s.phase==="round_end"&&prev.phase!=="round_end"){const a=s.current_bidder_balance,b=prev.current_bidder_balance;
    if(a!=null&&b!=null&&a!==b){const d=a-b;floatMoney(s.current_bidder+" "+(d>0?"+":"−")+money(Math.abs(d)),d>0)}}
  if(s.phase==="auction"&&prev.phase!=="auction")countdown();
  if(s.phase==="auction"&&prev.phase==="auction"&&s.current_bid>prev.current_bid){
    play("bid");retrigger($("bid"),"number-pop");retrigger($("bidflash"),"on");retrigger($("hammer"),"hammer-swing");retrigger($("leader"),"hot");
    const r=$("bid").getBoundingClientRect();particles(6,"coin",r.left+r.width/2,r.top)}
  if(s.phase==="challenge"&&prev.phase!=="challenge")soldAnimation(s);
  if(s.phase==="round_end"&&prev.phase!=="round_end"){
    if(s.last_correct){play("correct");particles(50,"confetti")}else play("wrong")}
  if(s.phase==="finished"&&prev.phase!=="finished"){play("win");particles(120,"confetti");setTimeout(()=>particles(40,"coin"),500)}
  if(me&&pme&&me.balance!==pme.balance){const d=me.balance-pme.balance,b=$("balance");
    floatMoney((d>0?"+":"−")+money(Math.abs(d)),d>0);b.classList.remove("up","down");void b.offsetWidth;b.classList.add(d>0?"up":"down");
    setTimeout(()=>b.classList.remove("up","down"),900);if(d>0)setTimeout(()=>play("money"),250)}
}


/* ---- source material: ca_u_ho_i_cu_a_topic_15.docx (authoritative wording) ----
   Server grades by option INDEX in its own order. For each question, `sc` = server's correct index,
   `c` = correct index in the docx order. `map[j]` converts a docx option j -> server index (bijection),
   so a mini-game can show the docx wording but always sends a valid server index.
   Matched by the server's question title; unknown/mismatched questions fall back to classic A/B/C/D. */
const SRC={
"Mission Scanner":{h:"Primary Scope & Objective",fmt:"folder",sc:0,c:1,q:"What is the primary focus of Topic 15 in the ACCA Business and Technology (BT) syllabus?",
 o:["Financial statement analysis and cash flow management.","Personal effectiveness, time management, personal development planning, and workplace communication.","Marketing strategy formulation and competitor analysis.","Corporate risk governance and external auditing."],
 why:"Topic 15 corresponds to Section E of the ACCA BT syllabus (“Personal effectiveness and communication in business”), equipping learners with tools for self-management, time allocation, work planning, coaching/mentoring, and effective workplace communication."},
"SMART Builder":{h:"Personal Development Planning (PDP)",fmt:"blank",sc:0,c:0,q:"When creating a Personal Development Plan (PDP), learning objectives should satisfy which established criteria?",
 o:["The SMART criteria (Specific, Measurable, Agreed/Achievable, Realistic, Timely).","The 5Ps of Marketing.","The SPAMSOAP internal control framework.","PESTEL macroeconomic analysis."],
 why:"In personal development planning (PDP), learning objectives must follow the SMART framework (Specific, Measurable, Agreed/Achievable, Realistic, and Timely)."},
"Time Allocation":{h:"Definition of Time Management",fmt:"hourglass",sc:1,c:1,q:"How is Time Management defined within an organizational context?",
 o:["Working continuously without breaks to complete every incoming task.","The process of allocating the scarce resource of time to tasks in the most effective manner.","Delegating 100% of operational duties to subordinates.","Prioritising incoming telephone calls over long-term strategic plans."],
 why:"Time is a scarce resource. Time management is the systematic process of allocating time effectively to tasks to achieve personal and organizational goals."},
"Inbox Rescue":{h:"Managing In-Trays (The ABCD Method)",fmt:"drag",sc:1,c:1,q:"In the ABCD method for managing an in-tray, what does the letter “B” stand for?",
 o:["Build it into a long-term project.","Bin it (discard if worthless or unnecessary).","Broadcast it to the whole company.","Back it up on a central server."],
 why:"The ABCD method of in-tray management stands for: Act on it immediately, Bin it (discard if worthless/unnecessary), Create a plan to return to it later, and Delegate it to someone else."},
"Manager Decision":{h:"Golden Rule of Delegation",fmt:"matrix",sc:1,c:2,q:"According to time management principles, how should a manager handle a task that is Urgent but NOT Important?",
 o:["Execute it personally immediately.","Ignore it permanently.","Delegate it to someone else.","Include it in the 5-year corporate strategy."],
 why:"Tasks that are urgent but not important add low value to a manager's core responsibilities and should be delegated to free up time for high-value/important tasks."},
"Sequence Rush":{h:"The 4 Steps of Work Planning",fmt:"track",sc:1,c:1,q:"Work planning involves four basic steps. What is the correct sequence of these steps?",
 o:["Task Allocation → Scheduling → Establishing Priorities → Task Sequencing","Establishing Priorities → Task Loading & Allocation → Task Sequencing → Scheduling","Scheduling → Reporting → Evaluating → Binning","Risk Assessment → Auditing → Capital Allocation → Recruitment"],
 why:"The four basic steps in work planning are: (1) Establishing priorities → (2) Task loading & allocation → (3) Task sequencing → (4) Scheduling."},
"Role Match":{h:"Coaching vs. Mentoring",fmt:"versus",sc:0,c:0,q:"What is a key distinction between Coaching and Mentoring?",
 o:["Coaching is short-term and focuses on current job skills; Mentoring is a long-term relationship fostering broader career and personal development.","Coaching is delivered by external computer software, whereas Mentoring is done by senior executives.","Coaching is exclusively for senior executives, whereas Mentoring is for entry-level trainees.","Coaching and Mentoring are identical concepts with no operational difference."],
 why:"Coaching focuses on helping a trainee develop specific skills for their current job performance (often led by an immediate superior). Mentoring is a broader, long-term relationship (often with a senior person outside direct line management) focusing on career and personal growth."},
"Signal Repair":{h:"The Communication Process",fmt:"loop",sc:1,c:2,q:"In the classic radio signal model of communication, which element ensures that the sender knows whether the receiver has correctly decoded and understood the message?",
 o:["Medium","Noise","Feedback","Encoding"],
 why:"Feedback closes the communication loop, enabling the sender to verify that the receiver correctly decoded, understood, and interpreted the message as intended."},
"Communication Crisis":{h:"Barriers to Communication",fmt:"flood",sc:0,c:0,q:"Which barrier to communication occurs when an individual receives more information than they can digest and process within the available time?",
 o:["Information Overload","System Dependency","Lateral Communication","Grapevine Distortion"],
 why:"Information overload occurs when a receiver receives too much information to digest in the time available, creating a major barrier to clear communication."},
"Final Boss":{h:"Overall Value of Topic 15",fmt:"boss",sc:1,c:0,q:"Why is mastering Topic 15 essential for individuals and managers within an organisation?",
 o:["It optimizes personal productivity, reduces wasted time, and ensures clear organizational communication.","It allows companies to legally avoid tax liabilities.","It eliminates the need for independent external auditing.","It automates factory assembly lines without human supervision."],
 why:"Topic 15 enables individuals to work smarter, manage time as a scarce resource, communicate effectively, and align personal performance with overarching organizational goals."}
};
Object.values(SRC).forEach(S=>{const oth=[0,1,2,3].filter(x=>x!==S.sc);let k=0;S.map=S.o.map((_,j)=>j===S.c?S.sc:oth[k++])});
const src=q=>q&&SRC[q.title]||null;
/* answer reveal: docx wording when the mapping agrees with the server's answer, else server wording */
function reveal(q,S){return S&&S.map[S.c]===q.answer?{l:L[S.c],t:S.o[S.c],ok:true}:{l:L[q.answer],t:q.options[q.answer],ok:false}}

/* ---- mini-game stages: each format = decoration + interaction, all resolve to pick(serverIndex) ---- */
let curS=null;
const DECO={
 folder:()=>`<div class="deco">🗂️ Open the right syllabus folder</div>`,
 blank:()=>`<div class="deco">PDP learning objectives must satisfy: <span id="blank" class="blank">_____</span></div>`,
 hourglass:()=>`<div class="deco"><span class="hg">⏳</span> Time is a <b>scarce resource</b> — lock in the definition</div>`,
 drag:()=>`<div class="deco">Drag <span class="token" draggable="true" ondragstart="event.dataTransfer.setData('text','B')">B</span> onto its meaning, or tap the meaning</div>`,
 matrix:()=>`<div class="mx"><div>Urgent<br>+ Important<br><small>Do now</small></div><div>Important<br>not urgent<br><small>Plan</small></div><div class="hot">URGENT<br>NOT IMPORTANT<br><small>?</small></div><div>Neither<br><small>Drop</small></div></div>`,
 track:()=>`<div class="deco">🛤️ Which track runs in the correct order?</div>`,
 versus:()=>`<div class="deco vs"><div>🏃 Coaching</div><b>VS</b><div>🧭 Mentoring</div></div>`,
 loop:()=>`<div class="deco loop">🧑‍💼 Sender <em>→</em> ✉️ Message <em>→</em> 👂 Receiver <em>⤺</em> <span class="gap">❓</span> <em>⤺</em> 🧑‍💼</div>`,
 flood:()=>`<div class="deco flood">${"✉️".repeat(8).split("").length?[...Array(8)].map((_,i)=>`<span style="left:${6+i*12}%;animation-delay:${i*.35}s">✉️</span>`).join(""):""}<div class="meter"><div></div></div></div>`,
 boss:(dead)=>`<div class="deco boss">👾 FINAL BOSS<div class="hp"><div style="width:${dead?0:100}%"></div></div></div>`
};
function ans(j){const S=curS;if(!S)return;
  if(S.fmt==="blank"){const b=$("blank");if(b){b.textContent=S.o[j];b.classList.add("filled")}setTimeout(()=>pick(S.map[j]),450)}
  else pick(S.map[j])}
function stage(s,q,S,winner,done){
  S=S||{fmt:"classic",o:q.options,map:q.options.map((_,i)=>i),c:q.answer};curS=S;
  const can=s.phase==="challenge"&&winner,pj=done?S.map.indexOf(s.picked):-1;
  const cls=j=>done?(j===S.c?"ok":(j===pj?"bad":"dim")):"",mk=j=>done?(j===S.c?"✓":(j===pj?"✗":"")):"";
  const deco=DECO[S.fmt]?DECO[S.fmt](done&&s.last_correct):"";
  const items=S.o.map((t,j)=>{
    const body=S.fmt==="track"?`<span class="steps">${t.split("→").map((x,n)=>`<b>${n+1}</b>${esc(x.trim())}`).join("<em>→</em>")}</span>`:`<span>${esc(t)}</span>`;
    const drop=S.fmt==="drag"&&can?` ondragover="event.preventDefault()" ondrop="ans(${j})"`:"";
    return `<button class="opt ${cls(j)}" ${can?"":"disabled"} onclick="ans(${j})"${drop}><i>${S.fmt==="folder"?"📁":L[j]}</i>${body}<u>${mk(j)||ICONS[j]}</u></button>`}).join("");
  return `<div class="stage f-${S.fmt}">${deco}<div class="opts${S.fmt==="track"||S.fmt==="versus"?" one":""}">${items}</div></div>`}

function podium(s){const P=s.players,o=[1,0,2],med=["🥇","🥈","🥉"],cls=["p1","p2","p3"];
  const me=s.player;
  return `<div class="card white scale-in"><h2 class="center">FINAL RESULTS</h2><div class="center"><svg width="90" height="90" class="float"><use href="#trophy"/></svg>
  <div>WINNER</div><h2>${P[0]?esc(P[0].name):"—"}</h2><div>Final balance</div><div class="bal" style="color:#0b7a56">${P[0]?money(P[0].balance):"$0"}</div></div>
  <div class="podium">${o.filter(i=>P[i]).map(i=>`<div class="pod ${cls[i]}"><div><em>${med[i]}</em><span class="n">${esc(P[i].name)}</span><br>${money(P[i].balance)}</div></div>`).join("")}</div>
  ${me?`<div class="stats3"><div><b>${me.correct}</b>Correct answers</div><div><b>${money(me.total_bid)}</b>Total amount bid</div><div><b>${money(me.balance)}</b>Final balance</div></div>`:""}</div>`}

function render(){
  const s=latest,q=s.question,me=s.player,isHost=role==="host",fin=s.phase==="finished";
  effects(s);const S=src(q);
  $("round").textContent=`Question ${String(Math.min(s.round_number,s.total_rounds)).padStart(2,"0")} / ${s.total_rounds}`;
  $("phase").textContent=s.phase.replace("_"," ");
  countTo($("bid"),s.current_bid);
  $("bidder").textContent=s.current_bidder||"—";
  $("leader").classList.toggle("hidden",!s.current_bidder&&false);
  $("question").innerHTML=fin?`<svg viewBox="0 0 100 100"><use href="#trophy"/></svg><small>Finance Auction</small>🏆 Final results<small>${s.players[0]?esc(s.players[0].name)+" wins with "+money(s.players[0].balance):""}</small>`
    :q?`<svg viewBox="0 0 100 100"><use href="#chart"/></svg><small>Question ${String(Math.min(s.round_number,s.total_rounds)).padStart(2,"0")} · ${esc(S?S.h:q.title)}</small>${esc(S?S.q:q.question)}`
    :`<svg viewBox="0 0 100 100"><use href="#chart"/></svg>Waiting for host…`;
  $("hostCard").classList.toggle("hidden",!isHost);
  $("auctionCard").classList.toggle("hidden",fin);
  if(isHost){$("balance").textContent="HOST";$("balance")._v=undefined;$("stats").innerHTML=`<span class="pill">${s.player_count??s.players.length} players</span>`}
  else if(me){countTo($("balance"),me.balance);
    $("stats").innerHTML=`<span class="pill">Correct ${me.correct}</span><span class="pill">Bid ${money(me.total_bid)}</span>`}

  // leaderboard: medals, highlight me, flash rows whose balance changed
  const medal=["🥇","🥈","🥉"],old={};(prev?prev.players:[]).forEach((p,i)=>old[p.name]={b:p.balance,i});
  $("players").innerHTML=s.players.map((p,i)=>{const o=old[p.name],ch=o&&(o.b!==p.balance||o.i!==i);
    return `<div class="row${me&&p.name===me.name?" me":""}${ch?" flash":""}"><span>${medal[i]||(i+1)+"."} ${esc(p.name)}</span><b>${money(p.balance)}</b></div>`}).join("")+(me&&me.rank&&!s.players.some(p=>p.name===me.name)?`<div class="row me"><span>#${me.rank} ${esc(me.name)}</span><b>${money(me.balance)}</b></div>`:"");

  const max=me?Math.min(s.max_bid,me.balance):0;
  $("bidButtons").innerHTML=isHost?"":[100,200,300,400,500,600,700,800,900,1000]
    .map(x=>`<button class="chip" ${x>max||x<=s.current_bid||s.phase!=="auction"||timeUp(s)?"disabled":""} onclick="bid(${x})">${money(x)}</button>`).join("");

  const winner=me&&s.current_bidder===me.name,done=s.phase==="round_end";
  $("answers").innerHTML=fin?podium(s):q&&q.options?stage(s,q,S,winner,done):"";
  const ra=done&&q?reveal(q,S):null;let r="";
  if(s.phase==="challenge")r=`<p class="hint">${winner?"You won the bid — pick your answer within 10 seconds!":esc(s.current_bidder||"")+" is answering…"}</p>`;
  if(s.phase==="auction"&&!isHost)r=`<p class="hint">Bid to win the right to answer.</p>`;
  if(done){const q2=ra.t;
    r=s.last_correct?`<div class="result ok">✅ Correct! ${ra.l} — ${esc(q2)}<br>+$500 for ${esc(s.current_bidder)}</div>`
      :`<div class="result bad">${s.picked==null?"⏰ Time's up!":"❌ Wrong!"} Answer: ${ra.l} — ${esc(q2)}<br>−$100 for ${esc(s.current_bidder)}</div>`}
  $("result").innerHTML=r+(ra&&ra.ok?`<div class="why"><b>Why?</b> ${esc(S.why)}</div>`:"");
  hostNext(s);timerSync(s);
}

/* ---- timers: auction (bidding) + challenge (answering) ----
   Runs in each browser; server.py is unchanged. The HOST's browser acts at 0:
   auction -> sends "sold" · challenge -> sends "mark_answer" {correct:false} (existing server action = -$100, same as a wrong answer).
   Change the constants below to adjust. RESET_ON_BID=true restarts the bidding clock after each new bid. */
const AUCTION_SECONDS=15,ANSWER_SECONDS=10,RESET_ON_BID=false;
let tEnd=0,tKey="",tFired="",tLastBid=0,tShown=null,tDur=0;
const tPhase=s=>s.phase==="auction"||s.phase==="challenge";
const timeUp=s=>s.phase==="auction"&&tKey===s.phase+s.round&&Date.now()>=tEnd;
function timerSync(s){
  if(!tPhase(s)){tKey="";return}
  const key=s.phase+s.round;
  if(tKey!==key){tKey=key;tFired="";tLastBid=s.current_bid;tDur=(s.phase==="auction"?AUCTION_SECONDS:ANSWER_SECONDS)*1000;
    tEnd=Date.now()+(prev&&prev.phase!==s.phase?(s.phase==="auction"?2400:2000):0)+tDur} // wait for the countdown / SOLD overlay
  else if(RESET_ON_BID&&s.phase==="auction"&&s.current_bid>tLastBid){tLastBid=s.current_bid;tEnd=Date.now()+tDur}}
setInterval(()=>{const s=latest,el=$("timer");
  if(!s||!tPhase(s)||tKey!==s.phase+s.round){el.classList.add("hidden");return}
  const auc=s.phase==="auction",ms=tEnd-Date.now(),sec=Math.max(0,Math.ceil(Math.min(ms,tDur)/1000));
  el.classList.remove("hidden");el.textContent=ms>0?"⏱ "+sec:(auc?(s.current_bidder?"TIME!":"No bids"):"TIME'S UP!");
  el.classList.toggle("warn",ms>0&&sec<=5);
  if(sec!==tShown){tShown=sec;if(ms>0&&sec<=5&&started)play("tick")}
  if(ms<=0){
    if(auc){document.querySelectorAll("#bidButtons .chip").forEach(b=>b.disabled=true);
      if(role==="host"&&tFired!==tKey&&s.current_bidder){tFired=tKey;send("sold")}}
    else{document.querySelectorAll("#answers .opt").forEach(b=>b.disabled=true);
      if(role==="host"&&tFired!==tKey){tFired=tKey;send("mark_answer",{correct:false})}}}},100);
/* ---- host: highlight the next logical control, Space triggers it ---- */
function hostNext(s){if(role!=="host")return;const m={lobby:"open_auction",auction:"sold",round_end:"next_round",finished:"reset"}[s.phase];
  document.querySelectorAll("#hostCard [data-act]").forEach(b=>b.classList.toggle("next",b.dataset.act===m))}
document.addEventListener("keydown",e=>{if(role==="host"&&e.code==="Space"&&!e.repeat){e.preventDefault();const b=document.querySelector("#hostCard .next");if(b)b.click()}});
/* ---- init: background coins ---- */
(function(){if(reduced)return;const bg=$("bg");for(let i=0;i<9;i++){const c=document.createElement("i");
  c.style.left=Math.random()*96+"%";c.style.animationDuration=14+Math.random()*14+"s";c.style.animationDelay=-Math.random()*20+"s";
  c.style.transform=`scale(${.6+Math.random()*.7})`;bg.appendChild(c)}})();
buildRules();
