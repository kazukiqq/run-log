document.addEventListener('DOMContentLoaded', () => {
    // --- State & Constants ---
    let users = JSON.parse(localStorage.getItem('running_users')) || [];
    let currentUser = null;
    let records = [];
    let currentRankMode = 'time'; // 'time' or 'dist'
    let cameraStream = null;
    let capturedPhoto = null;
    let monthlyGoal = 10.0; // Default monthly goal in km
    let goalAchievedThisMonth = false;

    // --- Advanced Features State ---
    let map = null;
    let trackPath = [];
    let trackPolyline = null;
    let watchId = null;
    let isVoiceEnabled = true;
    let isGpsEnabled = true;
    let lastAnnouncedKm = 0;
    let totalGpsDistance = 0;

    // --- Voice Settings State ---
    let voicePitch = parseFloat(localStorage.getItem('running_voice_pitch')) || 1.0;
    let voiceRate = parseFloat(localStorage.getItem('running_voice_rate')) || 1.0;
    let selectedVoiceName = localStorage.getItem('running_voice_name') || null;
    let availableVoices = [];

    // --- DOM Elements ---
    const screens = {
        userSelect: document.getElementById('screen-user-select'),
        userRegister: document.getElementById('screen-user-register'),
        home: document.getElementById('screen-home'),
        stopwatch: document.getElementById('screen-stopwatch'),
        input: document.getElementById('screen-input'),
        praise: document.getElementById('screen-praise'),
        history: document.getElementById('screen-history'),
        ranking: document.getElementById('screen-ranking')
    };

    const inputs = {
        min: document.getElementById('input-min'),
        sec: document.getElementById('input-sec'),
        dist: document.getElementById('input-dist'),
        username: document.getElementById('input-username')
    };

    const header = document.getElementById('global-header');
    const headerUserName = document.getElementById('header-user-name');
    const headerUserIcon = document.getElementById('header-user-icon');
    const sideMenu = document.getElementById('side-menu');
    const menuOverlay = document.getElementById('menu-overlay');

    const userList = document.getElementById('user-list');
    const historyList = document.getElementById('history-list');
    const rankingList = document.getElementById('ranking-list');
    const stopwatchTime = document.getElementById('stopwatch-time');
    const growthCanvas = document.getElementById('growth-graph');

    // Camera Elements
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const photoResult = document.getElementById('photo-result');
    const cameraPreviewContainer = document.getElementById('camera-preview-container');
    const photoPreviewContainer = document.getElementById('photo-preview-container');
    const btnCameraOpen = document.getElementById('btn-camera-open');
    const btnCameraCapture = document.getElementById('btn-camera-capture');
    const btnCameraRetry = document.getElementById('btn-camera-retry');

    let selectedIcon = '🏃';
    let currentMin = 0;
    let currentSec = 0;
    let currentDist = 1.0;

    // --- Stopwatch State ---
    let timerInterval = null;
    let startTime = null;
    let elapsedSeconds = 0;

    // --- Initialization ---
    init();

    function init() {
        if (users.length === 0) {
            showScreen('userRegister');
        } else {
            renderUserList();
            showScreen('userSelect');
        }
        initGoalListeners();
        initAdvancedFeatures();
    }

    // --- Advanced Features (GPS & Voice) ---
    function initAdvancedFeatures() {
        // Voice switch
        const voiceSwitch = document.getElementById('switch-voice');
        voiceSwitch.addEventListener('change', (e) => {
            isVoiceEnabled = e.target.checked;
        });

        // GPS switch
        const gpsSwitch = document.getElementById('switch-gps');
        gpsSwitch.addEventListener('change', (e) => {
            isGpsEnabled = e.target.checked;
            const container = document.getElementById('tracking-map-container');
            if (isGpsEnabled) {
                container.classList.remove('hidden');
                initMap();
            } else {
                container.classList.add('hidden');
                stopTracking();
            }
        });

        // Voice settings modal
        const btnVoiceSettings = document.getElementById('btn-voice-settings');
        const voiceModal = document.getElementById('voice-modal');
        const selectVoice = document.getElementById('select-voice');
        const inputPitch = document.getElementById('input-pitch');
        const inputRate = document.getElementById('input-rate');
        const valPitch = document.getElementById('val-pitch');
        const valRate = document.getElementById('val-rate');

        btnVoiceSettings.addEventListener('click', () => {
            // Load voices
            availableVoices = window.speechSynthesis.getVoices();
            selectVoice.innerHTML = '<option value="">（デフォルト）</option>';
            availableVoices.filter(v => v.lang.startsWith('ja')).forEach(voice => {
                const opt = document.createElement('option');
                opt.value = voice.name;
                opt.textContent = `${voice.name} (${voice.lang})`;
                if (voice.name === selectedVoiceName) opt.selected = true;
                selectVoice.appendChild(opt);
            });

            // Set current vals
            inputPitch.value = voicePitch;
            inputRate.value = voiceRate;
            valPitch.textContent = voicePitch.toFixed(1);
            valRate.textContent = voiceRate.toFixed(1);

            voiceModal.classList.remove('hidden');
            setTimeout(() => voiceModal.classList.add('active'), 10);
        });

        inputPitch.addEventListener('input', (e) => {
            valPitch.textContent = parseFloat(e.target.value).toFixed(1);
        });

        inputRate.addEventListener('input', (e) => {
            valRate.textContent = parseFloat(e.target.value).toFixed(1);
        });

        document.getElementById('btn-test-voice').addEventListener('click', () => {
            const testPitch = parseFloat(inputPitch.value);
            const testRate = parseFloat(inputRate.value);
            const testVoiceName = selectVoice.value;

            const uttr = new SpeechSynthesisUtterance("ナイスラン！今日もいい感じですね。");
            uttr.lang = 'ja-JP';
            uttr.pitch = testPitch;
            uttr.rate = testRate;
            if (testVoiceName) {
                const voice = availableVoices.find(v => v.name === testVoiceName);
                if (voice) uttr.voice = voice;
            }
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(uttr);
        });

        document.getElementById('btn-save-voice').addEventListener('click', () => {
            voicePitch = parseFloat(inputPitch.value);
            voiceRate = parseFloat(inputRate.value);
            selectedVoiceName = selectVoice.value;

            localStorage.setItem('running_voice_pitch', voicePitch);
            localStorage.setItem('running_voice_rate', voiceRate);
            localStorage.setItem('running_voice_name', selectedVoiceName || '');

            closeVoiceModal();
        });

        document.getElementById('btn-cancel-voice').addEventListener('click', closeVoiceModal);

        function closeVoiceModal() {
            voiceModal.classList.remove('active');
            setTimeout(() => voiceModal.classList.add('hidden'), 300);
        }

        // Weather fetch button
        const fetchWeatherBtn = document.getElementById('btn-fetch-weather');
        if (fetchWeatherBtn) {
            fetchWeatherBtn.addEventListener('click', () => {
                if (!navigator.geolocation) return alert('GPSが利用できません');

                const msgEl = document.getElementById('weather-status-msg');
                msgEl.textContent = '取得中...';

                navigator.geolocation.getCurrentPosition(async (pos) => {
                    const { latitude, longitude } = pos.coords;
                    const result = await fetchWeather(latitude, longitude);
                    if (result) {
                        const tempEl = document.getElementById('input-temp');
                        if (tempEl) tempEl.value = result.temp;
                        const weatherId = mapWeatherCode(result.code);
                        const weatherRadio = document.getElementById(`w-${weatherId}`);
                        if (weatherRadio) weatherRadio.checked = true;
                        msgEl.textContent = '完了';
                        setTimeout(() => msgEl.textContent = '', 2000);
                    } else {
                        msgEl.textContent = '失敗';
                    }
                }, () => {
                    msgEl.textContent = '位置取得失敗';
                });
            });
        }
    }

    async function fetchWeather(lat, lon) {
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
            const response = await fetch(url);
            const data = await response.json();
            if (data && data.current_weather) {
                return {
                    temp: data.current_weather.temperature,
                    code: data.current_weather.weathercode
                };
            }
        } catch (e) {
            console.error('Weather fetch error:', e);
        }
        return null;
    }

    function mapWeatherCode(code) {
        if (code === 0) return 'sunny';
        if (code >= 1 && code <= 48) return 'cloudy';
        if (code >= 51 && code <= 67 || code >= 80 && code <= 99) return 'rainy';
        if (code >= 71 && code <= 77) return 'snowy';
        return 'sunny';
    }

    function initMap() {
        if (!isGpsEnabled) return;
        if (map) return; // Already initialized

        // Standard Leaflet initialization
        map = L.map('map').setView([35.6812, 139.7671], 15); // Default Tokyo
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);

        trackPolyline = L.polyline([], { color: '#3b82f6', weight: 6, opacity: 0.8 }).addTo(map);

        // Try to get current position to center map
        navigator.geolocation.getCurrentPosition((pos) => {
            const { latitude, longitude } = pos.coords;
            map.setView([latitude, longitude], 17);
        }, () => console.log('Current position not available for initial map view'));
    }

    function startTracking() {
        if (!isGpsEnabled || !navigator.geolocation) return;

        trackPath = [];
        totalGpsDistance = 0;
        lastAnnouncedKm = 0;
        if (trackPolyline) trackPolyline.setLatLngs([]);

        watchId = navigator.geolocation.watchPosition((pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            if (accuracy > 50) return; // Skip inaccurate position

            const newPoint = [latitude, longitude];

            if (trackPath.length > 0) {
                const lastPoint = trackPath[trackPath.length - 1];
                const dist = calculateDistance(lastPoint[0], lastPoint[1], latitude, longitude);
                totalGpsDistance += dist;
                currentDist = totalGpsDistance; // Update global distance
                updateInputDisplay();
                updateStopwatchDisplay(); // Update stopwatch screen distance

                // Voice announcement every 1km
                if (isVoiceEnabled && Math.floor(totalGpsDistance) > lastAnnouncedKm) {
                    lastAnnouncedKm = Math.floor(totalGpsDistance);
                    speak(`${lastAnnouncedKm}キロ通過。現在のタイムは${formatTime(elapsedSeconds)}です。`);
                }
            }

            trackPath.push(newPoint);
            if (trackPolyline) trackPolyline.setLatLngs(trackPath);
            if (map) map.panTo(newPoint);

        }, (err) => console.error('GPS tracking error:', err), {
            enableHighAccuracy: true,
            distanceFilter: 10
        });
    }

    function stopTracking() {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function speak(text) {
        if (!isVoiceEnabled || !window.speechSynthesis) return;
        const uttr = new SpeechSynthesisUtterance(text);
        uttr.lang = 'ja-JP';
        uttr.pitch = voicePitch;
        uttr.rate = voiceRate;

        if (selectedVoiceName) {
            const voices = window.speechSynthesis.getVoices();
            const voice = voices.find(v => v.name === selectedVoiceName);
            if (voice) uttr.voice = voice;
        }

        window.speechSynthesis.speak(uttr);
    }

    // --- Goal Feature ---
    function initGoalListeners() {
        document.getElementById('btn-edit-goal').addEventListener('click', openGoalModal);
        document.getElementById('btn-save-goal').addEventListener('click', saveGoal);
        document.getElementById('btn-cancel-goal').addEventListener('click', closeGoalModal);
        document.getElementById('btn-close-celebration').addEventListener('click', closeCelebration);

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('input-goal').value = btn.getAttribute('data-value');
            });
        });
    }

    function loadGoalData() {
        if (!currentUser) return;
        const goalData = JSON.parse(localStorage.getItem(`goal_${currentUser.id}`)) || {};
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format

        if (goalData.month === currentMonth) {
            monthlyGoal = goalData.target || 10.0;
            goalAchievedThisMonth = goalData.achieved || false;
        } else {
            // New month, reset goal achievement but keep goal value
            monthlyGoal = goalData.target || 10.0;
            goalAchievedThisMonth = false;
            saveGoalData();
        }
    }

    function saveGoalData() {
        if (!currentUser) return;
        const currentMonth = new Date().toISOString().slice(0, 7);
        const goalData = {
            target: monthlyGoal,
            month: currentMonth,
            achieved: goalAchievedThisMonth
        };
        localStorage.setItem(`goal_${currentUser.id}`, JSON.stringify(goalData));
    }

    function getMonthlyDistance() {
        if (!currentUser || records.length === 0) return 0;
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        return records.reduce((sum, r) => {
            const recordDate = new Date(r.date.replace(/\//g, '-'));
            if (recordDate.getMonth() === currentMonth && recordDate.getFullYear() === currentYear) {
                return sum + (r.distance || 0);
            }
            return sum;
        }, 0);
    }

    function updateGoalDisplay() {
        const currentDistance = getMonthlyDistance();
        const percentage = Math.min(100, (currentDistance / monthlyGoal) * 100);
        const isAchieved = currentDistance >= monthlyGoal;

        document.getElementById('goal-current').textContent = currentDistance.toFixed(1);
        document.getElementById('goal-target').textContent = monthlyGoal.toFixed(1);
        document.getElementById('goal-percentage').textContent = Math.round(percentage) + '%';

        const progressFill = document.getElementById('goal-progress-fill');
        progressFill.style.width = percentage + '%';

        const percentageEl = document.getElementById('goal-percentage');
        if (isAchieved) {
            progressFill.classList.add('achieved');
            percentageEl.classList.add('achieved');
        } else {
            progressFill.classList.remove('achieved');
            percentageEl.classList.remove('achieved');
        }
    }

    function checkGoalAchievement() {
        if (goalAchievedThisMonth) return; // Already celebrated this month

        const currentDistance = getMonthlyDistance();
        if (currentDistance >= monthlyGoal) {
            goalAchievedThisMonth = true;
            saveGoalData();
            showCelebration(currentDistance);
        }
    }

    function openGoalModal() {
        document.getElementById('input-goal').value = monthlyGoal;
        document.getElementById('goal-modal').classList.remove('hidden');
        document.getElementById('goal-modal').classList.add('active');
    }

    function closeGoalModal() {
        document.getElementById('goal-modal').classList.remove('active');
        setTimeout(() => {
            document.getElementById('goal-modal').classList.add('hidden');
        }, 300);
    }

    function saveGoal() {
        const inputValue = parseFloat(document.getElementById('input-goal').value);
        if (isNaN(inputValue) || inputValue <= 0) {
            alert('有効な目標値を入力してください');
            return;
        }
        monthlyGoal = inputValue;
        saveGoalData();
        updateGoalDisplay();
        closeGoalModal();
    }

    function showCelebration(distance) {
        document.getElementById('celebration-goal').textContent = monthlyGoal.toFixed(1) + 'km';
        document.getElementById('celebration-distance').textContent = distance.toFixed(1);

        const modal = document.getElementById('celebration-modal');
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('active'), 10);

        // Create confetti
        createConfetti();
    }

    function closeCelebration() {
        const modal = document.getElementById('celebration-modal');
        modal.classList.remove('active');
        setTimeout(() => {
            modal.classList.add('hidden');
            // Clear confetti
            document.getElementById('confetti-container').innerHTML = '';
        }, 300);
    }

    function createConfetti() {
        const container = document.getElementById('confetti-container');
        container.innerHTML = '';

        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.animationDelay = Math.random() * 2 + 's';
            confetti.style.animationDuration = (2 + Math.random() * 2) + 's';
            container.appendChild(confetti);
        }
    }

    // --- Navigation ---
    function showScreen(screenId) {
        Object.values(screens).forEach(screen => screen.classList.remove('active'));
        if (screens[screenId]) {
            screens[screenId].classList.add('active');
        }

        // Stop camera if leaving register screen
        if (screenId !== 'userRegister') {
            stopCamera();
        }

        // Global Header visibility
        if (screenId === 'userSelect' || screenId === 'userRegister') {
            header.classList.add('hidden');
        } else {
            header.classList.remove('hidden');
            updateHeader();
        }

        if (screenId === 'history') renderHistory();
        if (screenId === 'ranking') renderRanking();
        if (screenId === 'input') updateInputDisplay();
        if (screenId === 'home') {
            updateHomeDisplay();
            drawGraph();
        }
        if (screenId === 'stopwatch') {
            resetStopwatch();
            setTimeout(initMap, 100); // Wait for screen animation
        }
        if (screenId === 'userSelect') updateHomeButtonVisibility();
        if (screenId === 'userRegister') updateHomeButtonVisibility();
    }

    function updateHomeButtonVisibility() {
        const btnSelectHome = document.getElementById('btn-select-home');
        const btnCancelRegister = document.getElementById('btn-cancel-register');

        if (currentUser) {
            if (btnSelectHome) btnSelectHome.classList.remove('hidden');
            if (btnCancelRegister) btnCancelRegister.textContent = '🏠 ホームに戻る';
        } else {
            if (btnSelectHome) btnSelectHome.classList.add('hidden');
            if (btnCancelRegister) btnCancelRegister.textContent = 'キャンセル';
        }
    }

    // --- Icon Display Helper ---
    function getIconHTML(iconData) {
        if (iconData && iconData.startsWith('data:image')) {
            return `<img src="${iconData}" alt="user icon">`;
        }
        return iconData || '🏃';
    }

    // --- User Management ---
    function renderUserList() {
        userList.innerHTML = '';
        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'user-card';
            card.innerHTML = `
                <button class="btn-user-delete" data-id="${user.id}">×</button>
                <div class="user-icon">${getIconHTML(user.icon)}</div>
                <div class="user-name">${user.name}</div>
            `;

            // Delete button handling
            card.querySelector('.btn-user-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteUser(user.id, user.name);
            });

            card.addEventListener('click', () => selectUser(user));
            userList.appendChild(card);
        });
    }

    function deleteUser(id, name) {
        if (!confirm(`ユーザー「${name}」と、このユーザーの全ての記録を削除しますか？\nこの操作は元に戻せません。`)) return;

        users = users.filter(u => u.id !== id);
        localStorage.setItem('running_users', JSON.stringify(users));
        localStorage.removeItem(`records_${id}`);

        if (users.length === 0) {
            showScreen('userRegister');
        } else {
            renderUserList();
            showScreen('userSelect');
        }
    }

    function selectUser(user) {
        currentUser = user;
        records = JSON.parse(localStorage.getItem(`records_${user.id}`)) || [];
        loadGoalData();
        showScreen('home');
    }

    function registerUser() {
        const name = inputs.username.value.trim();
        if (!name) return alert('名前を入力してください');

        const newUser = {
            id: Date.now(),
            name: name,
            icon: capturedPhoto || selectedIcon
        };

        users.push(newUser);
        localStorage.setItem('running_users', JSON.stringify(users));

        inputs.username.value = '';
        capturedPhoto = null;
        resetRegistrationUI();
        renderUserList();
        selectUser(newUser);
    }

    function updateHeader() {
        if (!currentUser) return;
        headerUserName.textContent = currentUser.name;
        headerUserIcon.innerHTML = getIconHTML(currentUser.icon);
    }

    function openMenu() {
        sideMenu.classList.add('open');
        menuOverlay.classList.add('active');
    }

    function closeMenu() {
        sideMenu.classList.remove('open');
        menuOverlay.classList.remove('active');
    }

    // --- Camera Logic ---
    async function startCamera() {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 400, height: 400 },
                audio: false
            });
            video.srcObject = cameraStream;
            cameraPreviewContainer.classList.remove('hidden');
            photoPreviewContainer.classList.add('hidden');
            btnCameraOpen.classList.add('hidden');
            btnCameraCapture.classList.remove('hidden');
            btnCameraRetry.classList.add('hidden');
        } catch (err) {
            console.error('Camera error:', err);
            alert('カメラの起動に失敗しました。設定を確認してください。');
        }
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
    }

    function capturePhoto() {
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        capturedPhoto = canvas.toDataURL('image/png');
        photoResult.src = capturedPhoto;

        cameraPreviewContainer.classList.add('hidden');
        photoPreviewContainer.classList.remove('hidden');
        btnCameraCapture.classList.add('hidden');
        btnCameraRetry.classList.remove('hidden');

        stopCamera();
    }

    function resetRegistrationUI() {
        cameraPreviewContainer.classList.add('hidden');
        photoPreviewContainer.classList.add('hidden');
        btnCameraOpen.classList.remove('hidden');
        btnCameraCapture.classList.add('hidden');
        btnCameraRetry.classList.add('hidden');
        capturedPhoto = null;
        stopCamera();
    }

    // --- Display & Stats Logic ---
    function updateHomeDisplay() {
        if (!currentUser) return;
        // User info is now shown in the global header via updateHeader()
        document.getElementById('home-character').innerHTML = getIconHTML(currentUser.icon);

        let grandTotalDist = 0;
        users.forEach(u => {
            const uRecs = JSON.parse(localStorage.getItem(`records_${u.id}`)) || [];
            grandTotalDist += uRecs.reduce((acc, r) => acc + (r.distance || 0), 0);
        });
        document.getElementById('team-total-dist').textContent = `${grandTotalDist.toFixed(1)}km`;

        // Update goal display
        updateGoalDisplay();

        if (records.length > 0) {
            const sumTime = records.reduce((acc, r) => acc + r.totalSeconds, 0);
            const sumDist = records.reduce((acc, r) => acc + (r.distance || 0), 0);
            const avg = Math.floor(sumTime / records.length);
            const best = Math.min(...records.map(r => r.totalSeconds));

            document.getElementById('stat-total-dist').textContent = `${sumDist.toFixed(1)}km`;
            document.getElementById('stat-avg-time').textContent = formatTime(avg);
            document.getElementById('stat-best-time').textContent = formatTime(best);

            const rankingData = users.map(user => {
                const userRecords = JSON.parse(localStorage.getItem(`records_${user.id}`)) || [];
                const bTime = userRecords.length > 0 ? Math.min(...userRecords.map(r => r.totalSeconds)) : Infinity;
                return { id: user.id, bestTime: bTime };
            })
                .filter(u => u.bestTime !== Infinity)
                .sort((a, b) => a.bestTime - b.bestTime);

            const rank = rankingData.findIndex(u => u.id === currentUser.id) + 1;
            document.getElementById('stat-current-rank').textContent = rank > 0 ? `${rank}位` : '--位';
        } else {
            document.getElementById('stat-total-dist').textContent = '0.0km';
            document.getElementById('stat-avg-time').textContent = '--:--';
            document.getElementById('stat-best-time').textContent = '--:--';
            document.getElementById('stat-current-rank').textContent = '--位';
        }
    }

    function formatTime(totalSeconds) {
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        const sInt = Math.floor(s);
        const ms = Math.floor((s - sInt) * 100);
        return `${m.toString().padStart(2, '0')}:${sInt.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    function formatPace(totalSeconds, distance) {
        if (!distance || distance === 0) return "--:--";
        const totalPaceSeconds = Math.floor(totalSeconds / distance);
        const m = Math.floor(totalPaceSeconds / 60);
        const s = totalPaceSeconds % 60;
        return `${m}'${s.toString().padStart(2, '0')}"`;
    }

    function drawGraph() {
        const ctx = growthCanvas.getContext('2d');
        const width = growthCanvas.width;
        const height = growthCanvas.height;
        ctx.clearRect(0, 0, width, height);

        if (records.length < 2) {
            ctx.fillStyle = '#64748b';
            ctx.font = '13px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('記録を増やすとグラフが表示されます', width / 2, height / 2);
            return;
        }

        const recent = [...records].slice(0, 7).reverse();
        const maxTime = Math.max(...recent.map(r => r.totalSeconds));
        const minTime = Math.min(...recent.map(r => r.totalSeconds));

        // Padding for labels and titles
        const padding = { top: 35, bottom: 35, left: 40, right: 15 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const barWidth = Math.min(30, (chartWidth / recent.length) - 10);
        const gap = (chartWidth - barWidth * recent.length) / (recent.length + 1);

        // --- Draw Header ---
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('直近7回のタイム推移', width / 2, 18);

        // --- Draw Y-Axis labels (Time in minutes) ---
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('(分)', padding.left - 5, padding.top - 10);

        const yTicks = 3;
        for (let i = 0; i <= yTicks; i++) {
            const ratio = i / yTicks;
            const y = height - padding.bottom - ratio * chartHeight;
            const valSeconds = minTime * 0.8 + ratio * (maxTime - minTime * 0.8 + 1);
            const valMinutes = (valSeconds / 60).toFixed(1);

            ctx.fillText(valMinutes, padding.left - 5, y + 4);

            // Draw grid line
            ctx.beginPath();
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
        }

        recent.forEach((r, i) => {
            const normalizedHeight = ((r.totalSeconds - minTime * 0.8) / (maxTime - minTime * 0.8 + 1)) * chartHeight;
            const barHeight = Math.max(normalizedHeight, 10);
            const x = padding.left + gap + i * (barWidth + gap);
            const y = height - padding.bottom - barHeight;
            const radius = 6;

            // Bar gradient
            const gradient = ctx.createLinearGradient(x, y, x, height - padding.bottom);
            if (r.isBest) {
                gradient.addColorStop(0, '#fbbf24');
                gradient.addColorStop(1, '#d97706');
            } else {
                gradient.addColorStop(0, '#60a5fa');
                gradient.addColorStop(1, '#2563eb');
            }

            // Shadow
            ctx.shadowColor = r.isBest ? 'rgba(251, 191, 36, 0.4)' : 'rgba(59, 130, 246, 0.3)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 4;

            // Draw rounded bar
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + barWidth - radius, y);
            ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
            ctx.lineTo(x + barWidth, height - padding.bottom);
            ctx.lineTo(x, height - padding.bottom);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();

            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            // --- Value Label above bar ---
            ctx.fillStyle = r.isBest ? '#fbbf24' : '#fff';
            ctx.font = 'bold 9px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(formatTime(r.totalSeconds), x + barWidth / 2, y - 6);

            // --- Date label (MM/DD) ---
            ctx.fillStyle = '#64748b';
            ctx.font = '9px Inter, sans-serif';
            ctx.textAlign = 'center';

            // Extract MM/DD from date string (ja-JP: YYYY/MM/DD)
            let dateLabel = '';
            if (r.date) {
                const parts = r.date.split('/');
                if (parts.length >= 3) {
                    dateLabel = `${parts[1]}/${parts[2]}`;
                } else {
                    dateLabel = r.date;
                }
            }

            ctx.fillText(dateLabel, x + barWidth / 2, height - 12);
        });
    }


    function renderRanking() {
        rankingList.innerHTML = '';
        let rankingData = users.map(user => {
            const uRecs = JSON.parse(localStorage.getItem(`records_${user.id}`)) || [];
            if (currentRankMode === 'time') {
                const bTime = uRecs.length > 0 ? Math.min(...uRecs.map(r => r.totalSeconds)) : Infinity;
                return { ...user, val: bTime, valStr: formatTime(bTime) };
            } else {
                const tDist = uRecs.reduce((acc, r) => acc + (r.distance || 0), 0);
                return { ...user, val: tDist, valStr: `${tDist.toFixed(1)}km` };
            }
        });

        if (currentRankMode === 'time') {
            rankingData = rankingData.filter(u => u.val !== Infinity).sort((a, b) => a.val - b.val);
        } else {
            rankingData = rankingData.filter(u => u.val > 0).sort((a, b) => b.val - a.val);
        }

        if (rankingData.length === 0) {
            rankingList.innerHTML = '<div class="ranking-empty">データがありません。</div>';
            return;
        }

        rankingData.forEach((u, index) => {
            const item = document.createElement('div');
            item.className = `ranking-item rank-${index + 1}`;
            item.innerHTML = `
                <div class="ranking-rank">${index + 1}</div>
                <div class="ranking-user-info">
                    <span class="ranking-icon">${getIconHTML(u.icon)}</span>
                    <span class="ranking-name">${u.name}</span>
                </div>
                <div class="ranking-time">${u.valStr}</div>
            `;
            rankingList.appendChild(item);
        });
    }

    // --- Record Logic ---
    function saveRecord() {
        if (!currentUser) return;
        const totalSeconds = (currentMin * 60) + currentSec;
        if (totalSeconds === 0) return;
        if (currentDist <= 0) return alert('距離を入力してください');

        const isBest = records.length === 0 || totalSeconds < Math.min(...records.map(r => r.totalSeconds));
        const diffMsg = getDiffMessage(totalSeconds);

        // Get weather/temp from UI
        const weatherEl = document.querySelector('input[name="weather"]:checked');
        const weather = weatherEl ? weatherEl.value : 'sunny';
        const tempEl = document.getElementById('input-temp');
        const temp = tempEl && tempEl.value !== '' ? parseFloat(tempEl.value) : null;

        const newRecord = {
            id: Date.now(),
            date: new Date().toLocaleDateString('ja-JP'),
            min: currentMin, sec: currentSec,
            totalSeconds: totalSeconds,
            distance: currentDist,
            pace: formatPace(totalSeconds, currentDist),
            weather: weather,
            temp: temp,
            isBest: isBest,
            route: trackPath.length > 0 ? [...trackPath] : null
        };

        records.unshift(newRecord);
        localStorage.setItem(`records_${currentUser.id}`, JSON.stringify(records));

        // Check goal achievement after saving
        setTimeout(() => checkGoalAchievement(), 500);

        showPraise(newRecord, diffMsg);
    }

    function getDiffMessage(totalSeconds) {
        if (records.length === 0) return "";
        const prev = records[0].totalSeconds;
        const diff = prev - totalSeconds;
        if (diff > 0) return `前回より ${diff}秒 短縮！`;
        if (diff < 0) return `前回より ${Math.abs(diff)}秒 ダウン`;
        return "前回と同じタイムです";
    }

    function showPraise(record, diffMsg) {
        document.getElementById('praise-time-val').textContent = formatTime(record.totalSeconds);
        const pace = formatPace(record.totalSeconds, record.distance);
        document.getElementById('diff-message').innerHTML = `${diffMsg}<br>ペース: ${pace}/km`;
        document.getElementById('praise-character').innerHTML = getIconHTML(currentUser.icon);

        const badge = document.getElementById('new-record-badge');
        const title = document.getElementById('praise-title');
        if (record.isBest) {
            badge.style.display = 'inline-block'; title.textContent = '自己ベスト更新！'; title.style.color = '#eab308';
        } else {
            badge.style.display = 'none'; title.textContent = 'ナイスラン！'; title.style.color = 'inherit';
        }
        showScreen('praise');
    }

    function renderHistory() {
        historyList.innerHTML = '';
        if (records.length === 0) {
            historyList.innerHTML = '<p style="text-align:center; padding: 20px;">記録がありません</p>';
            return;
        }

        records.forEach(r => {
            const item = document.createElement('div');
            item.className = 'history-item';
            const bestMark = r.isBest ? '<span class="best-star">★</span>' : '';
            const d = r.distance ? `${r.distance.toFixed(1)}km` : '-.-km';
            const p = formatPace(r.totalSeconds, r.distance);

            // Weather icon and temp string
            const weatherIconMap = { sunny: '☀️', cloudy: '☁️', rainy: '⛆', snowy: '❄️' };
            const weatherIcon = r.weather ? weatherIconMap[r.weather] : '';
            const tempStr = (r.temp !== null && r.temp !== undefined) ? `${r.temp}℃` : '';

            // Route button if route exists
            const routeBtn = (r.route && r.route.length > 1) ? `<button class="btn-route-view" data-id="${r.id}">🗺️ ルート</button>` : '';

            item.innerHTML = `
                <div class="history-info" style="flex:1">
                    <div class="history-date">${r.date}</div>
                    <div style="font-size:0.8rem; color:var(--color-text-dim)">
                        ${d} | ペース: ${p}/km
                    </div>
                    ${(weatherIcon || tempStr) ? `<div class="history-weather" style="font-size:0.85rem; color:var(--color-primary); margin-top:4px;">${weatherIcon} ${tempStr}</div>` : ''}
                </div>
                <div class="history-time">${bestMark}${formatTime(r.totalSeconds)}</div>
                ${routeBtn}
                <button class="btn-history-delete" data-id="${r.id}">🗑️</button>
            `;

            item.querySelector('.btn-history-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteRecord(r.id);
            });

            // Route view button handler
            const routeBtnEl = item.querySelector('.btn-route-view');
            if (routeBtnEl) {
                routeBtnEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showRouteMap(r);
                });
            }

            historyList.appendChild(item);
        });
    }

    // Route Map Modal
    let routeMap = null;
    let routePolyline = null;

    function showRouteMap(record) {
        if (!record.route || record.route.length < 2) return;

        const modal = document.getElementById('route-modal');
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('active'), 10);

        // Update info
        document.getElementById('route-date').textContent = record.date;
        document.getElementById('route-distance').textContent = record.distance ? `${record.distance.toFixed(1)} km` : '';

        // Initialize or reset map
        setTimeout(() => {
            if (routeMap) {
                routeMap.remove();
                routeMap = null;
            }

            routeMap = L.map('route-map').setView(record.route[0], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(routeMap);

            // Draw route
            routePolyline = L.polyline(record.route, {
                color: '#3b82f6',
                weight: 5,
                opacity: 0.9
            }).addTo(routeMap);

            // Add start/end markers
            L.marker(record.route[0]).addTo(routeMap).bindPopup('スタート');
            L.marker(record.route[record.route.length - 1]).addTo(routeMap).bindPopup('ゴール');

            // Fit bounds
            routeMap.fitBounds(routePolyline.getBounds(), { padding: [30, 30] });
        }, 100);
    }

    function closeRouteMap() {
        const modal = document.getElementById('route-modal');
        modal.classList.remove('active');
        setTimeout(() => {
            modal.classList.add('hidden');
            if (routeMap) {
                routeMap.remove();
                routeMap = null;
            }
        }, 300);
    }

    // Route modal close button
    document.getElementById('btn-close-route').addEventListener('click', closeRouteMap);


    function deleteRecord(recordId) {
        if (!confirm('この記録を削除しますか？')) return;
        records = records.filter(r => r.id !== recordId);

        // Update isBest flags for remaining records
        if (records.length > 0) {
            const minTime = Math.min(...records.map(r => r.totalSeconds));
            records.forEach(r => r.isBest = (r.totalSeconds === minTime));
        }

        localStorage.setItem(`records_${currentUser.id}`, JSON.stringify(records));
        renderHistory();
    }

    function resetStopwatch() {
        stopStopwatch(); elapsedSeconds = 0;
        currentDist = 0; // Reset distance for new run
        updateStopwatchDisplay();
        const toggleBtn = document.getElementById('btn-stopwatch-toggle');
        toggleBtn.textContent = 'スタート'; toggleBtn.className = 'btn success';
        document.getElementById('btn-stopwatch-done').style.display = 'none';
    }

    function toggleStopwatch() {
        const toggleBtn = document.getElementById('btn-stopwatch-toggle');
        const doneBtn = document.getElementById('btn-stopwatch-done');
        if (timerInterval) {
            stopStopwatch(); stopTracking(); toggleBtn.textContent = '再開'; toggleBtn.className = 'btn success'; doneBtn.style.display = 'block';
            speak('ストップ');
        } else {
            startStopwatch(); startTracking(); toggleBtn.textContent = 'ストップ'; toggleBtn.className = 'btn danger'; doneBtn.style.display = 'none';
            speak('スタート');
        }
    }

    function startStopwatch() {
        startTime = Date.now() - (elapsedSeconds * 1000);
        timerInterval = setInterval(() => {
            elapsedSeconds = (Date.now() - startTime) / 1000; updateStopwatchDisplay();
        }, 10);
    }

    function stopStopwatch() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }
    function updateStopwatchDisplay() {
        stopwatchTime.textContent = formatTime(elapsedSeconds);
        const distEl = document.getElementById('stopwatch-dist');
        if (distEl) distEl.textContent = `${currentDist.toFixed(1)} km`;
    }
    function finishStopwatch() { stopStopwatch(); currentMin = Math.floor(elapsedSeconds / 60); currentSec = elapsedSeconds % 60; showScreen('input'); }
    function updateInputDisplay() { inputs.min.value = currentMin; inputs.sec.value = currentSec; inputs.dist.value = currentDist.toFixed(1); }

    // --- Event Listeners ---
    document.getElementById('btn-to-stopwatch').addEventListener('click', () => showScreen('stopwatch'));
    document.getElementById('btn-to-history').addEventListener('click', () => showScreen('history'));
    document.getElementById('btn-to-ranking').addEventListener('click', () => showScreen('ranking'));
    document.getElementById('btn-praise-home').addEventListener('click', () => showScreen('home'));
    document.getElementById('btn-history-home').addEventListener('click', () => showScreen('home'));
    document.getElementById('btn-ranking-home').addEventListener('click', () => showScreen('home'));
    document.getElementById('btn-cancel').addEventListener('click', () => showScreen('home'));
    document.getElementById('btn-to-manual').addEventListener('click', () => {
        currentMin = 0; currentSec = 0; if (records.length > 0) { currentMin = records[0].min; currentSec = records[0].sec; }
        showScreen('input');
    });

    document.getElementById('btn-stopwatch-toggle').addEventListener('click', toggleStopwatch);
    document.getElementById('btn-stopwatch-done').addEventListener('click', finishStopwatch);
    document.getElementById('btn-stopwatch-cancel').addEventListener('click', () => showScreen('home'));
    document.getElementById('btn-show-register').addEventListener('click', () => { resetRegistrationUI(); showScreen('userRegister'); });
    document.getElementById('btn-cancel-register').addEventListener('click', () => { if (users.length > 0) showScreen('userSelect'); });
    document.getElementById('btn-register-user').addEventListener('click', registerUser);

    document.getElementById('btn-select-home').addEventListener('click', () => showScreen('home'));

    // Camera Events
    btnCameraOpen.addEventListener('click', startCamera);
    btnCameraCapture.addEventListener('click', capturePhoto);
    btnCameraRetry.addEventListener('click', startCamera);

    // Ranking tabs
    document.getElementById('tab-rank-time').addEventListener('click', () => {
        currentRankMode = 'time';
        document.getElementById('tab-rank-time').classList.add('active');
        document.getElementById('tab-rank-dist').classList.remove('active');
        renderRanking();
    });
    document.getElementById('tab-rank-dist').addEventListener('click', () => {
        currentRankMode = 'dist';
        document.getElementById('tab-rank-dist').classList.add('active');
        document.getElementById('tab-rank-time').classList.remove('active');
        renderRanking();
    });

    document.querySelectorAll('.icon-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.icon-opt').forEach(el => el.classList.remove('selected'));
            opt.classList.add('selected');
            selectedIcon = opt.getAttribute('data-icon');
            capturedPhoto = null; // Clear photo if emoji selected
            photoPreviewContainer.classList.add('hidden');
            btnCameraOpen.classList.remove('hidden');
        });
    });

    document.getElementById('btn-save').addEventListener('click', saveRecord);

    document.querySelectorAll('.btn-plus').forEach(btn => {
        btn.addEventListener('click', () => {
            const t = btn.getAttribute('data-type');
            if (t === 'min') currentMin++; else if (t === 'sec') { currentSec++; if (currentSec >= 60) { currentSec = 0; currentMin++; } }
            else if (t === 'dist') currentDist += 0.1;
            updateInputDisplay();
        });
    });

    document.querySelectorAll('.btn-minus').forEach(btn => {
        btn.addEventListener('click', () => {
            const t = btn.getAttribute('data-type');
            if (t === 'min') { if (currentMin > 0) currentMin--; }
            else if (t === 'sec') { if (currentSec > 0) currentSec--; else if (currentMin > 0) { currentSec = 59; currentMin--; } }
            else if (t === 'dist') { if (currentDist > 0.1) currentDist -= 0.1; }
            updateInputDisplay();
        });
    });

    // --- Menu Listeners ---
    document.getElementById('btn-menu-open').addEventListener('click', openMenu);
    document.getElementById('btn-menu-close').addEventListener('click', closeMenu);
    menuOverlay.addEventListener('click', closeMenu);

    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.getAttribute('data-action');
            closeMenu();

            if (action === 'home') showScreen('home');
            else if (action === 'history') showScreen('history');
            else if (action === 'ranking') showScreen('ranking');
            else if (action === 'selectUser') showScreen('userSelect');
            else if (action === 'registerUser') {
                resetRegistrationUI();
                showScreen('userRegister');
            }
        });
    });
});
