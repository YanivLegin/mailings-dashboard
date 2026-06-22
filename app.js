let dashboardData = null;
let charts = {};
let allRecs = [];

document.addEventListener("DOMContentLoaded", loadDashboardData);

function loadDashboardData() {
    fetch('./data.json')
        .then(r => r.json())
        .then(data => {
            dashboardData = data;
            document.getElementById("last-updated-text").innerText = `עודכן: 22/06/2026`;
            populateSelectors();
            updateKPIs();
            renderAdminStrip();
            renderRecipientGroupsCheckboxes();
            renderCharts();
            renderRecipientInfluenceCards();
            renderMailingActivityGrid();
            renderRecommendations();
            renderHistoryTable(data.mailings);
            setupTableListeners();
            runPrediction();
            setupSimulatorListeners();
        })
        .catch(err => { console.error(err); alert("שגיאה בטעינת data.json"); });
}

/* ─── Selectors ─── */
function populateSelectors() {
    const cats = Object.keys(dashboardData.categories);
    ["sim-category","chart-category-filter","category-filter"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const prefix = id === "sim-category" ? "" : `<option value="all">${id === "chart-category-filter" ? "כל הקטגוריות (ממוצע)" : "כל הקטגוריות"}</option>`;
        el.innerHTML = prefix + cats.map(c => `<option value="${c}">${c}</option>`).join("");
    });
}

/* ─── KPIs ─── */
function updateKPIs() {
    const s = dashboardData.overall_stats;
    document.getElementById("kpi-total-mailings").innerText = s.total_mailings;
    document.getElementById("kpi-total-sent").innerText     = s.total_sent.toLocaleString();
    document.getElementById("kpi-avg-open").innerText       = `${s.avg_open_rate}%`;
    document.getElementById("kpi-avg-click").innerText      = `${s.avg_click_rate}%`;
    document.getElementById("kpi-bounce-rate").innerText    = `${s.bounce_rate}%`;
    const monthly = dashboardData.monthly_statistics;
    const avgPerMonth = Math.round(s.total_mailings / monthly.length);
    document.getElementById("kpi-avg-monthly").innerText    = avgPerMonth;
}

/* ─── Admin insight strip ─── */
function renderAdminStrip() {
    const s  = dashboardData.overall_stats;
    const corr = dashboardData.subject_correlation;

    /* Deliverability badge */
    const badge = document.getElementById("health-badge");
    const detail = document.getElementById("health-detail");
    if (s.bounce_rate < 0.1) {
        badge.innerHTML  = `<i class="fa-solid fa-circle-check"></i> מצוינת (${s.bounce_rate}% bounce)`;
        badge.style.color = "var(--accent-green)";
        detail.innerText = `${s.total_bounces.toLocaleString()} הודעות לא נמסרו מתוך ${s.total_sent.toLocaleString()} שליחות`;
    } else if (s.bounce_rate < 1.0) {
        badge.innerHTML  = `<i class="fa-solid fa-triangle-exclamation"></i> גבולית (${s.bounce_rate}%)`;
        badge.style.cssText += ";color:var(--accent-orange);background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.2)";
        detail.innerText = `${s.total_bounces.toLocaleString()} חזרות — מומלץ לנקות רשימות`;
    } else {
        badge.innerHTML  = `<i class="fa-solid fa-circle-exclamation"></i> גבוהה! (${s.bounce_rate}%)`;
        badge.style.cssText += ";color:var(--accent-red);background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.2)";
    }

    /* Global best hour */
    const mailings = dashboardData.mailings;
    const hourSums = {};
    mailings.forEach(m => {
        const h = parseInt(m.time.split(":")[0]);
        if (!hourSums[h]) hourSums[h] = { sum:0, count:0 };
        hourSums[h].sum += m.open_rate; hourSums[h].count++;
    });
    const bestH = Object.entries(hourSums).sort((a,b)=>(b[1].sum/b[1].count)-(a[1].sum/a[1].count))[0];
    const hr = bestH ? parseInt(bestH[0]) : 12;
    document.getElementById("global-best-hour").innerText     = `${hr.toString().padStart(2,"0")}:00 – ${(hr+1).toString().padStart(2,"0")}:00`;
    document.getElementById("global-best-hour-sub").innerText = `ממוצע פתיחה: ${Math.round(bestH[1].sum/bestH[1].count)}%`;

    /* Global best day */
    const daysData = dashboardData.days_of_week;
    const bestDay  = Object.entries(daysData).sort((a,b)=>b[1].avg_open-a[1].avg_open)[0];
    document.getElementById("global-best-day").innerText = `יום ${bestDay[0]}`;

    /* Subject correlation */
    const c = corr.char_len_open_corr.toFixed(3);
    const el = document.getElementById("subject-corr");
    el.innerText = c;
    el.style.color = c < 0 ? "var(--accent-green)" : "var(--accent-red)";
}

/* ─── Recipient Groups — initial render ─── */
function renderRecipientGroupsCheckboxes() {
    const firstCat = document.getElementById("sim-category").value;
    renderGroupsForCategory(firstCat);
}

/* Render groups relevant to a specific category */
function renderGroupsForCategory(cat) {
    const container = document.getElementById("groups-checkboxes-container");
    const hint      = document.getElementById("groups-category-hint");
    const catGroups = dashboardData.category_groups?.[cat] ?? [];
    const fallback  = Object.keys(dashboardData.recipient_groups_influence).slice(0, 6);
    const groups    = catGroups.length > 0 ? catGroups : fallback;

    hint.innerText = catGroups.length > 0
        ? `— קבוצות ייחודיות לקטגוריה "${cat}"`
        : "— קבוצות נפוצות כלליות";

    container.innerHTML = groups.map(g => {
        const key = g.replace(/[^a-z0-9]/gi,'_');
        return `
        <div class="group-chk-item" id="chkwrap-${key}">
            <input type="checkbox" value="${g}" id="chk-${key}">
            <label for="chk-${key}" style="cursor:pointer">${g}</label>
        </div>`;
    }).join("");

    container.querySelectorAll("input[type=checkbox]").forEach(chk => {
        chk.addEventListener("change", () => {
            chk.closest(".group-chk-item").classList.toggle("checked", chk.checked);
            runPrediction();
        });
    });
}

