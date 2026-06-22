// App state variables
let dashboardData = null;
let charts = {};

// On DOM Content Loaded
document.addEventListener("DOMContentLoaded", () => {
    // Load Dashboard Data
    loadDashboardData();
});

// Load Dashboard Data
function loadDashboardData() {
    fetch('./data.json')
        .then(response => response.json())
        .then(data => {
            dashboardData = data;
            
            // Update last updated timestamp
            document.getElementById("last-updated-text").innerText = `עודכן לאחרונה: 22/06/2026`;
            
            // 1. Initialize UI Elements
            populateSelectors();
            updateKPIs();
            renderRecipientGroupsCheckboxes();
            renderAdministrativeHealthPanel();
            renderKeywordGuidelines();
            
            // 2. Render Charts
            renderCharts();
            
            // 3. Render Recipient Influence Cards
            renderRecipientInfluenceCards();
            
            // 4. Render Activity Grid (GitHub style)
            renderMailingActivityGrid();
            
            // 5. Render History Table
            renderHistoryTable(data.mailings);
            setupTableListeners();
            
            // 6. Run initial simulation prediction
            runPrediction();
            setupSimulatorListeners();
        })
        .catch(err => {
            console.error("Error loading dashboard data:", err);
            alert("שגיאה בטעינת נתוני האנליטיקס. אנא וודא שקובץ data.json קיים.");
        });
}

// Populate Category dropdown selectors
function populateSelectors() {
    const categories = Object.keys(dashboardData.categories);
    const simCategorySelect = document.getElementById("sim-category");
    const chartCategorySelect = document.getElementById("chart-category-filter");
    const tableCategorySelect = document.getElementById("category-filter");
    
    simCategorySelect.innerHTML = "";
    chartCategorySelect.innerHTML = `<option value="all">כל הקטגוריות (ממוצע)</option>`;
    tableCategorySelect.innerHTML = `<option value="all">כל הקטגוריות</option>`;
    
    categories.forEach(cat => {
        const opt1 = document.createElement("option");
        opt1.value = cat;
        opt1.textContent = cat;
        simCategorySelect.appendChild(opt1);
        
        const opt2 = document.createElement("option");
        opt2.value = cat;
        opt2.textContent = cat;
        chartCategorySelect.appendChild(opt2);
        
        const opt3 = document.createElement("option");
        opt3.value = cat;
        opt3.textContent = cat;
        tableCategorySelect.appendChild(opt3);
    });
}

// Update KPI cards
function updateKPIs() {
    const stats = dashboardData.overall_stats;
    document.getElementById("kpi-total-mailings").innerText = stats.total_mailings;
    document.getElementById("kpi-total-sent").innerText = stats.total_sent.toLocaleString();
    document.getElementById("kpi-avg-open").innerText = `${stats.avg_open_rate}%`;
    document.getElementById("kpi-avg-click").innerText = `${stats.avg_click_rate}%`;
}

