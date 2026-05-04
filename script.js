// ==========================================
// Constants & Configuration
// ==========================================
const CONFIG = {
    WEEKDAYS: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    EFFICIENCY: { MIN: 15.0, MAX: 80.0 },
    STORAGE_KEYS: { LOGS: 'bikeLogs', DRAFT: 'bikeDraft' },
    OIL_CHANGE_INTERVAL: 3000,
    FUEL_LIMIT_MAX: 50.0 // Realistic maximum fuel amount for a bike
};

// ==========================================
// Application State
// ==========================================
const appState = {
    logs: [],
    editingId: null,
    chart: null,
    currentChartType: 'dist'
};

// ==========================================
// Initialization
// ==========================================
window.onload = () => {
    try {
        const savedData = localStorage.getItem(CONFIG.STORAGE_KEYS.LOGS);
        if (savedData) {
            appState.logs = sanitizeLogs(JSON.parse(savedData));
        }
    } catch (e) {
        console.error("Data load error:", e);
    }

    const dateInput = document.getElementById('date');
    if (dateInput && !dateInput.value) dateInput.valueAsDate = new Date();

    initEventListeners();
    renderAll();
    loadDraft();
};

function initEventListeners() {
    // Button events
    document.getElementById('save-btn-text').addEventListener('click', saveData);
    document.getElementById('clear-form-btn').addEventListener('click', clearForm);
    document.getElementById('cancel-edit').addEventListener('click', cancelEdit);
    document.getElementById('import-json-btn').addEventListener('click', importJSON);
    document.getElementById('download-json-btn').addEventListener('click', downloadJSON);
    document.getElementById('json-upload').addEventListener('change', loadJSONFile);

    // Chart switching
    document.getElementById('btn-dist').addEventListener('click', () => switchChart('dist'));
    document.getElementById('btn-fuel').addEventListener('click', () => switchChart('fuel'));

    // Input monitoring
    document.getElementById('date').addEventListener('change', loadHistoryAtDate);
    document.getElementById('distance').addEventListener('input', handleInputValidation);
    document.getElementById('fuel').addEventListener('input', handleInputValidation);
    document.getElementById('other-note').addEventListener('input', draftSave);

    // Maintenance item clicks (checkbox toggle)
    document.querySelectorAll('.check-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const cb = item.querySelector('input[type="checkbox"]');
            if (e.target !== cb) {
                cb.checked = !cb.checked;
            }
            draftSave();
        });
    });
}

function sanitizeLogs(logs) {
    return logs.map((log, index) => {
        if (!log.id) {
            log.id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        }
        log.id = String(log.id); // Ensure string ID
        log.dist = parseFloat(log.dist) || 0; // Numeric conversion
        log.fuel = parseFloat(log.fuel) || 0; // Numeric conversion
        return log;
    });
}

// ==========================================
// Data Logic (Pure Functions or Logic Helpers)
// ==========================================
function getDayStr(dateStr) {
    const d = new Date(dateStr);
    return isNaN(d) ? "" : `(${CONFIG.WEEKDAYS[d.getDay()]})`;
}

function calculateEfficiency(currentLog, prevLog) {
    if (!currentLog || !prevLog || currentLog.fuel <= 0) return null;
    const diffDist = currentLog.dist - prevLog.dist;
    if (diffDist <= 0) return null;
    
    const eff = diffDist / currentLog.fuel;
    if (eff < CONFIG.EFFICIENCY.MIN || eff > CONFIG.EFFICIENCY.MAX) return null;
    return eff;
}

/**
 * Calculate distance since the last service for a specific item
 */
function getDistanceSinceLastService(logs, currentIndex, maintenanceKey) {
    const currentLog = logs[currentIndex];
    if (!currentLog.maintenance?.[maintenanceKey]) return "";
    
    const prevLog = logs.slice(currentIndex + 1).find(l => l.maintenance?.[maintenanceKey]);
    if (!prevLog) return "";
    
    const diff = currentLog.dist - prevLog.dist;
    return ` (+${diff.toLocaleString()}km)`;
}

// ==========================================
// UI Handlers (Actions)
// ==========================================
function loadHistoryAtDate() {
    if (appState.editingId) return;
    resetInputs();
    document.getElementById('save-btn-text').innerText = "Save Data";
    loadDraft();
}

function editLog(id) {
    const log = appState.logs.find(l => String(l.id) === String(id));
    if (!log) return;

    appState.editingId = id;
    fillFormWithLog(log);

    document.getElementById('save-btn-text').innerText = "Update Data";
    document.getElementById('cancel-edit').style.display = "block";
    document.querySelector('.card:nth-of-type(2)').scrollIntoView({ behavior: 'smooth' });
}