/* ─── Simulator Listeners ─── */
function setupSimulatorListeners() {
    document.getElementById("sim-category").addEventListener("change", e => {
        renderGroupsForCategory(e.target.value);
        runPrediction();
    });
    ["sim-day","sim-hour","sim-holiday"].forEach(id =>
        document.getElementById(id).addEventListener("change", runPrediction)
    );
}

/* ─── Prediction Model ─── */
function runPrediction() {
    if (!dashboardData) return;
    const m   = dashboardData.model_coefficients;
    const cat = document.getElementById("sim-category").value;
    const day = parseInt(document.getElementById("sim-day").value);
    const hrB = document.getElementById("sim-hour").value;
    const holidayVal = document.getElementById("sim-holiday").value;  // "none" or "near"
    const isH = holidayVal !== "none";
    const selGroups = [...document.querySelectorAll('#groups-checkboxes-container input:checked')].map(c=>c.value);

    let pO = m.intercept_opens, pC = m.intercept_clicks;
    if (m.category_effects[cat])  { pO += m.category_effects[cat].opens;  pC += m.category_effects[cat].clicks  }
    if (m.day_effects[day])        { pO += m.day_effects[day].opens;        pC += m.day_effects[day].clicks        }
    if (m.hour_bin_effects[hrB])   { pO += m.hour_bin_effects[hrB].opens;   pC += m.hour_bin_effects[hrB].clicks   }
    const hk = isH ? "true" : "false";
    if (m.holiday_effects[hk])     { pO += m.holiday_effects[hk].opens;     pC += m.holiday_effects[hk].clicks     }
    selGroups.forEach(g => { if (m.group_effects[g]) { pO += m.group_effects[g].opens; pC += m.group_effects[g].clicks } });

    pO = Math.max(0, Math.round(pO*100)/100);
    pC = Math.max(0, Math.round(pC*100)/100);

    document.getElementById("pred-open-val").innerText  = `${pO}%`;
    document.getElementById("pred-click-val").innerText = `${pC}%`;
    document.getElementById("pred-open-circle").style.setProperty("--value",  Math.min(100, Math.round(pO*1.4)));
    document.getElementById("pred-click-circle").style.setProperty("--value", Math.min(100, Math.round(pC*10)));

    const gO = dashboardData.overall_stats.avg_open_rate;
    const gC = dashboardData.overall_stats.avg_click_rate;
    setDiff("pred-open-diff",  Math.round((pO-gO)*100)/100);
    setDiff("pred-click-diff", Math.round((pC-gC)*100)/100);

    const score = Math.min(100, Math.max(0, Math.round((pO/70)*60 + (pC/8)*40)));
    document.getElementById("pred-score").innerText = ["C","C+","B","B+","A","A+","S"][[0,15,30,45,60,75,90].findLastIndex(t=>score>=t)] ?? "C";
    document.getElementById("pred-score-bar").style.width = `${score}%`;
    generateAdvice(cat, day, hrB);
}

function setDiff(id, diff) {
    const el = document.getElementById(id);
    el.className = `meter-sub ${diff>=0?"good":"bad"}`;
    el.innerHTML = `<i class="fa-solid fa-caret-${diff>=0?"up":"down"}"></i> ${Math.abs(diff)}% מהממוצע`;
}

function generateAdvice(cat, day, hourBin) {
    const cs = dashboardData.categories[cat];
    if (!cs) return;
    const bhr = cs.best_hour;
    const binMap = [[7,10,"בוקר (07:00-11:00)"],[11,13,"צהריים (11:00-14:00)"],[14,17,"אחר הצהריים (14:00-18:00)"],[18,21,"ערב (18:00-22:00)"]];
    const bestBin = binMap.find(([lo,hi])=>bhr>=lo&&bhr<=hi)?.[2] ?? "צהריים (11:00-14:00)";
    const dayNames = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
    const selDay = dayNames[day];
    let txt;
    if (selDay !== cs.best_day && hourBin !== bestBin) txt = `לקבלת שיא מעורבות בקטגוריה <b>${cat}</b>, העבר את הדיוור ליום <b>${cs.best_day}</b> בשעות <b>${bestBin}</b>.`;
    else if (selDay !== cs.best_day) txt = `השעה מעולה! מומלץ לשנות ליום <b>${cs.best_day}</b> לתוצאות מרביות.`;
    else if (hourBin !== bestBin) txt = `יום ${selDay} הוא יום השיא! הזז את שעת השליחה ל<b>${bestBin}</b> לאחוזי פתיחה מרביים.`;
    else txt = `<b>תזמון מושלם!</b> יום ${selDay} + ${hourBin} הם האופציה האופטימלית לקטגוריית <b>${cat}</b>. 🎯`;
    document.getElementById("pred-advice-text").innerHTML = txt;
}