// Render Administrative Health and Deliverability Card
function renderAdministrativeHealthPanel() {
    const stats = dashboardData.overall_stats;
    
    const bounceRateEl = document.getElementById("health-bounce-rate");
    const bounceCountEl = document.getElementById("health-bounce-count");
    
    bounceRateEl.innerText = `${stats.bounce_rate}%`;
    bounceCountEl.innerText = stats.total_bounces.toLocaleString();
    
    // Evaluate health badge
    const healthBadge = document.querySelector(".health-status-badge");
    if (stats.bounce_rate < 0.1) {
        healthBadge.className = "health-status-badge good";
        healthBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> רפוטציית שרת: מצוינת (${stats.bounce_rate}% חזרות)`;
    } else if (stats.bounce_rate < 1.0) {
        healthBadge.className = "health-status-badge warning";
        healthBadge.style.color = "var(--accent-orange)";
        healthBadge.style.background = "rgba(245, 158, 11, 0.08)";
        healthBadge.style.borderColor = "rgba(245, 158, 11, 0.2)";
        healthBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> רפוטציית שרת: גבולית (${stats.bounce_rate}% חזרות)`;
    } else {
        healthBadge.className = "health-status-badge critical";
        healthBadge.style.color = "var(--accent-red)";
        healthBadge.style.background = "rgba(239, 68, 68, 0.08)";
        healthBadge.style.borderColor = "rgba(239, 68, 68, 0.2)";
        healthBadge.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> שיעור חזרות גבוה: דורש בדיקה!`;
    }
}

// Render Subject Line Keyword boosts list in the Sidebar
function renderKeywordGuidelines() {
    const container = document.getElementById("keyword-impact-container");
    container.innerHTML = "";
    
    const kwStats = dashboardData.keyword_stats;
    // Sort by open rate diff descending (most positive first)
    const sortedKws = [...kwStats].sort((a, b) => b.open_diff - a.open_diff);
    
    sortedKws.forEach(kw => {
        const sign = kw.open_diff >= 0 ? "+" : "";
        const signClass = kw.open_diff >= 0 ? "positive" : "negative";
        
        const row = document.createElement("div");
        row.className = "keyword-impact-row";
        row.innerHTML = `
            <span class="kw-name">מילת מפתח: <strong>"${kw.keyword}"</strong></span>
            <span class="kw-val ${signClass}">${sign}${kw.open_diff}% פתיחה</span>
        `;
        container.appendChild(row);
    });
}

// Render checkboxes for top recipient groups
function renderRecipientGroupsCheckboxes() {
    const container = document.getElementById("groups-checkboxes-container");
    container.innerHTML = "";
    
    const influences = dashboardData.recipient_groups_influence;
    const sortedGroups = Object.keys(influences)
        .sort((a, b) => influences[b].count - influences[a].count)
        .slice(0, 8);
        
    sortedGroups.forEach(groupName => {
        const item = document.createElement("div");
        item.className = "group-chk-item";
        item.innerHTML = `
            <input type="checkbox" id="chk-grp-${groupName}" value="${groupName}">
            <label for="chk-grp-${groupName}">${groupName} (${influences[groupName].count})</label>
        `;
        container.appendChild(item);
        
        const chk = item.querySelector("input");
        chk.addEventListener("change", () => {
            if (chk.checked) {
                item.classList.add("checked");
            } else {
                item.classList.remove("checked");
            }
            runPrediction();
        });
    });
}

// Setup simulator input change listeners
function setupSimulatorListeners() {
    const inputs = ["sim-category", "sim-day", "sim-hour"];
    inputs.forEach(id => {
        document.getElementById(id).addEventListener("change", runPrediction);
    });
    
    document.getElementsByName("sim-holiday").forEach(radio => {
        radio.addEventListener("change", runPrediction);
    });
}

// Prediction model calculations (Linear Additive Model)
function runPrediction() {
    if (!dashboardData) return;
    
    const model = dashboardData.model_coefficients;
    
    const category = document.getElementById("sim-category").value;
    const day = parseInt(document.getElementById("sim-day").value);
    const hourBin = document.getElementById("sim-hour").value;
    const isHolidayStr = document.querySelector('input[name="sim-holiday"]:checked').value;
    const isHoliday = isHolidayStr === 'true';
    
    const selectedGroups = [];
    document.querySelectorAll('#groups-checkboxes-container input[type="checkbox"]:checked').forEach(chk => {
        selectedGroups.push(chk.value);
    });
    
    // Base rate
    let predOpen = model.intercept_opens;
    let predClick = model.intercept_clicks;
    
    // Category effect
    if (model.category_effects[category]) {
        predOpen += model.category_effects[category].opens;
        predClick += model.category_effects[category].clicks;
    }
    
    // Day effect
    if (model.day_effects[day]) {
        predOpen += model.day_effects[day].opens;
        predClick += model.day_effects[day].clicks;
    }
    
    // Hour bin effect
    if (model.hour_bin_effects[hourBin]) {
        predOpen += model.hour_bin_effects[hourBin].opens;
        predClick += model.hour_bin_effects[hourBin].clicks;
    }
    
    // Holiday effect
    const holidayKey = isHoliday ? 'true' : 'false';
    if (model.holiday_effects[holidayKey]) {
        predOpen += model.holiday_effects[holidayKey].opens;
        predClick += model.holiday_effects[holidayKey].clicks;
    }
    
    // Recipient group effects
    selectedGroups.forEach(grp => {
        if (model.group_effects[grp]) {
            predOpen += model.group_effects[grp].opens;
            predClick += model.group_effects[grp].clicks;
        }
    });
    
    predOpen = Math.max(0, Math.round(predOpen * 100) / 100);
    predClick = Math.max(0, Math.round(predClick * 100) / 100);
    
    // Update Circular Gauges
    document.getElementById("pred-open-val").innerText = `${predOpen}%`;
    const openCircle = document.getElementById("pred-open-circle");
    const openPercentForGradient = Math.min(100, Math.round((predOpen / 300) * 100));
    openCircle.style.setProperty("--value", openPercentForGradient);
    
    document.getElementById("pred-click-val").innerText = `${predClick}%`;
    const clickCircle = document.getElementById("pred-click-circle");
    const clickPercentForGradient = Math.min(100, Math.round((predClick / 30) * 100));
    clickCircle.style.setProperty("--value", clickPercentForGradient);
    
    // Compare labels
    const globalOpen = dashboardData.overall_stats.avg_open_rate;
    const globalClick = dashboardData.overall_stats.avg_click_rate;
    
    const openDiff = Math.round((predOpen - globalOpen) * 100) / 100;
    const clickDiff = Math.round((predClick - globalClick) * 100) / 100;
    
    const openDiffEl = document.getElementById("pred-open-diff");
    const clickDiffEl = document.getElementById("pred-click-diff");
    
    if (openDiff >= 0) {
        openDiffEl.className = "meter-sub good";
        openDiffEl.innerHTML = `<i class="fa-solid fa-caret-up"></i> ${openDiff}% מהממוצע`;
    } else {
        openDiffEl.className = "meter-sub bad";
        openDiffEl.innerHTML = `<i class="fa-solid fa-caret-down"></i> ${Math.abs(openDiff)}% מהממוצע`;
    }
    
    if (clickDiff >= 0) {
        clickDiffEl.className = "meter-sub good";
        clickDiffEl.innerHTML = `<i class="fa-solid fa-caret-up"></i> ${clickDiff}% מהממוצע`;
    } else {
        clickDiffEl.className = "meter-sub bad";
        clickDiffEl.innerHTML = `<i class="fa-solid fa-caret-down"></i> ${Math.abs(clickDiff)}% מהממוצע`;
    }
    
    // Quality Score
    const weightedScore = ((predOpen / 250) * 50) + ((predClick / 20) * 50);
    const scoreVal = Math.min(100, Math.max(0, Math.round(weightedScore)));
    
    let grade = "C";
    if (scoreVal >= 90) grade = "S";
    else if (scoreVal >= 75) grade = "A+";
    else if (scoreVal >= 60) grade = "A";
    else if (scoreVal >= 45) grade = "B+";
    else if (scoreVal >= 30) grade = "B";
    else if (scoreVal >= 15) grade = "C+";
    
    document.getElementById("pred-score").innerText = grade;
    document.getElementById("pred-score-bar").style.width = `${scoreVal}%`;
    
    generateAdvice(category, day, hourBin);
}

// Generate context-aware recommendations
function generateAdvice(category, day, hourBin) {
    const catStats = dashboardData.categories[category];
    if (!catStats) return;
    
    const bestHourBin = catStats.best_hour;
    const bestDay = catStats.best_day;
    
    let bestHourBinName = "";
    if (7 <= bestHourBin && bestHourBin <= 10) bestHourBinName = "בוקר (07:00-11:00)";
    else if (11 <= bestHourBin && bestHourBin <= 13) bestHourBinName = "צהריים (11:00-14:00)";
    else if (14 <= bestHourBin && bestHourBin <= 17) bestHourBinName = "אחר הצהריים (14:00-18:00)";
    else if (18 <= bestHourBin && bestHourBin <= 21) bestHourBinName = "ערב (18:00-22:00)";
    else bestHourBinName = "לילה (22:00-07:00)";
    
    const dayNamesHeb = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    const selectedDayName = dayNamesHeb[day];
    
    let adviceHtml = "";
    
    if (selectedDayName !== bestDay && hourBin !== bestHourBinName) {
        adviceHtml = `לקבלת מעורבות שיא בקטגוריה זו, מומלץ להעביר את הדיוור ליום <strong>יום ${bestDay}</strong> ובטווח שעות ה<strong>${bestHourBinName}</strong>. שינוי זה עשוי להניב תוצאות פתיחה והקלקה גבוהות משמעותית.`;
    } else if (selectedDayName !== bestDay) {
        adviceHtml = `שעת המשלוח שבחרת מצוינת! עם זאת, לתוצאות מרביות מומלץ להחליף את יום השליחה ל<strong>יום ${bestDay}</strong> (היום האופטימלי לקטגוריה זו).`;
    } else if (hourBin !== bestHourBinName) {
        adviceHtml = `יום המשלוח שבחרת (יום ${selectedDayName}) הוא יום השיא! עם זאת, מומלץ לכוון את שעת ההפצה ל<strong>${bestHourBinName}</strong> לשיעור פתיחות מקסימלי.`;
    } else {
        adviceHtml = `<strong>עבודה מצוינת!</strong> הדיוור שלך מתוזמן ליום ולשעה האופטימליים בדיוק עבור קטגוריית <strong>${category}</strong>! שילוב של יום ${selectedDayName} ב${hourBin} ימקסם את חשיפת התוכן.`;
    }
    
    document.getElementById("pred-advice-text").innerHTML = adviceHtml;
}

// Render dynamic charts
function renderCharts() {
    // 1. Category Chart
    const categoriesData = dashboardData.categories;
    const catLabels = Object.keys(categoriesData);
    const catOpens = catLabels.map(cat => categoriesData[cat].avg_open);
    const catClicks = catLabels.map(cat => categoriesData[cat].avg_click);
    
    const ctx1 = document.getElementById('categoryChart').getContext('2d');
    charts.category = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: catLabels,
            datasets: [
                {
                    label: 'אחוז פתיחה ממוצע (%)',
                    data: catOpens,
                    backgroundColor: 'rgba(6, 182, 212, 0.65)',
                    borderColor: 'rgba(6, 182, 212, 1)',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'אחוז הקלקות ממוצע (%)',
                    data: catClicks,
                    backgroundColor: 'rgba(16, 185, 129, 0.65)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'אחוזי פתיחה', color: '#9ca3af' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y1: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'אחוזי הקלקות', color: '#9ca3af' },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#9ca3af' }
                },
                x: { ticks: { color: '#9ca3af', font: { family: 'Heebo' } } }
            },
            plugins: {
                legend: { labels: { color: '#f3f4f6', font: { family: 'Heebo' } } }
            }
        }
    });

    // 2. Hourly Chart with filter
    updateHourlyChart('all');
    document.getElementById("chart-category-filter").addEventListener("change", (e) => {
        updateHourlyChart(e.target.value);
    });

    // 3. Days of Week Chart
    const daysData = dashboardData.days_of_week;
    const dayLabels = Object.keys(daysData);
    const dayOpens = dayLabels.map(d => daysData[d].avg_open);
    const dayClicks = dayLabels.map(d => daysData[d].avg_click);
    
    const ctx3 = document.getElementById('daysChart').getContext('2d');
    charts.days = new Chart(ctx3, {
        type: 'bar',
        data: {
            labels: dayLabels,
            datasets: [
                {
                    label: 'אחוז פתיחה (%)',
                    data: dayOpens,
                    backgroundColor: 'rgba(99, 102, 241, 0.65)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1
                },
                {
                    label: 'אחוז הקלקות (%)',
                    data: dayClicks,
                    backgroundColor: 'rgba(16, 185, 129, 0.65)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
                x: { ticks: { color: '#9ca3af' } }
            },
            plugins: {
                legend: { labels: { color: '#f3f4f6', font: { family: 'Heebo' } } }
            }
        }
    });

    // 4. NEW: Monthly volume and engagement Chart (dual Y-axis)
    const monthlyStats = dashboardData.monthly_statistics;
    const monthLabels = monthlyStats.map(m => m.month_name);
    const monthlyVolumes = monthlyStats.map(m => m.total_sent);
    const monthlyOpens = monthlyStats.map(m => m.avg_open);
    
    const ctx4 = document.getElementById('monthlyChart').getContext('2d');
    charts.monthly = new Chart(ctx4, {
        type: 'bar',
        data: {
            labels: monthLabels,
            datasets: [
                {
                    type: 'bar',
                    label: 'נפח נמענים שנשלחו',
                    data: monthlyVolumes,
                    backgroundColor: 'rgba(99, 102, 241, 0.45)',
                    borderColor: 'rgba(99, 102, 241, 0.8)',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: 'אחוז פתיחה ממוצע (%)',
                    data: monthlyOpens,
                    borderColor: 'rgba(16, 185, 129, 1)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: false,
                    tension: 0.35,
                    borderWidth: 2,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'נפח דיוורים (נמענים)', color: '#9ca3af' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y1: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'אחוזי פתיחה', color: '#9ca3af' },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#9ca3af' }
                },
                x: { ticks: { color: '#9ca3af' } }
            },
            plugins: {
                legend: { labels: { color: '#f3f4f6', font: { family: 'Heebo' } } }
            }
        }
    });
}

// Hourly performance filter chart
function updateHourlyChart(categoryFilter) {
    const mailings = dashboardData.mailings;
    const hourStats = Array.from({ length: 24 }, (_, h) => ({ hour: h, sumOpen: 0, sumClick: 0, count: 0 }));
    
    mailings.forEach(m => {
        if (categoryFilter === 'all' || m.category === categoryFilter) {
            const hr = parseInt(m.time.split(':')[0]);
            hourStats[hr].sumOpen += m.open_rate;
            hourStats[hr].sumClick += m.click_rate;
            hourStats[hr].count += 1;
        }
    });
    
    const hours = [];
    const openRates = [];
    const clickRates = [];
    
    hourStats.forEach(h => {
        if (h.count > 0) {
            hours.push(`${h.hour.toString().padStart(2, '0')}:00`);
            openRates.push(Math.round((h.sumOpen / h.count) * 100) / 100);
            clickRates.push(Math.round((h.sumClick / h.count) * 100) / 100);
        }
    });
    
    const ctx = document.getElementById('hourlyChart').getContext('2d');
    
    if (charts.hourly) {
        charts.hourly.destroy();
    }
    
    charts.hourly = new Chart(ctx, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [
                {
                    label: 'אחוז פתיחה (%)',
                    data: openRates,
                    borderColor: 'rgba(6, 182, 212, 1)',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2
                },
                {
                    label: 'אחוז הקלקות (%)',
                    data: clickRates,
                    borderColor: 'rgba(16, 185, 129, 1)',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    fill: false,
                    tension: 0.35,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
                x: { ticks: { color: '#9ca3af' } }
            },
            plugins: {
                legend: { labels: { color: '#f3f4f6', font: { family: 'Heebo' } } }
            }
        }
    });
}

// Render Recipient groups card influence
function renderRecipientInfluenceCards() {
    const container = document.getElementById("groups-influence-container");
    container.innerHTML = "";
    
    const influences = dashboardData.recipient_groups_influence;
    const sortedGroups = Object.keys(influences)
        .sort((a, b) => influences[b].count - influences[a].count)
        .slice(0, 4);
        
    sortedGroups.forEach(grp => {
        const d = influences[grp];
        const openDiff = Math.round((d.avg_open_with - d.avg_open_without) * 100) / 100;
        
        const isPositive = openDiff >= 0;
        const impactClass = isPositive ? "positive" : "negative";
        const impactSign = isPositive ? "+" : "";
        const caretIcon = isPositive ? "fa-caret-up" : "fa-caret-down";
        
        const card = document.createElement("div");
        card.className = "group-influence-card";
        card.innerHTML = `
            <div class="group-inf-name" title="${grp}">${grp}</div>
            <div class="group-inf-stats">
                <div class="group-inf-row">
                    <span>פתיחה (עם הקבוצה)</span>
                    <span class="val">${d.avg_open_with}%</span>
                </div>
                <div class="group-inf-row">
                    <span>פתיחה (ללא הקבוצה)</span>
                    <span class="val">${d.avg_open_without}%</span>
                </div>
            </div>
            <div class="group-inf-impact ${impactClass}">
                <span>השפעת פתיחה:</span>
                <span class="val"><i class="fa-solid ${caretIcon}"></i> ${impactSign}${openDiff}%</span>
            </div>
        `;
        container.appendChild(card);
    });
}

// Render Mailing Activity Grid (GitHub-style)
function renderMailingActivityGrid() {
    const grid = document.getElementById("mailings-activity-grid");
    const monthsLabels = document.getElementById("activity-months-labels");
    grid.innerHTML = "";
    monthsLabels.innerHTML = "";
    
    const mailings = dashboardData.mailings;
    
    const dateCounts = {};
    const dateSent = {};
    const dateMailingsList = {};
    
    mailings.forEach(m => {
        dateCounts[m.date] = (dateCounts[m.date] || 0) + 1;
        dateSent[m.date] = (dateSent[m.date] || 0) + m.sent;
        if (!dateMailingsList[m.date]) dateMailingsList[m.date] = [];
        dateMailingsList[m.date].push(m);
    });
    
    const startDate = new Date(2026, 0, 1);
    const endDate = new Date(2026, 4, 31);
    
    const startDay = startDate.getDay();
    const gridStartDate = new Date(startDate);
    gridStartDate.setDate(startDate.getDate() - startDay);
    
    const allGridDates = [];
    let current = new Date(gridStartDate);
    
    while (current <= endDate) {
        allGridDates.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    
    const monthNames = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי"];
    let lastMonth = -1;
    let colIndex = 0;
    
    allGridDates.forEach((dateObj, idx) => {
        const dateStr = dateObj.getFullYear() + '-' + 
                        (dateObj.getMonth() + 1).toString().padStart(2, '0') + '-' + 
                        dateObj.getDate().toString().padStart(2, '0');
                        
        const count = dateCounts[dateStr] || 0;
        const totalSent = dateSent[dateStr] || 0;
        
        let level = 0;
        if (count === 1) level = 1;
        else if (count === 2) level = 2;
        else if (count >= 3 && count <= 4) level = 3;
        else if (count >= 5) level = 4;
        
        const cell = document.createElement("div");
        cell.className = `activity-cell level-${level}`;
        
        const formattedDate = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
        let tooltipText = `אין דיוורים ב-${formattedDate}`;
        if (count > 0) {
            tooltipText = `${count} דיוור/ים ב-${formattedDate} (סה"כ ${totalSent.toLocaleString()} נמענים)`;
        }
        cell.setAttribute("data-tooltip", tooltipText);
        cell.setAttribute("data-date", dateStr);
        
        cell.addEventListener("click", () => {
            showDayDetails(formattedDate, dateMailingsList[dateStr] || []);
        });
        
        grid.appendChild(cell);
        
        const dayOfWeek = dateObj.getDay();
        if (dayOfWeek === 0) {
            const month = dateObj.getMonth();
            if (month !== lastMonth && month <= 4 && dateObj >= startDate) {
                lastMonth = month;
                const label = document.createElement("span");
                label.className = "activity-month-label";
                label.innerText = monthNames[month];
                label.style.right = `${colIndex * 15}px`;
                monthsLabels.appendChild(label);
            }
            colIndex++;
        }
    });
}