function fillFormWithLog(log) {
    document.getElementById('date').value = log.date;
    document.getElementById('distance').value = log.dist;
    document.getElementById('fuel').value = log.fuel || "";
    document.getElementById('other-note').value = log.otherNote || "";
    
    const m = log.maintenance || {};
    const keys = ['oil', 'chain', 'chain-adj', 'tire-f', 'tire-r', 'other'];
    const logKeys = ['oil', 'chain', 'chainAdj', 'tireF', 'tireR', 'other'];
    keys.forEach((key, i) => {
        document.getElementById(`check-${key}`).checked = !!m[logKeys[i]];
    });
}

function cancelEdit() {
    appState.editingId = null;
    resetInputs();
    document.getElementById('save-btn-text').innerText = "Save Data";
    document.getElementById('cancel-edit').style.display = "none";
}

function clearForm() {
    if (appState.editingId && !confirm("Discard changes and clear the form?")) return;
    cancelEdit();
    document.getElementById('date').valueAsDate = new Date();
    localStorage.removeItem(CONFIG.STORAGE_KEYS.DRAFT);
}

/**
 * Input validation
 * @returns {string|null} Error message (null if valid)
 */
function validateEntry(distRaw, fuelRaw) {
    // Distance check
    if (!distRaw || distRaw.trim() === "") return "Please enter the odometer reading.";
    const dist = Number(distRaw);
    if (!Number.isFinite(dist) || dist < 0) return "Please enter a valid odometer reading (0 or more).";

    // Fuel check
    if (fuelRaw && fuelRaw.trim() !== "") {
        const fuel = Number(fuelRaw);
        if (!Number.isFinite(fuel) || fuel < 0) return "Please enter a valid fuel amount (0 or more).";
        if (fuel > CONFIG.FUEL_LIMIT_MAX) return `Fuel amount is too high (max ${CONFIG.FUEL_LIMIT_MAX}L).`;
    }

    return null; // No errors
}

/**
 * Validation error display control
 */
function showValidationError(message) {
    const errorEl = document.getElementById('validation-error');
    if (message) {
        errorEl.innerText = message;
        errorEl.style.display = 'block';
    } else {
        errorEl.style.display = 'none';
    }
}