/* ─── All Charts ─── */
function renderCharts() {
    const cats  = dashboardData.categories;
    const days  = dashboardData.days_of_week;
    const mo    = dashboardData.monthly_statistics;
    const bcat  = dashboardData.category_bounces;
    const kw    = dashboardData.keyword_stats;
    const mails = dashboardData.mailings;

    const chartDefaults = {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:"#f3f4f6", font:{ family:"Heebo" } } } }
    };
    const gridColor = "rgba(255,255,255,.05)";
    const tickColor = "#9ca3af";
    const axisBase  = { grid:{ color:gridColor }, ticks:{ color:tickColor } };

    /* 1. Category open vs click */
    charts.cat = new Chart(document.getElementById("categoryChart"), {
        type:"bar", data:{
            labels: Object.keys(cats),
            datasets:[
                { label:"% פתיחה", data:Object.values(cats).map(c=>c.avg_open), backgroundColor:"rgba(6,182,212,.6)", borderColor:"rgba(6,182,212,1)", borderWidth:1, yAxisID:"y" },
                { label:"% הקלקות", data:Object.values(cats).map(c=>c.avg_click), backgroundColor:"rgba(16,185,129,.6)", borderColor:"rgba(16,185,129,1)", borderWidth:1, yAxisID:"y1" }
            ]
        },
        options:{ ...chartDefaults, scales:{ y:{ ...axisBase, position:"right", title:{display:true,text:"% פתיחה",color:tickColor} }, y1:{ ...axisBase, position:"left", grid:{drawOnChartArea:false}, title:{display:true,text:"% הקלקות",color:tickColor} }, x:{ ticks:{color:tickColor} } } }
    });

    /* 2. Hourly — interactive */
    updateHourlyChart("all");
    document.getElementById("chart-category-filter").addEventListener("change", e => updateHourlyChart(e.target.value));

    /* 3. Days of week */
    charts.days = new Chart(document.getElementById("daysChart"), {
        type:"bar", data:{
            labels:Object.keys(days),
            datasets:[
                { label:"% פתיחה", data:Object.values(days).map(d=>d.avg_open), backgroundColor:"rgba(99,102,241,.65)", borderColor:"rgba(99,102,241,1)", borderWidth:1 },
                { label:"% הקלקות", data:Object.values(days).map(d=>d.avg_click), backgroundColor:"rgba(16,185,129,.65)", borderColor:"rgba(16,185,129,1)", borderWidth:1 }
            ]
        },
        options:{ ...chartDefaults, scales:{ y:axisBase, x:{ ticks:{color:tickColor} } } }
    });

    /* 4. Monthly volumes + open rate */
    charts.monthly = new Chart(document.getElementById("monthlyChart"), {
        type:"bar", data:{
            labels:mo.map(m=>m.month_name),
            datasets:[
                { type:"bar",  label:"נמענים שנשלחו", data:mo.map(m=>m.total_sent), backgroundColor:"rgba(99,102,241,.45)", borderColor:"rgba(99,102,241,.8)", borderWidth:1, yAxisID:"y" },
                { type:"line", label:"% פתיחה ממוצע", data:mo.map(m=>m.avg_open), borderColor:"rgba(16,185,129,1)", backgroundColor:"rgba(16,185,129,.1)", fill:false, tension:.35, borderWidth:2, yAxisID:"y1" }
            ]
        },
        options:{ ...chartDefaults, scales:{ y:{ ...axisBase, position:"right", title:{display:true,text:"נמענים",color:tickColor} }, y1:{ ...axisBase, position:"left", grid:{drawOnChartArea:false}, title:{display:true,text:"% פתיחה",color:tickColor} }, x:{ ticks:{color:tickColor} } } }
    });

    /* 5. NEW — Top 10 mailings by open rate (horizontal bar) */
    const top10 = [...mails].sort((a,b)=>b.open_rate-a.open_rate).slice(0,10);
    charts.top = new Chart(document.getElementById("topMailingsChart"), {
        type:"bar",
        data:{
            labels: top10.map(m => m.subject.length > 30 ? m.subject.slice(0,30)+"…" : m.subject),
            datasets:[{
                label:"% פתיחה",
                data: top10.map(m=>m.open_rate),
                backgroundColor: top10.map((_,i) => `hsla(${220+i*12},80%,60%,.75)`),
                borderColor:     top10.map((_,i) => `hsla(${220+i*12},80%,60%,1)`),
                borderWidth:1
            }]
        },
        options:{
            ...chartDefaults,
            indexAxis:"y",
            scales:{ x:{ ...axisBase, title:{display:true,text:"% פתיחה",color:tickColor} }, y:{ ticks:{ color:tickColor, font:{ family:"Heebo", size:10 } } } }
        }
    });

    /* 6. NEW — Category distribution (donut) */
    const catCounts = Object.entries(cats).map(([k,v])=>({ name:k, count:v.count }));
    charts.dist = new Chart(document.getElementById("categoryDistChart"), {
        type:"doughnut",
        data:{
            labels: catCounts.map(c=>c.name),
            datasets:[{
                data: catCounts.map(c=>c.count),
                backgroundColor:["rgba(99,102,241,.75)","rgba(6,182,212,.75)","rgba(16,185,129,.75)","rgba(245,158,11,.75)","rgba(239,68,68,.75)","rgba(168,85,247,.75)"],
                borderColor:["rgba(99,102,241,1)","rgba(6,182,212,1)","rgba(16,185,129,1)","rgba(245,158,11,1)","rgba(239,68,68,1)","rgba(168,85,247,1)"],
                borderWidth:2
            }]
        },
        options:{
            ...chartDefaults,
            plugins:{ ...chartDefaults.plugins, legend:{ position:"right", labels:{ color:"#f3f4f6", font:{family:"Heebo",size:12}, padding:14 } } }
        }
    });

    /* 7. NEW — Bounce rate by category (bar) */
    const bounceLabels = bcat.map(b=>b.category);
    const bounceVals   = bcat.map(b=>b.avg_bounce_rate);
    charts.bounce = new Chart(document.getElementById("bounceChart"), {
        type:"bar",
        data:{
            labels:bounceLabels,
            datasets:[{
                label:"שיעור חזרות (%)",
                data:bounceVals,
                backgroundColor: bounceVals.map(v => v > 0.5 ? "rgba(239,68,68,.65)" : v > 0.1 ? "rgba(245,158,11,.65)" : "rgba(16,185,129,.65)"),
                borderColor:     bounceVals.map(v => v > 0.5 ? "rgba(239,68,68,1)"   : v > 0.1 ? "rgba(245,158,11,1)"   : "rgba(16,185,129,1)"),
                borderWidth:1
            }]
        },
        options:{
            ...chartDefaults,
            scales:{ y:{ ...axisBase, title:{display:true,text:"Bounce %",color:tickColor} }, x:{ ticks:{color:tickColor,font:{family:"Heebo"}} } },
            plugins:{ ...chartDefaults.plugins, legend:{display:false}, tooltip:{ callbacks:{ label:ctx=>`${ctx.parsed.y.toFixed(3)}% חזרות` } } }
        }
    });

    /* 8. NEW — Keyword open-rate impact (horizontal bar) */
    const kwSorted = [...kw].sort((a,b)=>b.open_diff-a.open_diff);
    charts.kw = new Chart(document.getElementById("keywordChart"), {
        type:"bar",
        data:{
            labels: kwSorted.map(k=>`"${k.keyword}"`),
            datasets:[
                { label:'עם מילת המפתח',    data:kwSorted.map(k=>k.avg_open_with),    backgroundColor:"rgba(99,102,241,.7)", borderColor:"rgba(99,102,241,1)", borderWidth:1 },
                { label:'ללא מילת המפתח', data:kwSorted.map(k=>k.avg_open_without), backgroundColor:"rgba(107,114,128,.45)", borderColor:"rgba(107,114,128,.8)", borderWidth:1 }
            ]
        },
        options:{
            ...chartDefaults,
            indexAxis:"y",
            scales:{ x:{ ...axisBase, title:{display:true,text:"% פתיחה ממוצע",color:tickColor} }, y:{ ticks:{color:tickColor,font:{family:"Heebo"}} } }
        }
    });
}

