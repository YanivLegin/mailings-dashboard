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

/* ─── Recipient Groups Checkboxes ─── */
function renderRecipientGroupsCheckboxes() {
    const container = document.getElementById("groups-checkboxes-container");
    const influences = dashboardData.recipient_groups_influence;
    const sorted = Object.keys(influences).sort((a,b)=>influences[b].count-influences[a].count).slice(0,9);
    container.innerHTML = sorted.map(g => `
        <div class="group-chk-item" id="chkwrap-${g.replace(/[^a-z0-9]/gi,'_')}">
            <input type="checkbox" value="${g}" id="chk-${g.replace(/[^a-z0-9]/gi,'_')}">
            <label for="chk-${g.replace(/[^a-z0-9]/gi,'_')}" style="cursor:pointer">${g}</label>
        </div>
    `).join("");
    container.querySelectorAll("input[type=checkbox]").forEach(chk => {
        chk.addEventListener("change", () => {
            chk.closest(".group-chk-item").classList.toggle("checked", chk.checked);
            runPrediction();
        });
    });
}

/* ─── Simulator Listeners ─── */
function setupSimulatorListeners() {
    ["sim-category","sim-day","sim-hour"].forEach(id => document.getElementById(id).addEventListener("change", runPrediction));
    document.getElementsByName("sim-holiday").forEach(r => r.addEventListener("change", runPrediction));
}