function saveData() {
    const distRaw = document.getElementById('distance').value;
    const fuelRaw = document.getElementById('fuel').value;
    
    // Enhanced validation
    const errorMessage = validateEntry(distRaw, fuelRaw);
    if (errorMessage) {
        showValidationError(errorMessage);
        return;
    }
    showValidationError(null); // Clear errors

    const entry = {
        date: document.getElementById('date').value,
        dist: Number(distRaw),
        fuel: Number(fuelRaw) || 0,
        otherNote: document.getElementById('other-note').value || "",
        maintenance: {
            oil: document.getElementById('check-oil').checked,
            chain: document.getElementById('check-chain').checked,
            chainAdj: document.getElementById('check-chain-adj').checked,
            tireF: document.getElementById('check-tire-f').checked,
            tireR: document.getElementById('check-tire-r').checked,
            other: document.getElementById('check-other').checked
        }
    };
    
    if (appState.editingId) {
        // Edit mode: Update existing data
        const index = appState.logs.findIndex(l => l.id === appState.editingId);
        if (index > -1) {
            appState.logs[index] = { ...entry, id: appState.editingId };
        }
        appState.editingId = null;
    } else {
        // New mode: Add as a new entry
        const newEntry = { ...entry, id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}` };
        appState.logs.unshift(newEntry);
    }

    sortLogs();
    saveToStorage();
    
    localStorage.removeItem(CONFIG.STORAGE_KEYS.DRAFT);
    document.getElementById('save-btn-text').innerText = "Save Data";
    document.getElementById('cancel-edit').style.display = "none";
    renderAll();
    resetInputs();
    showToast("Data saved!");
}

function handleInputValidation() {
    draftSave();
}

function deleteLog(id) {
    if (confirm("Delete this entry?")) {
        appState.logs = appState.logs.filter(l => String(l.id) !== String(id));
        saveToStorage();
        renderAll();
        loadHistoryAtDate();
    }
}

function switchChart(type) {
    appState.currentChartType = type;
    document.getElementById('btn-dist').classList.toggle('active', type === 'dist');
    document.getElementById('btn-fuel').classList.toggle('active', type === 'fuel');
    renderChart();
}

// ==========================================
// Storage & Draft Logic
// ==========================================
function saveToStorage() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.LOGS, JSON.stringify(appState.logs));
}

function draftSave() {
    if (appState.editingId) return;
    const draft = {
        date: document.getElementById('date').value,
        dist: document.getElementById('distance').value,
        fuel: document.getElementById('fuel').value,
        otherNote: document.getElementById('other-note').value,
        maintenance: {
            oil: document.getElementById('check-oil').checked,
            chain: document.getElementById('check-chain').checked,
            chainAdj: document.getElementById('check-chain-adj').checked,
            tireF: document.getElementById('check-tire-f').checked,
            tireR: document.getElementById('check-tire-r').checked,
            other: document.getElementById('check-other').checked
        }
    };
    localStorage.setItem(CONFIG.STORAGE_KEYS.DRAFT, JSON.stringify(draft));
}

function loadDraft() {
    try {
        const savedDraft = localStorage.getItem(CONFIG.STORAGE_KEYS.DRAFT);
        if (!savedDraft) return;
        const draft = JSON.parse(savedDraft);
        const currentDate = document.getElementById('date').value;
        if (draft && draft.date === currentDate) {
            document.getElementById('distance').value = draft.dist || "";
            document.getElementById('fuel').value = draft.fuel || "";
            document.getElementById('other-note').value = draft.otherNote || "";
            if (draft.maintenance) {
                document.getElementById('check-oil').checked = !!draft.maintenance.oil;
                document.getElementById('check-chain').checked = !!draft.maintenance.chain;
                document.getElementById('check-chain-adj').checked = !!draft.maintenance.chainAdj;
                document.getElementById('check-tire-f').checked = !!draft.maintenance.tireF;
                document.getElementById('check-tire-r').checked = !!draft.maintenance.tireR;
                document.getElementById('check-other').checked = !!draft.maintenance.other;
            }
        }
    } catch (e) {
        console.error("Draft load error:", e);
    }
}

function resetInputs() {
    document.getElementById('distance').value = "";
    document.getElementById('fuel').value = "";
    document.getElementById('other-note').value = "";
    document.querySelectorAll('input[type="checkbox"]').forEach(el => el.checked = false);
}

function toggleCheck(id) {
    const cb = document.getElementById(id);
    cb.checked = !cb.checked;
    draftSave();
}

function sortLogs() {
    appState.logs.sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        return dateDiff !== 0 ? dateDiff : b.dist - a.dist;
    });
}

// ==========================================
// Rendering (UI Updates)
// ==========================================
function renderAll() {
    renderDashboard();
    renderHistoryList();
    renderChart();
}

function renderDashboard() {
    if (appState.logs.length === 0) return;
    
    const latest = appState.logs[0];
    document.getElementById('display-total').innerText = latest.dist.toLocaleString();
    
    const lastOilEntry = appState.logs.find(l => l.maintenance?.oil);
    const warn = document.getElementById('oil-warning');
    
    if (lastOilEntry) {
        const diff = latest.dist - lastOilEntry.dist;
        if (diff >= CONFIG.OIL_CHANGE_INTERVAL) {
            warn.style.display = 'block';
            warn.innerHTML = `⚠️ OIL CHANGE REQUIRED (${diff.toLocaleString()}km driven)`;
        } else {
            warn.style.display = 'none';
        }
    } else {
        warn.style.display = 'none';
    }

    renderHealthCheck(latest.dist);
}

function renderHealthCheck(currentDist) {
    const container = document.getElementById('health-check-status');
    if (!container) return;
    container.innerHTML = "";

    const items = [
        { key: 'chain', label: 'Chain' },
        { key: 'chainAdj', label: 'Adjust' },
        { key: 'tireF', label: 'Tire(F)' },
        { key: 'tireR', label: 'Tire(R)' }
    ];

    items.forEach(item => {
        const lastLog = appState.logs.find(l => l.maintenance?.[item.key]);
        if (lastLog) {
            const diff = currentDist - lastLog.dist;
            const chip = document.createElement('div');
            chip.className = 'health-chip';
            chip.innerHTML = `${item.label}: <b>${diff.toLocaleString()} km</b>`;
            container.appendChild(chip);
        }
    });
}

function renderChart() {
    const logs = [...appState.logs].reverse();
    if (logs.length === 0) return;
    
    const labels = logs.map(l => l.date.slice(5));
    let data = [];
    let labelText = "";
    
    if (appState.currentChartType === 'dist') {
        data = logs.map(l => l.dist);
        labelText = "Odometer (km)";
    } else {
        logs.forEach((log, i) => {
            if (log.fuel > 0 && i > 0) {
                const prevWithFuel = logs.slice(0, i).reverse().find(l => l.fuel > 0);
                const eff = calculateEfficiency(log, prevWithFuel);
                data.push(eff ? eff.toFixed(1) : null);
            } else { data.push(null); }
        });
        labelText = "Efficiency (km/L)";
    }
    
    if (appState.chart) appState.chart.destroy();
    const ctx = document.getElementById('mainChart').getContext('2d');
    appState.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelText,
                data: data,
                borderColor: '#8DA9B8',
                backgroundColor: 'rgba(141, 169, 184, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointRadius: 3,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#2A2A2A' }, ticks: { color: '#A0A0A0', font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { color: '#A0A0A0', font: { size: 10 } } }
            }
        }
    });
}

function renderHistoryList() {
    const list = document.getElementById('history-list');
    list.innerHTML = "";
    
    appState.logs.slice(0, 30).forEach((log, index) => {
        let tagsHtml = "";
        let efficiencyHtml = "";
        
        if (log.fuel > 0) {
            const prevFuelEntry = appState.logs.slice(index + 1).find(l => l.fuel > 0);
            const eff = calculateEfficiency(log, prevFuelEntry);
            if (eff) {
                efficiencyHtml = `<span class="fuel-val">Avg: ${eff.toFixed(1)} km/L</span>`;
            }
        }

        if (log.maintenance) {
            const mLabels = [
                { key: 'oil', label: 'Oil Change' },
                { key: 'chain', label: 'Chain Replacement' },
                { key: 'chainAdj', label: 'Chain Adjustment' },
                { key: 'tireF', label: 'Front Tire Replacement' },
                { key: 'tireR', label: 'Rear Tire Replacement' }
            ];
            mLabels.forEach(m => {
                if (log.maintenance[m.key]) {
                    const diff = getDistanceSinceLastService(appState.logs, index, m.key);
                    tagsHtml += `<span class="tag">${m.label}${diff}</span>`;
                }
            });
            if (log.maintenance.other) {
                const note = log.otherNote ? `:${log.otherNote}` : "";
                tagsHtml += `<span class="tag">Maint${note}</span>`;
            }
        }

        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div class="history-info">
                <div class="history-main">${log.date} ${getDayStr(log.date)}</div>
                <div class="history-sub">
                    ${log.fuel > 0 ? 'Fuel: ' + log.fuel + 'L' : ''}
                    ${efficiencyHtml}
                </div>
                <div class="maint-tags">${tagsHtml}</div>
            </div>
            <div class="history-right">
                <div class="history-km">${log.dist.toLocaleString()} km</div>
                <div class="flex-btns" style="margin-top:0; gap:5px;">
                    <button class="edit-btn" onclick="editLog('${log.id}')">Edit</button>
                    <button class="del-btn" onclick="deleteLog('${log.id}')">Delete</button>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
}

/**
 * Show toast notification
 */
function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerText = message;
    toast.style.visibility = "visible";
    toast.style.opacity = "1";
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.visibility = "hidden";
    }, 3000);
}

// ==========================================
// Import / Export (JSON)
// ==========================================
async function downloadJSON() {
    if (appState.logs.length === 0) return alert("No data available");
    const dataStr = JSON.stringify(appState.logs, null, 2);
    const fileName = `xsr125_logs_${new Date().toISOString().slice(0,10)}.json`;

    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'JSON Files',
                    accept: { 'application/json': ['.json'] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(dataStr);
            await writable.close();
            return;
        } catch (err) {
            if (err.name === 'AbortError') return; // User canceled
            console.error(err);
        }
    }
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}

async function importJSON() {
    if ('showOpenFilePicker' in window) {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{
                    description: 'JSON Files',
                    accept: { 'application/json': ['.json'] },
                }],
            });
            const file = await handle.getFile();
            processJSONFile(file);
        } catch (err) {
            if (err.name !== 'AbortError') console.error(err);
        }
    } else {
        document.getElementById('json-upload').click();
    }
}

function loadJSONFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    processJSONFile(file);
    event.target.value = '';
}

function processJSONFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            appState.logs = sanitizeLogs(Array.isArray(imported) ? imported : [imported]);
            saveToStorage();
            renderAll();
            loadHistoryAtDate();
            alert("JSON data imported successfully");
        } catch (err) {
            alert("Invalid JSON file");
        }
    };
    reader.readAsText(file);
}