function updateHourlyChart(catFilter) {
    const hourStats = Array.from({length:24},(_,h)=>({h,s:0,c:0,n:0}));
    dashboardData.mailings.forEach(m => {
        if (catFilter==="all"||m.category===catFilter) {
            const h=parseInt(m.time.split(":")[0]);
            hourStats[h].s+=m.open_rate; hourStats[h].c+=m.click_rate; hourStats[h].n++;
        }
    });
    const hrs=[],opens=[],clicks=[];
    hourStats.forEach(({h,s,c,n})=>{ if(n>0){ hrs.push(`${h.toString().padStart(2,"0")}:00`); opens.push(Math.round(s/n*100)/100); clicks.push(Math.round(c/n*100)/100); } });
    if (charts.hourly) charts.hourly.destroy();
    charts.hourly = new Chart(document.getElementById("hourlyChart"), {
        type:"line",
        data:{ labels:hrs, datasets:[
            { label:"% פתיחה", data:opens, borderColor:"rgba(6,182,212,1)", backgroundColor:"rgba(6,182,212,.12)", fill:true, tension:.35, borderWidth:2 },
            { label:"% הקלקות", data:clicks, borderColor:"rgba(16,185,129,1)", backgroundColor:"rgba(16,185,129,.05)", fill:false, tension:.35, borderWidth:2 }
        ]},
        options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{grid:{color:"rgba(255,255,255,.05)"},ticks:{color:"#9ca3af"}}, x:{ticks:{color:"#9ca3af"}} }, plugins:{legend:{labels:{color:"#f3f4f6",font:{family:"Heebo"}}}} }
    });
}

/* ─── Recipient groups influence cards ─── */
function renderRecipientInfluenceCards() {
    const container = document.getElementById("groups-influence-container");
    const infl = dashboardData.recipient_groups_influence;
    const top4 = Object.keys(infl).sort((a,b)=>infl[b].count-infl[a].count).slice(0,4);
    container.innerHTML = top4.map(g => {
        const d = infl[g];
        const diff = Math.round((d.avg_open_with-d.avg_open_without)*100)/100;
        const pos = diff>=0;
        return `
        <div class="group-influence-card">
            <div class="group-inf-name" title="${g}">${g}</div>
            <div class="group-inf-stats">
                <div class="group-inf-row"><span>פתיחה עם הקבוצה</span><span class="val">${d.avg_open_with}%</span></div>
                <div class="group-inf-row"><span>פתיחה ללא הקבוצה</span><span class="val">${d.avg_open_without}%</span></div>
                <div class="group-inf-row"><span>הקלקות עם הקבוצה</span><span class="val" style="color:var(--accent-green)">${d.avg_click_with}%</span></div>
            </div>
            <div class="group-inf-impact ${pos?"positive":"negative"}">
                <span>השפעה:</span>
                <span class="val"><i class="fa-solid fa-caret-${pos?"up":"down"}"></i> ${pos?"+":""}${diff}%</span>
            </div>
        </div>`;
    }).join("");
}

/* ─── Activity Grid ─── */
function renderMailingActivityGrid() {
    const grid = document.getElementById("mailings-activity-grid");
    const monthsEl = document.getElementById("activity-months-labels");
    grid.innerHTML = ""; monthsEl.innerHTML = "";

    const dateCounts={}, dateSent={}, dateMails={};
    dashboardData.mailings.forEach(m => {
        dateCounts[m.date]=(dateCounts[m.date]||0)+1;
        dateSent[m.date]=(dateSent[m.date]||0)+m.sent;
        if(!dateMails[m.date]) dateMails[m.date]=[];
        dateMails[m.date].push(m);
    });

    const startDate=new Date(2026,0,1), endDate=new Date(2026,4,31);
    const gridStart=new Date(startDate);
    gridStart.setDate(startDate.getDate()-startDate.getDay());

    const monthNames=["ינואר","פברואר","מרץ","אפריל","מאי"];
    let lastMonth=-1, colIdx=0, cur=new Date(gridStart);

    while(cur<=endDate) {
        const ds=`${cur.getFullYear()}-${(cur.getMonth()+1).toString().padStart(2,"0")}-${cur.getDate().toString().padStart(2,"0")}`;
        const count=dateCounts[ds]||0, total=dateSent[ds]||0;
        const lvl=count===0?0:count===1?1:count===2?2:count<=4?3:4;
        const fd=`${cur.getDate()}/${cur.getMonth()+1}/${cur.getFullYear()}`;
        const tip=count>0?`${count} דיוורים ב-${fd} · ${total.toLocaleString()} נמענים`:`אין דיוורים ב-${fd}`;
        const cell=document.createElement("div");
        cell.className=`activity-cell level-${lvl}`;
        cell.setAttribute("data-tooltip",tip);
        cell.addEventListener("click",()=>showDayDetails(fd,dateMails[ds]||[]));
        grid.appendChild(cell);

        if(cur.getDay()===0) {
            const m=cur.getMonth();
            if(m!==lastMonth&&m<=4&&cur>=startDate) {
                lastMonth=m;
                const lbl=document.createElement("span");
                lbl.className="activity-month-label"; lbl.innerText=monthNames[m];
                lbl.style.right=`${colIdx*15}px`;
                monthsEl.appendChild(lbl);
            }
            colIdx++;
        }
        cur.setDate(cur.getDate()+1);
    }
}