// Show selected day mailings list below grid
function showDayDetails(dateLabel, dayMailings) {
    const title = document.getElementById("day-details-title");
    const list = document.getElementById("day-details-list");
    
    title.innerHTML = `<i class="fa-solid fa-calendar-day"></i> דיוורים שנשלחו בתאריך <strong>${dateLabel}</strong> (${dayMailings.length} דיוורים)`;
    
    if (dayMailings.length === 0) {
        list.innerHTML = `<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 12px 0;">אין דיוורים ביום זה במאגר.</div>`;
        return;
    }
    
    list.innerHTML = dayMailings.map(m => `
        <div class="day-detail-item">
            <div>
                <span class="day-detail-badge">${m.time}</span>
                <span class="day-detail-subject">${m.subject}</span>
            </div>
            <div class="day-detail-meta">
                <span>קטגוריה: <strong>${m.category}</strong></span>
                <span>נמענים: <strong class="outfit">${m.sent.toLocaleString()}</strong></span>
                <div class="day-detail-stats">
                    <span class="open">פתיחות: <strong class="outfit">${m.open_rate}%</strong></span>
                    <span class="click">הקלקות: <strong class="outfit">${m.click_rate}%</strong></span>
                </div>
            </div>
        </div>
    `).join('');
}

// Render historical mailings log table
function renderHistoryTable(mailings) {
    const tbody = document.getElementById("mailings-table-body");
    tbody.innerHTML = "";
    
    if (mailings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">לא נמצאו דיוורים העונים על סינון זה.</td></tr>`;
        return;
    }
    
    mailings.forEach(m => {
        const isHolidayBadge = m.near_holiday 
            ? `<span class="badge holiday"><i class="fa-solid fa-umbrella-beach"></i> ${m.holiday_name}</span>`
            : `<span class="badge normal">רגיל</span>`;
            
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="outfit">${m.date} ${m.time}</td>
            <td style="font-weight: 500; color: var(--text-primary);">${m.subject}</td>
            <td>${m.category}</td>
            <td class="outfit">${m.sent.toLocaleString()}</td>
            <td class="open-val outfit">${m.open_rate}%</td>
            <td class="click-val outfit">${m.click_rate}%</td>
            <td>${isHolidayBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Filters logic for historical table
function setupTableListeners() {
    const searchInput = document.getElementById("search-input");
    const categorySelect = document.getElementById("category-filter");
    
    const filterTable = () => {
        const query = searchInput.value.toLowerCase().trim();
        const selectedCat = categorySelect.value;
        
        const filtered = dashboardData.mailings.filter(m => {
            const matchesSearch = m.subject.toLowerCase().includes(query);
            const matchesCategory = selectedCat === 'all' || m.category === selectedCat;
            return matchesSearch && matchesCategory;
        });
        
        renderHistoryTable(filtered);
    };
    
    searchInput.addEventListener("input", filterTable);
    categorySelect.addEventListener("change", filterTable);
}