/* ─── Prediction Model ─── */
function runPrediction() {
    if (!dashboardData) return;
    const m   = dashboardData.model_coefficients;
    const cat = document.getElementById("sim-category").value;
    const day = parseInt(document.getElementById("sim-day").value);
    const hrB = document.getElementById("sim-hour").value;
    const isH = document.querySelector('input[name="sim-holiday"]:checked').value === "true";
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
    document.getElementById("pred-open-circle").style.setProperty("--value",  Math.min(100, Math.round(pO/300*100)));
    document.getElementById("pred-click-circle").style.setProperty("--value", Math.min(100, Math.round(pC/30*100)));

    const gO = dashboardData.overall_stats.avg_open_rate;
    const gC = dashboardData.overall_stats.avg_click_rate;
    setDiff("pred-open-diff",  Math.round((pO-gO)*100)/100);
    setDiff("pred-click-diff", Math.round((pC-gC)*100)/100);

    const score = Math.min(100, Math.max(0, Math.round((pO/250)*50 + (pC/20)*50)));
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
    const d    = dashboardData;
    const s    = d.overall_stats;
    const cats = d.categories;
    const days = d.days_of_week;
    const kw   = d.keyword_stats;
    const bounce = d.category_bounces;
    const mo   = d.monthly_statistics;
    const corr = d.subject_correlation;
    const grps = d.recipient_groups_influence;
    const mails = d.mailings;

    allRecs = [];

    /* ── 1. BOUNCE ALERTS ── */
    const bounceSorted = [...bounce].sort((a,b)=>b.avg_bounce_rate-a.avg_bounce_rate);
    bounceSorted.forEach(b => {
        if (b.avg_bounce_rate >= 0.5) {
            allRecs.push({
                priority: b.avg_bounce_rate >= 1 ? "critical" : "high",
                icon: "fa-triangle-exclamation", iconBg: "rgba(239,68,68,.12)", iconColor: "var(--accent-red)",
                category: "🔴 Deliverability — בריאות שרת",
                title: `שיעור חזרות גבוה — קטגוריה "${b.category}"`,
                body: `קטגוריה זו מציגה שיעור חזרות (Bounce Rate) של <strong>${b.avg_bounce_rate}%</strong> — מעל הסף המקובל של 0.5%. ${b.total_bounces.toLocaleString()} הודעות לא הגיעו ליעדן מתוך ${b.total_sent.toLocaleString()} שליחות.`,
                metrics: [
                    { label: "Bounce Rate", val: `${b.avg_bounce_rate}%`, cls: "down" },
                    { label: "הודעות שנחסמו", val: b.total_bounces.toLocaleString(), cls: "down" }
                ],
                actions: [
                    "נקה את רשימת הנמענים — הסר כתובות שחוזרות באופן קבוע (Hard Bounces)",
                    "השתמש בכלי אימות דוא\"ל (Email Validation) לפני שליחה",
                    "בצע Double Opt-In לנמענים חדשים בקטגוריה זו"
                ]
            });
        }
    });

    /* ── 2. TIMING OPTIMIZATION ── */
    const bestDayEntry = Object.entries(days).sort((a,b)=>b[1].avg_open-a[1].avg_open)[0];
    const worstDayEntry = Object.entries(days).filter(([,v])=>v.count>0).sort((a,b)=>a[1].avg_open-b[1].avg_open)[0];
    const dayDiff = Math.round((bestDayEntry[1].avg_open - worstDayEntry[1].avg_open)*100)/100;
    allRecs.push({
        priority: "high",
        icon: "fa-calendar-star", iconBg: "rgba(245,158,11,.12)", iconColor: "var(--accent-orange)",
        category: "⏰ אופטימיזציית תזמון",
        title: `שלח ביום ${bestDayEntry[0]} — יתרון של ${dayDiff}% פתיחות`,
        body: `יום <strong>${bestDayEntry[0]}</strong> הוא יום השיא עם <strong>${bestDayEntry[1].avg_open}%</strong> פתיחה בממוצע. יום <strong>${worstDayEntry[0]}</strong> הוא החלש ביותר עם ${worstDayEntry[1].avg_open}% בלבד. ההפרש הוא <strong>${dayDiff} נקודות אחוז</strong>.`,
        metrics: [
            { label: `יום ${bestDayEntry[0]} (שיא)`, val: `${bestDayEntry[1].avg_open}%`, cls: "up" },
            { label: `יום ${worstDayEntry[0]} (חלש)`, val: `${worstDayEntry[1].avg_open}%`, cls: "down" }
        ],
        actions: [
            `רכז את הדיוורים החשובים ביום ${bestDayEntry[0]}`,
            `הימנע מתזמון דיוורים קריטיים ביום ${worstDayEntry[0]}`,
            "בדוק את נתוני שעות השיא בתוך ימי השיא"
        ]
    });

    /* ── 3. HOURLY PEAK ── */
    const hourSums = {};
    mails.forEach(m => {
        const h = parseInt(m.time.split(":")[0]);
        if (!hourSums[h]) hourSums[h] = { sum:0, count:0 };
        hourSums[h].sum += m.open_rate; hourSums[h].count++;
    });
    const hourRanked = Object.entries(hourSums).map(([h,v])=>({h:parseInt(h),avg:Math.round(v.sum/v.count*100)/100,count:v.count})).sort((a,b)=>b.avg-a.avg);
    const topHour = hourRanked[0];
    const worstHour = hourRanked[hourRanked.length-1];
    allRecs.push({
        priority: "high",
        icon: "fa-clock", iconBg: "var(--primary-glow)", iconColor: "var(--primary)",
        category: "⏰ אופטימיזציית תזמון",
        title: `שעת שיא: ${topHour.h.toString().padStart(2,"0")}:00 — ${topHour.avg}% פתיחה`,
        body: `הדיוורים שנשלחו בשעה <strong>${topHour.h}:00</strong> השיגו ממוצע של <strong>${topHour.avg}%</strong> פתיחה (על פני ${topHour.count} דיוורים). הימנע מהשעה <strong>${worstHour.h}:00</strong> — ממוצע ${worstHour.avg}% בלבד.`,
        metrics: [
            { label: `שעה ${topHour.h}:00 (שיא)`, val: `${topHour.avg}%`, cls: "up" },
            { label: `שעה ${worstHour.h}:00 (חלשה)`, val: `${worstHour.avg}%`, cls: "down" }
        ],
        actions: [
            `תזמן שליחות לפני ${topHour.h}:00 כדי לנצל את שיא הקריאה`,
            "שלב בין יום השיא לשעת השיא לתוצאות מקסימליות",
            "בדוק A/B testing של שעות שונות בכל קטגוריה"
        ]
    });

    /* ── 4. SUBJECT LINE LENGTH ── */
    const subjectLens = mails.map(m=>m.subject.length);
    const avgLen = Math.round(subjectLens.reduce((a,b)=>a+b,0)/subjectLens.length);
    const top10Opens = [...mails].sort((a,b)=>b.open_rate-a.open_rate).slice(0,10);
    const avgLenTop10 = Math.round(top10Opens.reduce((a,m)=>a+m.subject.length,0)/top10Opens.length);
    const corrDir = corr.char_len_open_corr < 0 ? "שלילי" : "חיובי";
    allRecs.push({
        priority: corr.char_len_open_corr < -0.15 ? "high" : "medium",
        icon: "fa-pen-nib", iconBg: "rgba(168,85,247,.12)", iconColor: "#a855f7",
        category: "✍️ אופטימיזציית כותרת",
        title: `כותרות קצרות מניבות יותר — מתאם ${corrDir} (${corr.char_len_open_corr.toFixed(2)})`,
        body: `אורך ממוצע של כותרת: <strong>${avgLen} תווים</strong>. כותרות הדיוורים עם אחוזי הפתיחה הגבוהים ביותר (Top 10) מכילות ממוצע של <strong>${avgLenTop10} תווים</strong> בלבד. המתאם בין אורך לפתיחה הוא <strong>${corr.char_len_open_corr.toFixed(3)}</strong>.`,
        metrics: [
            { label: "אורך ממוצע כלל הכותרות", val: `${avgLen} תווים`, cls: "warn" },
            { label: "אורך ממוצע — Top 10", val: `${avgLenTop10} תווים`, cls: "up" }
        ],
        actions: [
            `שאף לכותרות של עד ${avgLenTop10 + 5} תווים`,
            "העבר מידע מפורט לגוף המייל, השאר את הכותרת ממוקדת",
            "בדוק תצוגה מקדימה בניידים — גבול: כ-40 תווים גלויים"
        ]
    });

    /* ── 5. KEYWORD RECOMMENDATIONS ── */
    if (kw.length > 0) {
        const kwSorted = [...kw].sort((a,b)=>b.open_diff-a.open_diff);
        const bestKw   = kwSorted[0];
        const worstKw  = kwSorted[kwSorted.length-1];
        if (bestKw.open_diff > 1) {
            allRecs.push({
                priority: "medium",
                icon: "fa-fire", iconBg: "rgba(245,158,11,.12)", iconColor: "var(--accent-orange)",
                category: "✍️ אופטימיזציית כותרת — מילות מפתח",
                title: `"${bestKw.keyword}" — מגדיל פתיחות ב-${bestKw.open_diff}%`,
                body: `דיוורים שהכותרת שלהם מכילה את המילה <strong>"${bestKw.keyword}"</strong> השיגו <strong>${bestKw.avg_open_with}%</strong> פתיחה, לעומת ${bestKw.avg_open_without}% ללא המילה — יתרון של <strong>+${bestKw.open_diff}%</strong>.`,
                metrics: [
                    { label: `עם "${bestKw.keyword}"`, val: `${bestKw.avg_open_with}%`, cls: "up" },
                    { label: "ללא המילה", val: `${bestKw.avg_open_without}%`, cls: "warn" }
                ],
                actions: [
                    `שלב את המילה "${bestKw.keyword}" בכותרות הדיוורים החשובים`,
                    "אל תאחל אוטומטית — וודא שהמילה רלוונטית לתוכן",
                    "נסה וריאציות נוספות: הרשמו עכשיו, כנסו, הצטרפו"
                ]
            });
        }
        if (worstKw.open_diff < -1) {
            allRecs.push({
                priority: "medium",
                icon: "fa-ban", iconBg: "rgba(239,68,68,.08)", iconColor: "var(--accent-red)",
                category: "✍️ אופטימיזציית כותרת — מילות להימנע",
                title: `"${worstKw.keyword}" — מפחית פתיחות ב-${Math.abs(worstKw.open_diff)}%`,
                body: `דיוורים עם המילה <strong>"${worstKw.keyword}"</strong> בכותרת מגיעים ל-<strong>${worstKw.avg_open_with}%</strong> פתיחה — <strong>${Math.abs(worstKw.open_diff)}%</strong> פחות מהממוצע. שקול לנסח מחדש.`,
                metrics: [
                    { label: `עם "${worstKw.keyword}"`, val: `${worstKw.avg_open_with}%`, cls: "down" },
                    { label: "ממוצע ללא המילה", val: `${worstKw.avg_open_without}%`, cls: "up" }
                ],
                actions: [
                    `הגבל את השימוש ב-"${worstKw.keyword}" או נסח בצורה פעילה יותר`,
                    "המר ניסוח פסיבי לפעיל: 'עדכון חשוב' → 'חידוש שחייבים לדעת'",
                    "בצע A/B testing עם ניסוח חלופי"
                ]
            });
        }
    }

    /* ── 6. UNDERPERFORMING CATEGORIES ── */
    const catList = Object.entries(cats).map(([k,v])=>({name:k,...v}));
    const avgOpenAll = s.avg_open_rate;
    catList.filter(c=>c.avg_open < avgOpenAll - 5).forEach(c => {
        allRecs.push({
            priority: "medium",
            icon: "fa-arrow-trend-down", iconBg: "rgba(239,68,68,.08)", iconColor: "var(--accent-red)",
            category: `📉 קטגוריה: ${c.name}`,
            title: `קטגוריה מתחת לממוצע — "${c.name}"`,
            body: `קטגוריה זו משיגה <strong>${c.avg_open}%</strong> פתיחה — <strong>${Math.round((avgOpenAll - c.avg_open)*10)/10}%</strong> מתחת לממוצע הכולל (${avgOpenAll}%). שעת השיא לקטגוריה: <strong>${c.best_hour}:00</strong>, יום השיא: <strong>${c.best_day}</strong>.`,
            metrics: [
                { label: "ממוצע פתיחה", val: `${c.avg_open}%`, cls: "down" },
                { label: "ממוצע ממוצע הכולל", val: `${avgOpenAll}%`, cls: "warn" }
            ],
            actions: [
                `תזמן לשעת השיא ${c.best_hour}:00 ביום ${c.best_day} — פוטנציאל שיפור ניכר`,
                "בחן את קהל היעד — האם הם רלוונטיים לתוכן?",
                "בצע פילוח ושלח גרסאות מותאמות לתת-קבוצות"
            ]
        });
    });

    /* ── 7. TOP CATEGORY — learn from the best ── */
    const topCat = catList.sort((a,b)=>b.avg_open-a.avg_open)[0];
    allRecs.push({
        priority: "tip",
        icon: "fa-trophy", iconBg: "rgba(245,158,11,.12)", iconColor: "var(--accent-orange)",
        category: "🏆 Best Practice — למד מהמצוינים",
        title: `קטגוריית שיא: "${topCat.name}" — ${topCat.avg_open}% פתיחה`,
        body: `קטגוריה זו מובילה עם <strong>${topCat.avg_open}%</strong> פתיחה ו-<strong>${topCat.avg_click}%</strong> הקלקות. שעת השיא: <strong>${topCat.best_hour}:00</strong>, יום השיא: <strong>${topCat.best_day}</strong>. הפץ את השיטות שלה לקטגוריות אחרות.`,
        metrics: [
            { label: "% פתיחה", val: `${topCat.avg_open}%`, cls: "up" },
            { label: "% הקלקות", val: `${topCat.avg_click}%`, cls: "up" }
        ],
        actions: [
            `בחן את ניסוחי הכותרות בקטגוריית "${topCat.name}" וחקה את הסגנון`,
            `שלח קטגוריות אחרות בשעה ${topCat.best_hour}:00 ביום ${topCat.best_day} כנקודת פתיחה`,
            "ראיין את מחברי התוכן בקטגוריה זו ובנה מדריך Best Practice"
        ]
    });

    /* ── 8. RECIPIENT GROUP OPTIMIZATION ── */
    const grpList = Object.entries(grps).map(([k,v])=>({name:k,...v}));
    const bestGrp  = grpList.sort((a,b)=>(b.avg_open_with-b.avg_open_without)-(a.avg_open_with-a.avg_open_without))[0];
    const diff = Math.round((bestGrp.avg_open_with-bestGrp.avg_open_without)*100)/100;
    if (diff > 2) {
        allRecs.push({
            priority: "tip",
            icon: "fa-users-gear", iconBg: "rgba(16,185,129,.1)", iconColor: "var(--accent-green)",
            category: "👥 אופטימיזציית קבוצות נמענים",
            title: `קבוצה מניבה: "${bestGrp.name}" — +${diff}% פתיחות`,
            body: `הכללת הקבוצה <strong>"${bestGrp.name}"</strong> ברשימת הנמענים מגדילה את אחוז הפתיחה ב-<strong>+${diff}%</strong> (מ-${bestGrp.avg_open_without}% ל-${bestGrp.avg_open_with}%). הקבוצה מכילה ${bestGrp.count} דיוורים בניסיון.`,
            metrics: [
                { label: "פתיחה עם הקבוצה", val: `${bestGrp.avg_open_with}%`, cls: "up" },
                { label: "פתיחה ללא הקבוצה", val: `${bestGrp.avg_open_without}%`, cls: "warn" }
            ],
            actions: [
                `הרחב את שימוש קבוצת "${bestGrp.name}" לדיוורים בעלי חשיבות גבוהה`,
                "בחן אם ניתן לפצל את הקבוצה לתת-קבוצות ולהתאים תוכן",
                "השתמש בקבוצה זו כבסיס לדיוורי Pilot"
            ]
        });
    }

    /* ── 9. MONTHLY TREND ── */
    if (mo.length >= 3) {
        const last3 = mo.slice(-3);
        const trend = last3[2].avg_open - last3[0].avg_open;
        if (Math.abs(trend) > 2) {
            allRecs.push({
                priority: trend < 0 ? "high" : "tip",
                icon: trend < 0 ? "fa-chart-line-down" : "fa-chart-line",
                iconBg: trend < 0 ? "rgba(239,68,68,.08)" : "rgba(16,185,129,.1)",
                iconColor: trend < 0 ? "var(--accent-red)" : "var(--accent-green)",
                category: "📊 ניתוח מגמות חודשי",
                title: trend < 0
                    ? `ירידה מגמתית: ${Math.abs(Math.round(trend*100)/100)}% בשלושת החודשים האחרונים`
                    : `עלייה מגמתית: +${Math.round(trend*100)/100}% בשלושת החודשים האחרונים`,
                body: trend < 0
                    ? `אחוזי הפתיחה ירדו מ-<strong>${last3[0].avg_open}%</strong> (${last3[0].month_name}) ל-<strong>${last3[2].avg_open}%</strong> (${last3[2].month_name}). מגמה שלילית זו דורשת בחינה מחדש של אסטרטגיית השיווק.`
                    : `אחוזי הפתיחה עלו מ-<strong>${last3[0].avg_open}%</strong> (${last3[0].month_name}) ל-<strong>${last3[2].avg_open}%</strong> (${last3[2].month_name}). המשך בנתיב זה!`,
                metrics: [
                    { label: last3[0].month_name, val: `${last3[0].avg_open}%`, cls: trend<0?"down":"warn" },
                    { label: last3[2].month_name, val: `${last3[2].avg_open}%`, cls: trend<0?"warn":"up" }
                ],
                actions: trend < 0
                    ? ["בצע ניתוח תוכן — האם איכות הדיוורים ירדה?", "בדוק אם גדלה תדירות הדיוורים (Fatigue)", "ערוך סקר נמענים לזיהוי גורם הירידה"]
                    : ["תעד את השינויים שבוצעו בחודשים האחרונים", "הפץ Best Practices מהחודש הטוב ביותר", "שמור על עקביות ואל תשנה מה שעובד"]
            });
        }
    }

    /* ── 10. FREQUENCY FATIGUE ── */
    const mailsByMonth = mo.map(m=>m.mailings_count);
    const avgMonthly = Math.round(mailsByMonth.reduce((a,b)=>a+b,0)/mailsByMonth.length);
    const maxMonthly = Math.max(...mailsByMonth);
    if (maxMonthly > avgMonthly * 1.5) {
        const peakMonth = mo.find(m=>m.mailings_count===maxMonthly);
        allRecs.push({
            priority: "medium",
            icon: "fa-inbox", iconBg: "rgba(99,102,241,.12)", iconColor: "var(--primary)",
            category: "📮 עומס דיוורים — Mailing Fatigue",
            title: `עומס שיא ב${peakMonth?.month_name} — ${maxMonthly} דיוורים בחודש`,
            body: `הממוצע החודשי הוא <strong>${avgMonthly} דיוורים</strong>, אך ב${peakMonth?.month_name} נשלחו <strong>${maxMonthly}</strong> — פי ${Math.round(maxMonthly/avgMonthly*10)/10} מהממוצע. עומס יתר גורם ל-Subscriber Fatigue ופוגע באחוזי פתיחה.`,
            metrics: [
                { label: "ממוצע חודשי", val: avgMonthly, cls: "warn" },
                { label: `שיא (${peakMonth?.month_name})`, val: maxMonthly, cls: "down" }
            ],
            actions: [
                "הגדר Sending Calendar חודשי ומגבל את מספר הדיוורים",
                "בצע עדיפות: דיוורים קריטיים בלבד בחודשים עמוסים",
                "שקול פילוח — לא כל נמען צריך לקבל כל דיוור"
            ]
        });
    }

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
            ${r.metrics.map(m=>`
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