function showDayDetails(label, mails) {
    document.getElementById("day-details-title").innerHTML=`<i class="fa-solid fa-calendar-day"></i> <strong>${label}</strong> — ${mails.length} דיוורים`;
    document.getElementById("day-details-list").innerHTML = mails.length===0
        ? `<div style="color:var(--text-muted);font-size:13px;padding:10px 0;text-align:center">אין דיוורים ביום זה.</div>`
        : mails.map(m=>`
            <div class="day-detail-item">
                <div><span class="day-detail-badge">${m.time}</span> <span class="day-detail-subject">${m.subject}</span></div>
                <div class="day-detail-meta">
                    <span>${m.category}</span>
                    <span>${m.sent.toLocaleString()} נמענים</span>
                    <div class="day-detail-stats"><span class="open">פתיחה: <b>${m.open_rate}%</b></span><span class="click">הקלקות: <b>${m.click_rate}%</b></span></div>
                </div>
            </div>`).join("");
}

/* ─── History Table ─── */
function renderHistoryTable(mails) {
    const tbody = document.getElementById("mailings-table-body");
    tbody.innerHTML = mails.length===0
        ? `<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">לא נמצאו תוצאות</td></tr>`
        : mails.map(m=>`
            <tr>
                <td class="outfit">${m.date} ${m.time}</td>
                <td style="font-weight:500;color:var(--text-primary)">${m.subject}</td>
                <td>${m.category}</td>
                <td class="outfit">${m.sent.toLocaleString()}</td>
                <td class="open-val outfit">${m.open_rate}%</td>
                <td class="click-val outfit">${m.click_rate}%</td>
                <td>${m.near_holiday?`<span class="badge holiday"><i class="fa-solid fa-moon"></i> ${m.holiday_name}</span>`:`<span class="badge normal">רגיל</span>`}</td>
            </tr>`).join("");
}

function setupTableListeners() {
    const si=document.getElementById("search-input"), cf=document.getElementById("category-filter");
    const filter=()=>renderHistoryTable(dashboardData.mailings.filter(m=>{
        const q=si.value.toLowerCase().trim();
        return m.subject.toLowerCase().includes(q) && (cf.value==="all"||m.category===cf.value);
    }));
    si.addEventListener("input",filter); cf.addEventListener("change",filter);
}

/* ═══════════════════════════════════════════════════════════════
   RECOMMENDATIONS ENGINE
   Generates data-driven recommendations and renders them as cards
═══════════════════════════════════════════════════════════════ */

function renderRecommendations() {
    const d      = dashboardData;
    const s      = d.overall_stats;
    const cats   = d.categories;
    const days   = d.days_of_week;
    const kw     = d.keyword_stats;
    const bounce = d.category_bounces;
    const mo     = d.monthly_statistics;
    const corr   = d.subject_correlation;
    const grps   = d.recipient_groups_influence;
    const mails  = d.mailings;
    allRecs = [];
    const imp = (from, to) => { const d=Math.round((to-from)*10)/10; return d>=0?`+${d}%`:`${d}%`; };

    // 1. BOUNCE ALERTS
    [...bounce].sort((a,b)=>b.avg_bounce_rate-a.avg_bounce_rate).forEach(b => {
        if (b.avg_bounce_rate < 0.3) return;
        const isCrit = b.avg_bounce_rate >= 1;
        allRecs.push({
            priority: isCrit ? "critical" : "high",
            icon: "fa-triangle-exclamation",
            iconBg: isCrit?"rgba(239,68,68,.15)":"rgba(245,158,11,.12)",
            iconColor: isCrit?"var(--accent-red)":"var(--accent-orange)",
            category: "🔴 Deliverability",
            title: `נקה רשימת "${b.category}" — ${b.avg_bounce_rate}% חזרות`,
            body: `<strong>${b.total_bounces.toLocaleString()} מתוך ${b.total_sent.toLocaleString()} הודעות</strong> לא הגיעו ליעדן. סף מקובל: 0.3%. כל ירידה של 0.1% = כ-${Math.round(b.total_sent*0.001).toLocaleString()} הודעות נוספות ביעד.`,
            comparisons: [
                { label:"Bounce Rate נוכחי", val:`${b.avg_bounce_rate}%`, cls:isCrit?"down":"warn" },
                { label:"יעד מומלץ", val:"< 0.3%", cls:"up" },
                { label:"הודעות שנחסמו", val:b.total_bounces.toLocaleString(), cls:"down" }
            ],
            actions: [
                `<strong>מיידי:</strong> ייצא רשימת "${b.category}" וסמן Hard Bounces להסרה`,
                "<strong>אוטומציה:</strong> כל כתובת שחוזרת 2 פעמים — הסרה אוטומטית",
                "<strong>ארוך טווח:</strong> הוסף Double Opt-In בהצטרפות לרשימה זו"
            ]
        });
    });

    // 2. BEST vs WORST DAY
    const activeDays = Object.entries(days).filter(([,v])=>v.count>=3);
    const bestDay  = [...activeDays].sort((a,b)=>b[1].avg_open-a[1].avg_open)[0];
    const worstDay = [...activeDays].sort((a,b)=>a[1].avg_open-b[1].avg_open)[0];
    const dayGain  = Math.round((bestDay[1].avg_open-worstDay[1].avg_open)*10)/10;
    allRecs.push({
        priority:"high", icon:"fa-calendar-star",
        iconBg:"rgba(245,158,11,.12)", iconColor:"var(--accent-orange)",
        category:"⏰ תזמון — יום שליחה",
        title:`יום ${bestDay[0]}: ${bestDay[1].avg_open}% | יום ${worstDay[0]}: ${worstDay[1].avg_open}% — פער: ${dayGain}%`,
        body:`השוואת כל ימי השבוע (3+ נתונים). יום <strong>${bestDay[0]}</strong> מוביל ב-<strong>${dayGain} נקודות אחוז</strong> מעל יום ${worstDay[0]}.`,
        comparisons: Object.entries(days).filter(([,v])=>v.count>=2).sort((a,b)=>b[1].avg_open-a[1].avg_open).map(([day,v])=>({
            label:`יום ${day} (${v.count} דיוורים)`, val:`${v.avg_open}%`,
            cls:v.avg_open>=bestDay[1].avg_open*0.93?"up":v.avg_open<=worstDay[1].avg_open*1.1?"down":"warn"
        })),
        actions:[
            `<strong>מיידי:</strong> העבר את הדיוור הבא מיום ${worstDay[0]} ליום ${bestDay[0]}`,
            `<strong>מדיניות:</strong> דיוורים בעדיפות גבוהה יוצאים אך ורק ביום ${bestDay[0]}`,
            "<strong>A/B:</strong> שלח דיוור זהה ביומיים שונים — אמת בעצמך"
        ]
    });

    // 3. HOURLY PEAK
    const hourSums={};
    mails.forEach(m=>{const h=parseInt(m.time.split(":")[0]);if(!hourSums[h])hourSums[h]={sum:0,count:0};hourSums[h].sum+=m.open_rate;hourSums[h].count++;});
    const hourRanked=Object.entries(hourSums).map(([h,v])=>({h:parseInt(h),avg:Math.round(v.sum/v.count*10)/10,count:v.count})).filter(x=>x.count>=2).sort((a,b)=>b.avg-a.avg);
    const topH=hourRanked[0]; const botH=hourRanked[hourRanked.length-1];
    allRecs.push({
        priority:"high", icon:"fa-clock",
        iconBg:"var(--primary-glow)", iconColor:"var(--primary)",
        category:"⏰ תזמון — שעת שליחה",
        title:`שעה ${topH.h}:00 = ${topH.avg}% | שעה ${botH.h}:00 = ${botH.avg}% — פער: ${Math.round((topH.avg-botH.avg)*10)/10}%`,
        body:`מתוך ${hourRanked.length} שעות שנותחו. שילוב אופטימלי: יום <strong>${bestDay[0]}</strong> + שעה <strong>${topH.h}:00</strong>.`,
        comparisons:hourRanked.slice(0,5).map(x=>({
            label:`${x.h.toString().padStart(2,"0")}:00 (${x.count} דיוורים)`, val:`${x.avg}%`,
            cls:x.avg>=topH.avg*0.93?"up":x.avg<=topH.avg*0.75?"down":"warn"
        })),
        actions:[
            `<strong>מיידי:</strong> תזמן את הדיוור הבא ל-${topH.h}:00`,
            `<strong>שילוב:</strong> יום ${bestDay[0]} + ${topH.h}:00 = תזמון האופטימלי`,
            "<strong>A/B:</strong> שלח 30% שעה לפני, 70% בשעת השיא"
        ]
    });

    // 4. CATEGORY COMPARISON
    const catList=Object.entries(cats).map(([k,v])=>({name:k,...v})).sort((a,b)=>b.avg_open-a.avg_open);
    const topCat=catList[0]; const botCat=catList[catList.length-1];
    allRecs.push({
        priority:"medium", icon:"fa-ranking-star",
        iconBg:"rgba(168,85,247,.12)", iconColor:"#a855f7",
        category:"📊 השוואת קטגוריות",
        title:`"${topCat.name}" מובילה ב-${Math.round((topCat.avg_open-botCat.avg_open)*10)/10}% מ-"${botCat.name}"`,
        body:`השוואת ${catList.length} קטגוריות. ממוצע כולל: <strong>${s.avg_open_rate}%</strong>. מתחת לממוצע: <strong>${catList.filter(c=>c.avg_open<s.avg_open_rate).map(c=>c.name).join(", ")}</strong>.`,
        comparisons:catList.map(c=>({
            label:`${c.name} (${c.count} דיוורים)`, val:`${c.avg_open}%`,
            cls:c.avg_open>=topCat.avg_open*0.9?"up":c.avg_open<s.avg_open_rate-5?"down":"warn"
        })),
        actions:[
            `<strong>חקה:</strong> "${topCat.name}" — ${topCat.best_hour}:00 ביום ${topCat.best_day}`,
            `<strong>יעד:</strong> "${botCat.name}" תגיע ל-${Math.ceil(s.avg_open_rate)}% בחודשיים`,
            "<strong>שקיפות:</strong> שתף נתונים אלו עם כותבי התוכן של כל קטגוריה"
        ]
    });

    // 5. SUBJECT LINE LENGTH
    const avgLen=Math.round(mails.reduce((a,m)=>a+m.subject.length,0)/mails.length);
    const top10=[...mails].sort((a,b)=>b.open_rate-a.open_rate).slice(0,10);
    const bot10=[...mails].sort((a,b)=>a.open_rate-b.open_rate).slice(0,10);
    const avgLenTop=Math.round(top10.reduce((a,m)=>a+m.subject.length,0)/10);
    const avgLenBot=Math.round(bot10.reduce((a,m)=>a+m.subject.length,0)/10);
    const avgOpenTop10=Math.round(top10.reduce((a,m)=>a+m.open_rate,0)/10*10)/10;
    const avgOpenBot10=Math.round(bot10.reduce((a,m)=>a+m.open_rate,0)/10*10)/10;
    allRecs.push({
        priority:corr.char_len_open_corr<-0.1?"medium":"tip", icon:"fa-pen-nib",
        iconBg:"rgba(168,85,247,.12)", iconColor:"#a855f7",
        category:"✍️ כותרת — אורך",
        title:`Top 10: ${avgLenTop} תווים (${avgOpenTop10}% פתיחה) | Bottom 10: ${avgLenBot} תווים (${avgOpenBot10}%)`,
        body:`ניתוח ${mails.length} כותרות: דיוורים מצליחים קצרים ב-<strong>${Math.abs(avgLenBot-avgLenTop)} תווים</strong> מכושלים. מתאם: ${corr.char_len_open_corr.toFixed(2)} (${corr.char_len_open_corr<0?"קצר = יותר פתיחות":"ארוך = יותר פתיחות"}).`,
        comparisons:[
            {label:`Top 10 (${avgOpenTop10}% פתיחה)`, val:`${avgLenTop} תווים`, cls:"up"},
            {label:`ממוצע כלל הדיוורים`, val:`${avgLen} תווים`, cls:"warn"},
            {label:`Bottom 10 (${avgOpenBot10}% פתיחה)`, val:`${avgLenBot} תווים`, cls:"down"}
        ],
        actions:[
            `<strong>כלל:</strong> צמצם כותרות ל-${avgLenTop}–${avgLenTop+6} תווים`,
            "<strong>מבחן:</strong> האם מישהו מבין את מטרת הדיוור תוך 3 שניות? אם לא — קצר",
            "<strong>נייד:</strong> Gmail מציג ~40 תווים בנייד — המסר המרכזי חייב להיות בתוכם"
        ]
    });

    // 6. KEYWORD IMPACT
    if (kw.length>=2) {
        const kwS=[...kw].sort((a,b)=>b.open_diff-a.open_diff);
        const best=kwS[0]; const worst=kwS[kwS.length-1];
        allRecs.push({
            priority:"medium", icon:"fa-fire",
            iconBg:"rgba(245,158,11,.12)", iconColor:"var(--accent-orange)",
            category:"✍️ כותרת — מילות מפתח",
            title:`"${best.keyword}": ${imp(best.avg_open_without,best.avg_open_with)} | "${worst.keyword}": ${imp(worst.avg_open_without,worst.avg_open_with)}`,
            body:`השוואת ${kw.length} מילות מפתח מ-${mails.length} כותרות. <strong>"${best.keyword}"</strong> — השיפור הגדול ביותר. <strong>"${worst.keyword}"</strong> — ${worst.open_diff<0?"פוגע":"פחות יעיל"}.`,
            comparisons:kwS.map(k=>({
                label:`"${k.keyword}" (${k.count} דיוורים)`,
                val:`${k.open_diff>0?"+":""}${k.open_diff}%`,
                cls:k.open_diff>2?"up":k.open_diff<-1?"down":"warn"
            })),
            actions:[
                `<strong>השתמש:</strong> "${best.keyword}" — ${best.avg_open_with}% פתיחה לעומת ${best.avg_open_without}% ללא`,
                worst.open_diff<0
                    ?`<strong>שנה:</strong> "${worst.keyword}" → נסח מחדש: "עדכון חשוב" → "חידוש שחייבים לדעת"`
                    :`<strong>שלב:</strong> "${worst.keyword}" — גם מועיל ב-${worst.open_diff}%`,
                "<strong>A/B:</strong> 50% עם המילה, 50% בלעדיה — תוצאות תוך שבוע"
            ]
        });
    }

    // 7. MONTHLY TREND
    if (mo.length>=2) {
        const trend=mo[mo.length-1].avg_open-mo[0].avg_open;
        const isFall=trend<-1;
        allRecs.push({
            priority:isFall?"high":"tip",
            icon:isFall?"fa-chart-line-down":"fa-chart-line",
            iconBg:isFall?"rgba(239,68,68,.08)":"rgba(16,185,129,.1)",
            iconColor:isFall?"var(--accent-red)":"var(--accent-green)",
            category:"📊 מגמה חודשית",
            title:`${mo[0].month_name}→${mo[mo.length-1].month_name}: ${imp(mo[0].avg_open,mo[mo.length-1].avg_open)} | ${mo.map(m=>m.mailings_count).join("/")} דיוורים/חודש`,
            body:isFall
                ?`ירידה של <strong>${Math.abs(Math.round(trend*10)/10)}%</strong>. בדוק: האם עומס שליחה (שיא: ${Math.max(...mo.map(m=>m.mailings_count))} דיוורים בחודש) גורם ל-Subscriber Fatigue?`
                :`מגמה חיובית! <strong>+${Math.round(trend*10)/10}%</strong>. שיא: ${mo[mo.length-1].month_name} עם ${mo[mo.length-1].avg_open}%.`,
            comparisons:mo.map(m=>({
                label:`${m.month_name} (${m.mailings_count} דיוורים)`, val:`${m.avg_open}%`,
                cls:m.avg_open===Math.max(...mo.map(x=>x.avg_open))?"up":m.avg_open===Math.min(...mo.map(x=>x.avg_open))?"down":"warn"
            })),
            actions:isFall
                ?[`<strong>הפחת:</strong> הגבל ל-${Math.round(mo.reduce((a,m)=>a+m.mailings_count,0)/mo.length)} דיוורים/חודש`,"<strong>שאל:</strong> שלח סקר קצר — מה הנמענים רוצים לקבל?","<strong>נקה:</strong> הסר נמענים שלא פתחו 3 חודשים — ישפר פתיחות מיד"]
                :["<strong>שמור:</strong> תעד מה שינית לאחרונה",`<strong>יעד:</strong> שאף ל-${Math.ceil(mo[mo.length-1].avg_open+2)}% בחודש הבא`,"<strong>שתף:</strong> הפץ את הנוסחה לכל כותבי הדיוורים"]
        });
    }

    // 8. MAILING FATIGUE
    const counts=mo.map(m=>m.mailings_count);
    const avgMo=Math.round(counts.reduce((a,b)=>a+b,0)/counts.length);
    const maxMo=Math.max(...counts);
    if (maxMo>avgMo*1.4) {
        const peakMo=mo.find(m=>m.mailings_count===maxMo);
        allRecs.push({
            priority:"medium", icon:"fa-inbox",
            iconBg:"rgba(99,102,241,.12)", iconColor:"var(--primary)",
            category:"📮 תדירות שליחה",
            title:`ב${peakMo.month_name}: ${maxMo} דיוורים — פי ${Math.round(maxMo/avgMo*10)/10} מהממוצע (${avgMo}/חודש)`,
            body:`השוואה: ${mo.map(m=>`${m.month_name}: ${m.mailings_count}`).join(" | ")}. עומס ב${peakMo.month_name} — נמענים שמקבלים יותר מדי הודעות מפסיקים לפתוח.`,
            comparisons:mo.map(m=>({
                label:m.month_name, val:`${m.mailings_count} דיוורים`,
                cls:m.mailings_count<=avgMo?"up":m.mailings_count>avgMo*1.3?"down":"warn"
            })),
            actions:[
                `<strong>מיידי:</strong> הגדר מגבלה של ${Math.ceil(avgMo*1.1)} דיוורים/חודש`,
                "<strong>עדיפות:</strong> בחודשים עמוסים — רק קריטי. הכל שאר → חודש הבא",
                "<strong>פילוח:</strong> לא כל נמען צריך כל דיוור — פלח לפי תחום עניין"
            ]
        });
    }

    // 9. RECIPIENT GROUPS
    const grpArr=Object.entries(grps).map(([k,v])=>({name:k,...v}));
    if (grpArr.length>=2) {
        const byDiff=[...grpArr].sort((a,b)=>(b.avg_open_with-b.avg_open_without)-(a.avg_open_with-a.avg_open_without));
        const best=byDiff[0];
        const diff=Math.round((best.avg_open_with-best.avg_open_without)*10)/10;
        if (Math.abs(diff)>1) {
            allRecs.push({
                priority:"tip", icon:"fa-users-gear",
                iconBg:"rgba(16,185,129,.1)", iconColor:"var(--accent-green)",
                category:"👥 קבוצות נמענים",
                title:`"${best.name}": ${diff>0?"+":""}${diff}% — השוואת ${Math.min(grpArr.length,4)} קבוצות`,
                body:`הקבוצה <strong>"${best.name}"</strong> מגדילה פתיחות ב-<strong>${diff>0?"+":""}${diff}%</strong> (מ-${best.avg_open_without}% ל-${best.avg_open_with}%). בסיס: ${best.count} דיוורים.`,
                comparisons:byDiff.slice(0,4).map(g=>{
                    const d=Math.round((g.avg_open_with-g.avg_open_without)*10)/10;
                    return {label:`${g.name} (${g.count} דיוורים)`, val:`${d>=0?"+":""}${d}%`, cls:d>2?"up":d<-1?"down":"warn"};
                }),
                actions:[
                    `<strong>הוסף:</strong> בדיוור הבא — הוסף "${best.name}" לרשימת הנמענים`,
                    "<strong>בדוק:</strong> האם הקבוצה כוללת מנהלים/מקבלי החלטות?",
                    "<strong>הרחב:</strong> מצא קבוצות דומות בפרופיל והוסף אותן"
                ]
            });
        }
    }

    // 10. TOP 3 MAILINGS
    const top3=[...mails].sort((a,b)=>b.open_rate-a.open_rate).slice(0,3);
    const sharedCat=top3[0].category===top3[1].category&&top3[1].category===top3[2].category;
    allRecs.push({
        priority:"tip", icon:"fa-trophy",
        iconBg:"rgba(245,158,11,.12)", iconColor:"var(--accent-orange)",
        category:"🏆 Best Practice — 3 דיוורי השיא",
        title:`שיא: "${top3[0].subject.slice(0,32)}${top3[0].subject.length>32?"…":""}" — ${top3[0].open_rate}% פתיחה`,
        body:`3 המוצלחים ביותר מ-${mails.length} דיוורים. ${sharedCat?`כולם מ-"${top3[0].category}"`:"מקטגוריות שונות — הצלחה תלויה בתזמון ובניסוח"}. ממוצע שלושתם: <strong>${Math.round(top3.reduce((a,m)=>a+m.open_rate,0)/3*10)/10}%</strong>.`,
        comparisons:top3.map((m,i)=>({
            label:`#${i+1}: ${m.subject.slice(0,28)}… | ${m.date} ${m.time}`,
            val:`${m.open_rate}% פתיחה`, cls:"up"
        })),
        actions:[
            `<strong>נתח:</strong> פתח "${top3[0].subject.slice(0,25)}…" — כמה מילים? מה גרם להצלחה?`,
            "<strong>שחזר:</strong> כתוב דיוור חדש בסגנון דומה — בדוק אם ההצלחה חוזרת",
            "<strong>תבנית:</strong> שמור את 3 הדיוורים כ-Template לכל הצוות"
        ]
    });

    renderRecGrid(allRecs);
}

/* ── Render the rec cards ── */
function renderRecGrid(recs) {
    const grid = document.getElementById("recommendations-grid");
    if (recs.length === 0) {
        grid.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:40px;grid-column:1/-1">אין המלצות להצגה.</div>`;
        return;
    }
    const priorityOrder = { critical:0, high:1, medium:2, tip:3 };
    const sorted = [...recs].sort((a,b)=>(priorityOrder[a.priority]??9)-(priorityOrder[b.priority]??9));
    const badgeLabels = { critical:"🚨 קריטי", high:"🔺 גבוהה", medium:"⚡ בינונית", tip:"💡 טיפ" };
    grid.innerHTML = sorted.map(r => `
        <div class="rec-card" data-priority="${r.priority}">
            <div class="rec-card-header">
                <div class="rec-card-icon" style="background:${r.iconBg};color:${r.iconColor}">
                    <i class="fa-solid ${r.icon}"></i>
                </div>
                <div class="rec-card-meta">
                    <div class="rec-card-category">${r.category}</div>
                    <div class="rec-card-title">${r.title}</div>
                </div>
                <span class="priority-badge ${r.priority}">${badgeLabels[r.priority]}</span>
            </div>
            <div class="rec-card-body">${r.body}</div>
            ${(r.comparisons||r.metrics||[]).map(m=>`
                <div class="rec-metric">
                    <span class="rec-metric-label">${m.label}</span>
                    <span class="rec-metric-val ${m.cls}">${m.val}</span>
                </div>`).join("")}
            <div class="rec-card-actions">
                ${r.actions.map(a=>`<div class="rec-action-item"><i class="fa-solid fa-circle-check"></i><span>${a}</span></div>`).join("")}
            </div>
        </div>`).join("");
}

/* ── Tab filter ── */
function filterRecs(btn, filter) {
    document.querySelectorAll(".rec-tab").forEach(t=>t.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".rec-card").forEach(card=>{
        card.classList.toggle("hidden", filter !== "all" && card.dataset.priority !== filter);
    });
}

