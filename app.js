// ========================================
// FIREBASE CONFIGURATION
// ========================================
const firebaseConfig = {
  apiKey: "AIzaSyAtxGy1OathV74xTUwulJcFxelfZCtXqq8",
  authDomain: "vpl-scoreboard.firebaseapp.com",
  projectId: "vpl-scoreboard",
  storageBucket: "vpl-scoreboard.firebasestorage.app",
  messagingSenderId: "906901715138",
  appId: "1:906901715138:web:f4ebbde389226fc61b235b",
  measurementId: "G-50C5TG99E6"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ========================================
// GLOBAL VARIABLES
// ========================================
let currentUser = null;
let isAdmin = false;
let currentMatchId = null;
let currentScoringMatch = null;
let lastBalls = [];

// OPTIMIZATION 1: onSnapshot listener references (replaces refreshTimer)
let liveMatchesListener = null;
let currentMatchListener = null;
let commentaryLoaded = false;

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('Cricket Tournament App Initialized');

    auth.onAuthStateChanged(function(user) {
        if (user) {
            currentUser = user;
            isAdmin = true;
            showAdminUI();
            stopLiveListeners();   // admin doesn't need public listeners
            loadAllData();
        } else {
            currentUser = null;
            isAdmin = false;
            hideAdminUI();
            startLiveListeners();  // public viewers use real-time listeners
        }
    });

    setupEventListeners();
});

// ========================================
// EVENT LISTENERS SETUP
// ========================================
function setupEventListeners() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });
    });

    const mobileToggle = document.getElementById('mobileMenuToggle');
    if (mobileToggle) {
        mobileToggle.addEventListener('click', toggleMobileMenu);
    }

    document.getElementById('loginBtn').addEventListener('click', openLoginModal);
    document.getElementById('logoutBtn').addEventListener('click', logout);

    const closeModalBtn = document.querySelector('.close-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeLoginModal);
    }

    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('addTeamForm').addEventListener('submit', handleAddTeam);
    document.getElementById('addPlayerForm').addEventListener('submit', handleAddPlayer);
    document.getElementById('addMatchForm').addEventListener('submit', handleAddMatch);

    document.getElementById('scoringMatchSelect').addEventListener('change', handleScoringMatchSelect);
    document.getElementById('confirmTossBtn').addEventListener('click', confirmToss);
    document.getElementById('startInningsBtn').addEventListener('click', startInnings);
    document.getElementById('endInningsBtn').addEventListener('click', endInnings);
    document.getElementById('endMatchBtn').addEventListener('click', endMatch);
    document.getElementById('confirmBatsmenBtn').addEventListener('click', confirmBatsmen);
    document.getElementById('confirmBowlerBtn').addEventListener('click', confirmBowler);
    document.getElementById('strikeChangeBtn').addEventListener('click', changeStrike);
    document.getElementById('changeBowlerBtn').addEventListener('click', showChangeBowler);
    document.getElementById('wicketBtn').addEventListener('click', showWicketModal);
    document.getElementById('cancelWicketBtn').addEventListener('click', closeWicketModal);
    document.getElementById('wicketForm').addEventListener('submit', handleWicket);
    document.getElementById('undoBtn').addEventListener('click', undoLastBall);

    // OPTIMIZATION 3: Lazy commentary toggle button
    document.getElementById('loadCommentaryBtn').addEventListener('click', function() {
        toggleCommentary();
    });

    document.querySelectorAll('.run-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const runs = parseInt(this.getAttribute('data-runs'));
            recordBall(runs, false, null);
        });
    });

    document.querySelectorAll('.extra-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const extraType = this.getAttribute('data-extra');
            handleExtra(extraType);
        });
    });

    window.addEventListener('click', function(e) {
        const loginModal = document.getElementById('loginModal');
        const wicketModal = document.getElementById('wicketModal');
        if (e.target === loginModal) closeLoginModal();
        if (e.target === wicketModal) closeWicketModal();
    });
}

// ========================================
// UI UTILITIES
// ========================================
function toggleMobileMenu() {
    const nav = document.getElementById('mainNav');
    const toggle = document.getElementById('mobileMenuToggle');
    nav.classList.toggle('mobile-open');
    toggle.classList.toggle('active');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    const selectedTab = document.getElementById(tabName + 'Tab');
    if (selectedTab) selectedTab.classList.add('active');

    const selectedBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (selectedBtn) selectedBtn.classList.add('active');

    document.getElementById('mainNav').classList.remove('mobile-open');
    document.getElementById('mobileMenuToggle').classList.remove('active');

    // Detach match detail listener when leaving live tab
    if (tabName !== 'live' && currentMatchListener) {
        currentMatchListener();
        currentMatchListener = null;
        currentMatchId = null;
    }

    if (tabName === 'live') loadLiveMatchesOnce();
    else if (tabName === 'points') loadPointsTable();
    else if (tabName === 'stats') loadStats();
    else if (tabName === 'previous') loadPreviousMatches();
    else if (tabName === 'teams') loadTeamsManagement();
    else if (tabName === 'matches') loadMatchesManagement();
    else if (tabName === 'scoring') loadScoringInterface();
    else if (tabName === 'viewteams') loadPublicTeams();
}

function showAdminUI() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    if (loginBtn) loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');

    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));

    const indicator = document.getElementById('refreshIndicator');
    if (indicator) indicator.classList.add('hidden');
}

function hideAdminUI() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');

    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));

    // Show live indicator instead of refresh timer
    const indicator = document.getElementById('refreshIndicator');
    if (indicator) {
        indicator.innerHTML = '🟢 Live';
        indicator.classList.remove('hidden');
    }
}

function openLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
}

function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    const form = document.getElementById('loginForm');
    const msg = document.getElementById('loginMessage');
    modal.classList.add('hidden');
    if (form) form.reset();
    if (msg) msg.textContent = '';
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const messageEl = document.getElementById('loginMessage');

    try {
        await auth.signInWithEmailAndPassword(email, password);
        messageEl.style.color = 'green';
        messageEl.textContent = 'Login successful!';
        setTimeout(closeLoginModal, 1000);
    } catch (error) {
        messageEl.style.color = 'red';
        messageEl.textContent = 'Login failed: ' + error.message;
    }
}

async function logout() {
    try {
        stopLiveListeners();
        await auth.signOut();
        switchTab('live');
        startLiveListeners();
        alert('Logged out successfully.');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ========================================
// OPTIMIZATION 1: REAL-TIME LISTENERS
// (replaces the old auto-refresh timer)
// ========================================
function startLiveListeners() {
    attachLiveMatchesListener();
}

function stopLiveListeners() {
    if (liveMatchesListener) {
        liveMatchesListener();   // calling the returned function unsubscribes it
        liveMatchesListener = null;
    }
    if (currentMatchListener) {
        currentMatchListener();
        currentMatchListener = null;
    }
}

function attachLiveMatchesListener() {
    // Detach any existing listener first
    if (liveMatchesListener) {
        liveMatchesListener();
        liveMatchesListener = null;
    }

    liveMatchesListener = db.collection('matches')
        .where('status', 'in', ['live', 'upcoming'])
        .onSnapshot(snapshot => {
            renderLiveMatchesList(snapshot);
        }, error => {
            console.error('Live matches listener error:', error);
        });
}

// ========================================
// LOAD FUNCTIONS
// ========================================
function loadPublicData() {
    loadLiveMatchesOnce();
    loadPointsTable();
}

function loadAllData() {
    loadLiveMatchesOnce();
    loadPointsTable();
    if (isAdmin) {
        loadTeamsManagement();
        loadMatchesManagement();
        loadScoringInterface();
    }
}

// Admin uses a one-time fetch; public users use the onSnapshot listener
async function loadLiveMatchesOnce() {
    if (!isAdmin) {
        // Public: listener is already attached, just re-render if snapshot exists
        attachLiveMatchesListener();
        return;
    }
    // Admin: simple one-time fetch
    try {
        const snapshot = await db.collection('matches')
            .where('status', 'in', ['live', 'upcoming'])
            .get();
        renderLiveMatchesList(snapshot);
    } catch (error) {
        console.error('Error loading live matches:', error);
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================
function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function calculateStrikeRate(runs, balls) {
    if (balls === 0) return '0.00';
    return ((runs / balls) * 100).toFixed(2);
}

function calculateEconomy(runs, balls) {
    if (balls === 0) return '0.00';
    return (runs / (balls / 6)).toFixed(2);
}

function formatOvers(balls) {
    const completeOvers = Math.floor(balls / 6);
    const remainingBalls = balls % 6;
    return `${completeOvers}.${remainingBalls}`;
}

function showMessage(message) {
    alert(message);
}

// ========================================
// TEAM MANAGEMENT
// ========================================
async function handleAddTeam(e) {
    e.preventDefault();
    const teamName = document.getElementById('teamName').value;
    const teamShortName = document.getElementById('teamShortName').value.toUpperCase();

    try {
        await db.collection('teams').add({
            name: teamName,
            shortName: teamShortName,
            players: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showMessage('Team added successfully!');
        document.getElementById('addTeamForm').reset();
        loadTeamsManagement();
    } catch (error) {
        showMessage('Error adding team: ' + error.message);
    }
}

async function handleAddPlayer(e) {
    e.preventDefault();
    const teamId = document.getElementById('playerTeamSelect').value;
    const playerName = document.getElementById('playerName').value;
    const playerRole = document.getElementById('playerRole').value;

    try {
        await db.collection('teams').doc(teamId).update({
            players: firebase.firestore.FieldValue.arrayUnion({
                name: playerName,
                role: playerRole,
                id: Date.now().toString()
            })
        });
        showMessage('Player added successfully!');
        document.getElementById('addPlayerForm').reset();
        loadTeamsManagement();
    } catch (error) {
        showMessage('Error adding player: ' + error.message);
    }
}

async function loadTeamsManagement() {
    try {
        const teamsSnapshot = await db.collection('teams').orderBy('name').get();

        const playerTeamSelect = document.getElementById('playerTeamSelect');
        const matchTeam1Select = document.getElementById('matchTeam1');
        const matchTeam2Select = document.getElementById('matchTeam2');

        playerTeamSelect.innerHTML = '<option value="">-- Select Team --</option>';
        matchTeam1Select.innerHTML = '<option value="">-- Select Team 1 --</option>';
        matchTeam2Select.innerHTML = '<option value="">-- Select Team 2 --</option>';

        const teamsList = document.getElementById('teamsList');
        teamsList.innerHTML = '';

        teamsSnapshot.forEach(doc => {
            const team = doc.data();
            const teamId = doc.id;

            playerTeamSelect.add(new Option(team.name, teamId));
            matchTeam1Select.add(new Option(team.name, teamId));
            matchTeam2Select.add(new Option(team.name, teamId));

            const teamItem = document.createElement('div');
            teamItem.className = 'team-item';
            teamItem.innerHTML = `
                <h4>${team.name} (${team.shortName})</h4>
                <div class="players-list">
                    <strong>Players:</strong>
                    ${team.players && team.players.length > 0
                        ? team.players.map(p => `<div class="player-name">• ${p.name} - ${p.role}</div>`).join('')
                        : '<div class="player-name">No players added yet</div>'
                    }
                </div>
            `;
            teamsList.appendChild(teamItem);
        });
    } catch (error) {
        console.error('Error loading teams:', error);
    }
}

// ========================================
// PUBLIC TEAMS VIEW (Read-Only for Everyone)
// ========================================
async function loadPublicTeams() {
    try {
        const teamsSnapshot = await db.collection('teams').orderBy('name').get();
        
        const publicTeamsList = document.getElementById('publicTeamsList');
        if (!publicTeamsList) {
            console.error('publicTeamsList element not found');
            return;
        }
        
        publicTeamsList.innerHTML = '';

        if (teamsSnapshot.empty) {
            publicTeamsList.innerHTML = `
                <div class="no-teams-message">
                    <h3>⚠️ No Teams Yet</h3>
                    <p>Teams will appear here once they are created by the administrator.</p>
                </div>
            `;
            return;
        }

        teamsSnapshot.forEach(doc => {
            const team = doc.data();
            
            const teamCard = document.createElement('div');
            teamCard.className = 'public-team-card';
            
            // Build players list HTML
            let playersHTML = '';
            if (team.players && Array.isArray(team.players) && team.players.length > 0) {
                playersHTML = team.players.map(player => {
                    // Normalize role for CSS class
                    const roleClass = player.role.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '');
                    return `
                        <div class="public-player-item">
                            <span class="public-player-name">${player.name}</span>
                            <span class="public-player-role ${roleClass}">${player.role}</span>
                        </div>
                    `;
                }).join('');
            } else {
                playersHTML = '<p style="color: #999; text-align: center; padding: 20px; font-style: italic;">No players added yet</p>';
            }
            
            teamCard.innerHTML = `
                <div class="public-team-header">
                    <div class="public-team-name">${team.name}</div>
                    <div class="public-team-short">${team.shortName}</div>
                </div>
                
                <div class="public-players-section">
                    <h4>Squad (${team.players && Array.isArray(team.players) ? team.players.length : 0} players)</h4>
                    <div class="public-player-list">
                        ${playersHTML}
                    </div>
                </div>
            `;
            
            publicTeamsList.appendChild(teamCard);
        });

        console.log(`✅ Loaded ${teamsSnapshot.size} teams for public view`);

    } catch (error) {
        console.error('Error loading public teams:', error);
        const publicTeamsList = document.getElementById('publicTeamsList');
        if (publicTeamsList) {
            publicTeamsList.innerHTML = `
                <div class="no-teams-message">
                    <h3>❌ Error Loading Teams</h3>
                    <p>${error.message}</p>
                    <p style="margin-top: 10px;">Please try refreshing the page.</p>
                </div>
            `;
        }
    }
}

// ========================================
// MATCH MANAGEMENT
// ========================================
async function handleAddMatch(e) {
    e.preventDefault();
    const team1Id = document.getElementById('matchTeam1').value;
    const team2Id = document.getElementById('matchTeam2').value;
    const overs = parseInt(document.getElementById('matchOvers').value);
    const dateTime = document.getElementById('matchDateTime').value;
    const venue = document.getElementById('matchVenue').value;

    if (team1Id === team2Id) {
        showMessage('Please select different teams!');
        return;
    }

    try {
        const team1Doc = await db.collection('teams').doc(team1Id).get();
        const team2Doc = await db.collection('teams').doc(team2Id).get();
        const team1 = team1Doc.data();
        const team2 = team2Doc.data();

        await db.collection('matches').add({
            team1: { id: team1Id, name: team1.name, shortName: team1.shortName },
            team2: { id: team2Id, name: team2.name, shortName: team2.shortName },
            totalOvers: overs,
            dateTime: new Date(dateTime),
            venue: venue,
            status: 'upcoming',
            currentInnings: 0,
            innings: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showMessage('Match created successfully!');
        document.getElementById('addMatchForm').reset();
        loadMatchesManagement();
    } catch (error) {
        showMessage('Error creating match: ' + error.message);
    }
}

async function loadMatchesManagement() {
    try {
        const matchesSnapshot = await db.collection('matches').get();
        const matchesList = document.getElementById('matchesList');
        matchesList.innerHTML = '';

        if (matchesSnapshot.empty) {
            matchesList.innerHTML = '<p>No matches created yet</p>';
            return;
        }

        const matches = [];
        matchesSnapshot.forEach(doc => matches.push({ id: doc.id, data: doc.data() }));
        matches.sort((a, b) => {
            const dateA = a.data.dateTime?.toDate() || new Date(a.data.dateTime);
            const dateB = b.data.dateTime?.toDate() || new Date(b.data.dateTime);
            return dateB - dateA;
        });

        matches.forEach(matchObj => {
            const match = matchObj.data;
            const matchItem = document.createElement('div');
            matchItem.className = 'match-item';

            let statusBadge = '';
            if (match.status === 'live') statusBadge = '<span class="match-status live">LIVE</span>';
            else if (match.status === 'completed') statusBadge = '<span class="match-status completed">COMPLETED</span>';
            else statusBadge = '<span class="match-status upcoming">UPCOMING</span>';

            matchItem.innerHTML = `
                <h4>${match.team1.name} vs ${match.team2.name}</h4>
                ${statusBadge}
                <p><strong>Venue:</strong> ${match.venue}</p>
                <p><strong>Date:</strong> ${formatDate(match.dateTime)}</p>
                <p><strong>Overs:</strong> ${match.totalOvers}</p>
            `;
            matchesList.appendChild(matchItem);
        });
    } catch (error) {
        console.error('Error loading matches:', error);
    }
}

// ========================================
// OPTIMIZATION 2: LIVE MATCHES — single
// onSnapshot renders the full list from
// one query, no separate sub-queries
// ========================================
function renderLiveMatchesList(snapshot) {
    const liveMatchesList = document.getElementById('liveMatchesList');
    liveMatchesList.innerHTML = '';

    if (snapshot.empty) {
        liveMatchesList.innerHTML = '<p style="color: white; text-align: center; padding: 20px;">No live or upcoming matches</p>';
        return;
    }

    const matches = [];
    snapshot.forEach(doc => matches.push({ id: doc.id, data: doc.data() }));
    matches.sort((a, b) => {
        const dateA = a.data.dateTime?.toDate() || new Date(a.data.dateTime);
        const dateB = b.data.dateTime?.toDate() || new Date(b.data.dateTime);
        return dateA - dateB;
    });

    matches.forEach(matchObj => {
        const match = matchObj.data;
        const matchId = matchObj.id;

        const matchCard = document.createElement('div');
        matchCard.className = `match-card ${match.status === 'live' ? 'live' : ''}`;
        matchCard.onclick = () => showMatchDetails(matchId);

        const statusBadge = match.status === 'live'
            ? '<span class="match-status live">● LIVE</span>'
            : '<span class="match-status upcoming">UPCOMING</span>';

        let team1Score = '-';
        let team2Score = '-';

        if (match.innings && match.innings.length > 0) {
            const inn1 = match.innings[0];
            team1Score = `${inn1.runs}/${inn1.wickets} (${formatOvers(inn1.balls)})`;
            if (match.innings.length > 1) {
                const inn2 = match.innings[1];
                team2Score = `${inn2.runs}/${inn2.wickets} (${formatOvers(inn2.balls)})`;
            }
        }

        matchCard.innerHTML = `
            ${statusBadge}
            <h4>${match.team1.name} vs ${match.team2.name}</h4>
            <div class="team-row">
                <span class="team-name">${match.team1.shortName}</span>
                <span class="team-score">${team1Score}</span>
            </div>
            <div class="team-row">
                <span class="team-name">${match.team2.shortName}</span>
                <span class="team-score">${team2Score}</span>
            </div>
            <p style="font-size: 12px; color: #666; margin-top: 10px;">${match.venue}</p>
        `;
        liveMatchesList.appendChild(matchCard);
    });
}

// ========================================
// OPTIMIZATION 2: SINGLE DOCUMENT
// onSnapshot for match details — all
// batting, bowling & score data comes
// from one document, zero extra reads
// ========================================
function showMatchDetails(matchId) {
    currentMatchId = matchId;

    // Detach any previous match listener
    if (currentMatchListener) {
        currentMatchListener();
        currentMatchListener = null;
    }

    // Reset commentary state
    commentaryLoaded = false;
    const commentaryBtn = document.getElementById('loadCommentaryBtn');
    const commentaryList = document.getElementById('ballCommentary');
    commentaryList.innerHTML = '';
    commentaryList.classList.add('hidden');
    commentaryBtn.textContent = 'Show Commentary ▼';

    // Attach one real-time listener to the single match document
    currentMatchListener = db.collection('matches').doc(matchId)
        .onSnapshot(doc => {
            if (!doc.exists) {
                showMessage('Match not found');
                return;
            }
            renderMatchDetails(doc.data(), matchId);
        }, error => {
            console.error('Match detail listener error:', error);
        });
}

function renderMatchDetails(match, matchId) {
    document.getElementById('matchDetails').classList.remove('hidden');
    document.getElementById('matchTitle').textContent = `${match.team1.name} vs ${match.team2.name}`;

    const statusEl = document.getElementById('matchStatus');
    statusEl.textContent = match.status.toUpperCase();
    statusEl.className = `match-status ${match.status}`;

    if (match.innings && match.innings.length > 0) {
        const inn1 = match.innings[0];
        document.getElementById('team1Name').textContent = inn1.battingTeamName || match.team1.name;
        document.getElementById('team1Score').textContent = `${inn1.runs}/${inn1.wickets}`;
        document.getElementById('team1Overs').textContent = `(${formatOvers(inn1.balls)} ov)`;

        if (match.innings.length > 1) {
            const inn2 = match.innings[1];
            document.getElementById('team2Name').textContent = inn2.battingTeamName || match.team2.name;
            document.getElementById('team2Score').textContent = `${inn2.runs}/${inn2.wickets}`;
            document.getElementById('team2Overs').textContent = `(${formatOvers(inn2.balls)} ov)`;
        } else {
            document.getElementById('team2Name').textContent = match.team2.name;
            document.getElementById('team2Score').textContent = '-';
            document.getElementById('team2Overs').textContent = '';
        }
    } else {
        document.getElementById('team1Name').textContent = match.team1.name;
        document.getElementById('team1Score').textContent = '-';
        document.getElementById('team1Overs').textContent = '';
        document.getElementById('team2Name').textContent = match.team2.name;
        document.getElementById('team2Score').textContent = '-';
        document.getElementById('team2Overs').textContent = '';
    }

    // Partnership details
    renderPartnership(match);

    // Scorecards — all data already inside the match document, no extra reads
    loadBattingScorecard(match);
    loadBowlingScorecard(match);

    document.getElementById('matchDetails').scrollIntoView({ behavior: 'smooth' });
}

function renderPartnership(match) {
    const container = document.getElementById('partnershipDetails');
    if (!match.innings || match.currentInnings === 0) {
        container.innerHTML = '';
        return;
    }
    const currentInningsData = match.innings[match.currentInnings - 1];
    if (!currentInningsData) { container.innerHTML = ''; return; }

    const striker = currentInningsData.batsmen?.find(b => b.id === currentInningsData.striker);
    const nonStriker = currentInningsData.batsmen?.find(b => b.id === currentInningsData.nonStriker);

    if (striker && nonStriker) {
        container.innerHTML = `
            <span>${striker.name}* ${striker.runs}(${striker.balls})</span>
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <span>${nonStriker.name} ${nonStriker.runs}(${nonStriker.balls})</span>
        `;
    } else {
        container.innerHTML = '';
    }
}

// ========================================
// OPTIMIZATION 3: LAZY COMMENTARY LOAD
// Only fetches the balls sub-collection
// when the user explicitly taps the button
// ========================================
function toggleCommentary() {
    const commentaryList = document.getElementById('ballCommentary');
    const btn = document.getElementById('loadCommentaryBtn');

    if (commentaryList.classList.contains('hidden')) {
        // Expand
        commentaryList.classList.remove('hidden');
        btn.textContent = 'Hide Commentary ▲';
        if (!commentaryLoaded && currentMatchId) {
            loadBallCommentary(currentMatchId);
        }
    } else {
        // Collapse
        commentaryList.classList.add('hidden');
        btn.textContent = 'Show Commentary ▼';
    }
}

async function loadBallCommentary(matchId) {
    try {
        const ballsSnapshot = await db.collection('matches').doc(matchId)
            .collection('balls')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();

        const commentaryList = document.getElementById('ballCommentary');
        commentaryList.innerHTML = '';
        commentaryLoaded = true;

        if (ballsSnapshot.empty) {
            commentaryList.innerHTML = '<p>No balls bowled yet</p>';
            return;
        }

        ballsSnapshot.forEach(doc => {
            const ball = doc.data();
            const item = document.createElement('div');
            item.className = 'commentary-item';
            item.innerHTML = `
                <div class="ball-info">${formatOvers(ball.overBall)}</div>
                <div class="ball-desc">${ball.description}</div>
            `;
            commentaryList.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading commentary:', error);
    }
}

// ========================================
// BATTING & BOWLING SCORECARDS
// (data comes from match document — no extra reads)
// ========================================
function loadBattingScorecard(match) {
    const tableBody = document.getElementById('battingTableBody');
    tableBody.innerHTML = '';

    if (!match.innings || match.innings.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center">No batting data yet</td></tr>';
        return;
    }

    const currentInnings = match.innings[match.currentInnings - 1] || match.innings[match.innings.length - 1];
    if (!currentInnings.batsmen || currentInnings.batsmen.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center">No batting data yet</td></tr>';
        return;
    }

    currentInnings.batsmen.forEach(batsman => {
        const row = document.createElement('tr');
        if (batsman.isStriker) row.classList.add('striker');
        row.innerHTML = `
            <td>${batsman.name}</td>
            <td>${batsman.runs}</td>
            <td>${batsman.balls}</td>
            <td>${batsman.fours || 0}</td>
            <td>${batsman.sixes || 0}</td>
            <td>${calculateStrikeRate(batsman.runs, batsman.balls)}</td>
            <td>${batsman.status || (batsman.isOut ? 'Out' : 'Not Out')}</td>
        `;
        tableBody.appendChild(row);
    });
}

function loadBowlingScorecard(match) {
    const tableBody = document.getElementById('bowlingTableBody');
    tableBody.innerHTML = '';

    if (!match.innings || match.innings.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center">No bowling data yet</td></tr>';
        return;
    }

    const currentInnings = match.innings[match.currentInnings - 1] || match.innings[match.innings.length - 1];
    if (!currentInnings.bowlers || currentInnings.bowlers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center">No bowling data yet</td></tr>';
        return;
    }

    currentInnings.bowlers.forEach(bowler => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${bowler.name}</td>
            <td>${formatOvers(bowler.balls)}</td>
            <td>${bowler.maidens || 0}</td>
            <td>${bowler.runs}</td>
            <td>${bowler.wickets}</td>
            <td>${bowler.extras || 0}</td>
            <td>${calculateEconomy(bowler.runs, bowler.balls)}</td>
        `;
        tableBody.appendChild(row);
    });
}

// ========================================
// POINTS TABLE
// ========================================
async function loadPointsTable() {
    try {
        const teamsSnapshot = await db.collection('teams').get();
        const matchesSnapshot = await db.collection('matches').where('status', '==', 'completed').get();

        const pointsData = {};
        teamsSnapshot.forEach(doc => {
            const team = doc.data();
            pointsData[doc.id] = {
                name: team.name, played: 0, won: 0, lost: 0, tied: 0,
                points: 0, nrr: 0,
                totalRunsScored: 0, totalBallsFaced: 0,
                totalRunsConceded: 0, totalBallsBowled: 0
            };
        });

        matchesSnapshot.forEach(doc => {
            const match = doc.data();
            if (!match.innings || match.innings.length < 2) return;

            const inn1 = match.innings[0];
            const inn2 = match.innings[1];
            const team1Id = match.team1.id;
            const team2Id = match.team2.id;
            if (!pointsData[team1Id] || !pointsData[team2Id]) return;

            pointsData[team1Id].played++;
            pointsData[team2Id].played++;

            const team1BattedFirst = inn1.battingTeamId === team1Id;
            if (team1BattedFirst) {
                pointsData[team1Id].totalRunsScored += inn1.runs;
                pointsData[team1Id].totalBallsFaced += inn1.balls;
                pointsData[team1Id].totalRunsConceded += inn2.runs;
                pointsData[team1Id].totalBallsBowled += inn2.balls;
                pointsData[team2Id].totalRunsScored += inn2.runs;
                pointsData[team2Id].totalBallsFaced += inn2.balls;
                pointsData[team2Id].totalRunsConceded += inn1.runs;
                pointsData[team2Id].totalBallsBowled += inn1.balls;
            } else {
                pointsData[team2Id].totalRunsScored += inn1.runs;
                pointsData[team2Id].totalBallsFaced += inn1.balls;
                pointsData[team2Id].totalRunsConceded += inn2.runs;
                pointsData[team2Id].totalBallsBowled += inn2.balls;
                pointsData[team1Id].totalRunsScored += inn2.runs;
                pointsData[team1Id].totalBallsFaced += inn2.balls;
                pointsData[team1Id].totalRunsConceded += inn1.runs;
                pointsData[team1Id].totalBallsBowled += inn1.balls;
            }

            if (match.result) {
                if (match.result.includes('tied') || match.result.includes('Tie')) {
                    pointsData[team1Id].tied++; pointsData[team2Id].tied++;
                    pointsData[team1Id].points += 1; pointsData[team2Id].points += 1;
                } else if (match.result.includes(match.team1.name)) {
                    pointsData[team1Id].won++; pointsData[team2Id].lost++;
                    pointsData[team1Id].points += 2;
                } else if (match.result.includes(match.team2.name)) {
                    pointsData[team2Id].won++; pointsData[team1Id].lost++;
                    pointsData[team2Id].points += 2;
                }
            }
        });

        Object.keys(pointsData).forEach(teamId => {
            const team = pointsData[teamId];
            if (team.played > 0) {
                const rrFor = team.totalBallsFaced > 0 ? (team.totalRunsScored / (team.totalBallsFaced / 6)) : 0;
                const rrAgainst = team.totalBallsBowled > 0 ? (team.totalRunsConceded / (team.totalBallsBowled / 6)) : 0;
                team.nrr = rrFor - rrAgainst;
            }
        });

        const sortedTeams = Object.values(pointsData).sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            return b.nrr - a.nrr;
        });

        const tableBody = document.getElementById('pointsTableBody');
        tableBody.innerHTML = '';
        sortedTeams.forEach((team, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${team.name}</td>
                <td>${team.played}</td>
                <td>${team.won}</td>
                <td>${team.lost}</td>
                <td>${team.tied}</td>
                <td>${team.nrr.toFixed(3)}</td>
                <td><strong>${team.points}</strong></td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading points table:', error);
    }
}

// ========================================
// PREVIOUS MATCHES WITH AWARDS
// ========================================
async function loadPreviousMatches() {
    try {
        const matchesSnapshot = await db.collection('matches')
            .where('status', '==', 'completed')
            .get();

        const previousMatchesList = document.getElementById('previousMatchesList');
        previousMatchesList.innerHTML = '';

        if (matchesSnapshot.empty) {
            previousMatchesList.innerHTML = '<p style="color: white; text-align: center; padding: 20px;">No completed matches yet</p>';
            return;
        }

        const matches = [];
        matchesSnapshot.forEach(doc => matches.push({ id: doc.id, data: doc.data() }));
        matches.sort((a, b) => {
            const dateA = a.data.completedAt?.toDate() || a.data.dateTime?.toDate() || new Date(a.data.dateTime);
            const dateB = b.data.completedAt?.toDate() || b.data.dateTime?.toDate() || new Date(b.data.dateTime);
            return dateB - dateA;
        });

        matches.forEach(matchObj => {
            const match = matchObj.data;
            const matchId = matchObj.id;

            const matchCard = document.createElement('div');
            matchCard.className = 'match-card';
            matchCard.onclick = () => showPreviousMatchDetails(matchId);

            let team1Score = '-';
            let team2Score = '-';
            if (match.innings && match.innings.length > 0) {
                const inn1 = match.innings[0];
                team1Score = `${inn1.runs}/${inn1.wickets} (${formatOvers(inn1.balls)})`;
                if (match.innings.length > 1) {
                    const inn2 = match.innings[1];
                    team2Score = `${inn2.runs}/${inn2.wickets} (${formatOvers(inn2.balls)})`;
                }
            }

            matchCard.innerHTML = `
                <span class="match-status completed">COMPLETED</span>
                <h4>${match.team1.name} vs ${match.team2.name}</h4>
                <div class="team-row">
                    <span class="team-name">${match.team1.shortName}</span>
                    <span class="team-score">${team1Score}</span>
                </div>
                <div class="team-row">
                    <span class="team-name">${match.team2.shortName}</span>
                    <span class="team-score">${team2Score}</span>
                </div>
                <p style="font-size: 12px; color: #4CAF50; margin-top: 10px; font-weight: 600;">${match.result || 'Result pending'}</p>
            `;
            previousMatchesList.appendChild(matchCard);
        });
    } catch (error) {
        console.error('Error loading previous matches:', error);
    }
}

async function showPreviousMatchDetails(matchId) {
    try {
        const matchDoc = await db.collection('matches').doc(matchId).get();
        if (!matchDoc.exists) { showMessage('Match not found'); return; }

        const match = matchDoc.data();
        document.getElementById('previousMatchDetails').classList.remove('hidden');
        document.getElementById('prevMatchTitle').textContent = `${match.team1.name} vs ${match.team2.name}`;
        document.getElementById('prevMatchResult').textContent = match.result || 'Result pending';

        document.getElementById('prevMotm').textContent = match.manOfTheMatch?.name || '-';
        document.getElementById('prevBestBat').textContent = match.bestBatsman
            ? `${match.bestBatsman.name} (${match.bestBatsman.runs})` : '-';
        document.getElementById('prevBestBowl').textContent = match.bestBowler
            ? `${match.bestBowler.name} (${match.bestBowler.wickets}/${match.bestBowler.runs})` : '-';

        if (match.innings && match.innings.length >= 2) {
            const inn1 = match.innings[0];
            const inn2 = match.innings[1];

            document.getElementById('prevTeam1Name').textContent = inn1.battingTeamName;
            document.getElementById('prevTeam1Score').textContent = `${inn1.runs}/${inn1.wickets}`;
            document.getElementById('prevTeam1Overs').textContent = `(${formatOvers(inn1.balls)} ov)`;
            document.getElementById('prevTeam2Name').textContent = inn2.battingTeamName;
            document.getElementById('prevTeam2Score').textContent = `${inn2.runs}/${inn2.wickets}`;
            document.getElementById('prevTeam2Overs').textContent = `(${formatOvers(inn2.balls)} ov)`;

            loadPreviousInningsScorecard(inn1, 1);
            loadPreviousInningsScorecard(inn2, 2);
        }

        document.getElementById('previousMatchDetails').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Error showing previous match details:', error);
    }
}

function loadPreviousInningsScorecard(innings, inningsNumber) {
    const battingBody = document.getElementById(`prevInnings${inningsNumber}BattingBody`);
    battingBody.innerHTML = '';

    if (innings.batsmen && innings.batsmen.length > 0) {
        innings.batsmen.forEach(batsman => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${batsman.name}</td>
                <td>${batsman.runs}</td>
                <td>${batsman.balls}</td>
                <td>${batsman.fours || 0}</td>
                <td>${batsman.sixes || 0}</td>
                <td>${calculateStrikeRate(batsman.runs, batsman.balls)}</td>
                <td>${batsman.status || (batsman.isOut ? 'Out' : 'Not Out')}</td>
            `;
            battingBody.appendChild(row);
        });
    } else {
        battingBody.innerHTML = '<tr><td colspan="7" style="text-align:center">No data</td></tr>';
    }

    const bowlingBody = document.getElementById(`prevInnings${inningsNumber}BowlingBody`);
    bowlingBody.innerHTML = '';

    if (innings.bowlers && innings.bowlers.length > 0) {
        innings.bowlers.forEach(bowler => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${bowler.name}</td>
                <td>${formatOvers(bowler.balls)}</td>
                <td>${bowler.maidens || 0}</td>
                <td>${bowler.runs}</td>
                <td>${bowler.wickets}</td>
                <td>${bowler.extras || 0}</td>
                <td>${calculateEconomy(bowler.runs, bowler.balls)}</td>
            `;
            bowlingBody.appendChild(row);
        });
    } else {
        bowlingBody.innerHTML = '<tr><td colspan="7" style="text-align:center">No data</td></tr>';
    }
}

// ========================================
// STATS & RANKINGS
// ========================================
async function loadStats() {
    try {
        const matchesSnapshot = await db.collection('matches')
            .where('status', '==', 'completed')
            .get();

        const playerStats = {};

        matchesSnapshot.forEach(doc => {
            const match = doc.data();
            if (!match.innings) return;

            match.innings.forEach(innings => {
                if (innings.batsmen) {
                    innings.batsmen.forEach(batsman => {
                        const key = batsman.name + '||' + innings.battingTeamName;
                        if (!playerStats[key]) playerStats[key] = { name: batsman.name, team: innings.battingTeamName, runs: 0, wickets: 0, wBalls: 0, wRuns: 0, motmCount: 0 };
                        playerStats[key].runs += batsman.runs || 0;
                    });
                }
                if (innings.bowlers) {
                    innings.bowlers.forEach(bowler => {
                        const key = bowler.name + '||' + innings.fieldingTeamName;
                        if (!playerStats[key]) playerStats[key] = { name: bowler.name, team: innings.fieldingTeamName, runs: 0, wickets: 0, wBalls: 0, wRuns: 0, motmCount: 0 };
                        playerStats[key].wickets += bowler.wickets || 0;
                        playerStats[key].wBalls += bowler.balls || 0;
                        playerStats[key].wRuns += bowler.runs || 0;
                    });
                }
            });

            if (match.manOfTheMatch) {
                const motmName = match.manOfTheMatch.name;
                Object.keys(playerStats).forEach(k => {
                    if (playerStats[k].name === motmName) playerStats[k].motmCount++;
                });
            }
        });

        const allPlayers = Object.values(playerStats);

        const topBatsmen = [...allPlayers].sort((a, b) => b.runs - a.runs).slice(0, 10);
        const battingBody = document.getElementById('battingRankingsBody');
        battingBody.innerHTML = '';
        topBatsmen.forEach((p, i) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${i + 1}</td><td>${p.name}</td><td>${p.team || '-'}</td><td><strong>${p.runs}</strong></td>`;
            battingBody.appendChild(row);
        });

        const topBowlers = [...allPlayers].sort((a, b) => {
            if (b.wickets !== a.wickets) return b.wickets - a.wickets;
            return (a.wRuns / (a.wBalls || 1)) - (b.wRuns / (b.wBalls || 1));
        }).slice(0, 10);
        const bowlingBody = document.getElementById('bowlingRankingsBody');
        bowlingBody.innerHTML = '';
        topBowlers.forEach((p, i) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${i + 1}</td><td>${p.name}</td><td>${p.team || '-'}</td><td><strong>${p.wickets}</strong></td>`;
            bowlingBody.appendChild(row);
        });

        const mvpPlayer = [...allPlayers].sort((a, b) => {
            if (b.motmCount !== a.motmCount) return b.motmCount - a.motmCount;
            return b.runs - a.runs;
        })[0];

        const mvpNameEl = document.getElementById('mvpName');
        const mvpPointsEl = document.getElementById('mvpPoints');
        if (mvpPlayer && mvpPlayer.runs > 0) {
            mvpNameEl.textContent = mvpPlayer.name;
            mvpPointsEl.textContent = `${mvpPlayer.runs} runs | ${mvpPlayer.wickets} wickets | ${mvpPlayer.motmCount} MOTM award(s)`;
        } else {
            mvpNameEl.textContent = 'No data yet';
            mvpPointsEl.textContent = '';
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ========================================
// SCORING INTERFACE
// ========================================
async function loadScoringInterface() {
    try {
        const matchesSnapshot = await db.collection('matches')
            .where('status', 'in', ['upcoming', 'live'])
            .get();

        const select = document.getElementById('scoringMatchSelect');
        select.innerHTML = '<option value="">-- Select Match --</option>';

        matchesSnapshot.forEach(doc => {
            const match = doc.data();
            select.add(new Option(`${match.team1.name} vs ${match.team2.name} (${match.status})`, doc.id));
        });
    } catch (error) {
        console.error('Error loading scoring interface:', error);
    }
}

async function handleScoringMatchSelect() {
    const matchId = document.getElementById('scoringMatchSelect').value;
    if (!matchId) {
        document.getElementById('scoringInterface').classList.add('hidden');
        currentScoringMatch = null;
        return;
    }

    try {
        const matchDoc = await db.collection('matches').doc(matchId).get();
        if (!matchDoc.exists) return;

        currentScoringMatch = { id: matchId, ...matchDoc.data() };
        document.getElementById('scoringInterface').classList.remove('hidden');
        document.getElementById('scoringMatchTitle').textContent =
            `${currentScoringMatch.team1.name} vs ${currentScoringMatch.team2.name}`;
        refreshScoringUI();
    } catch (error) {
        console.error('Error selecting match:', error);
    }
}

function refreshScoringUI() {
    if (!currentScoringMatch) return;

    const match = currentScoringMatch;
    const tossSelection = document.getElementById('tossSelection');
    const tossInfoDisplay = document.getElementById('tossInfoDisplay');
    const startInningsBtn = document.getElementById('startInningsBtn');
    const endInningsBtn = document.getElementById('endInningsBtn');
    const endMatchBtn = document.getElementById('endMatchBtn');
    const batsmenSelection = document.getElementById('batsmenSelection');
    const bowlerSelection = document.getElementById('bowlerSelection');
    const currentPlayers = document.getElementById('currentPlayers');
    const scoringControls = document.getElementById('scoringControls');

    [batsmenSelection, bowlerSelection, currentPlayers, scoringControls].forEach(el => el.classList.add('hidden'));
    [startInningsBtn, endInningsBtn, endMatchBtn].forEach(el => el.classList.add('hidden'));

    if (!match.toss) {
        tossSelection.classList.remove('hidden');
        tossInfoDisplay.classList.add('hidden');
        const tossWinner = document.getElementById('tossWinnerSelect');
        tossWinner.innerHTML = '<option value="">-- Select Toss Winner --</option>';
        tossWinner.add(new Option(match.team1.name, match.team1.id));
        tossWinner.add(new Option(match.team2.name, match.team2.id));
        return;
    }

    tossSelection.classList.add('hidden');
    tossInfoDisplay.classList.remove('hidden');
    document.getElementById('tossInfoText').textContent =
        `${match.toss.winnerName} won the toss and chose to ${match.toss.decision === 'bat' ? 'bat' : 'bowl'} first`;

    if (match.status === 'upcoming' || (match.status === 'live' && match.currentInnings === 0)) {
        startInningsBtn.classList.remove('hidden');
        return;
    }

    if (match.status === 'live') {
        const currentInningsData = match.innings[match.currentInnings - 1];

        document.getElementById('scoringBattingTeam').textContent = currentInningsData.battingTeamName;
        document.getElementById('scoringScore').textContent = `${currentInningsData.runs}/${currentInningsData.wickets}`;
        document.getElementById('scoringOvers').textContent = `(${formatOvers(currentInningsData.balls)})`;

        // NEW: Display target info for second innings
        const targetInfoEl = document.getElementById('targetInfo');
        if (match.currentInnings === 2 && match.innings.length >= 2) {
            const target = match.innings[0].runs + 1;
            const runsNeeded = target - currentInningsData.runs;
            const ballsRemaining = (match.totalOvers * 6) - currentInningsData.balls;
            const requiredRunRate = ballsRemaining > 0 ? ((runsNeeded / ballsRemaining) * 6).toFixed(2) : '0.00';
            
            if (targetInfoEl) {
                if (runsNeeded > 0) {
                    targetInfoEl.textContent = `Target: ${target} | Need ${runsNeeded} runs from ${ballsRemaining} balls | RR: ${requiredRunRate}`;
                } else {
                    targetInfoEl.textContent = `🎉 TARGET ACHIEVED! Match won!`;
                }
            }
        } else {
            if (targetInfoEl) targetInfoEl.textContent = '';
        }

        if (!currentInningsData.striker || !currentInningsData.bowler) {
            if (!currentInningsData.striker) showBatsmenSelection();
            else if (!currentInningsData.bowler) showBowlerSelection();
            return;
        }

        // Check if innings is complete — all overs done or all out
        const totalBalls = match.totalOvers * 6;
        const oversComplete = currentInningsData.balls >= totalBalls;
        const allOut = currentInningsData.wickets >= 10;
        const inningsComplete = oversComplete || allOut;

        // Always show current players and update their stats
        currentPlayers.classList.remove('hidden');

        const striker = currentInningsData.batsmen?.find(b => b.id === currentInningsData.striker);
        const nonStriker = currentInningsData.batsmen?.find(b => b.id === currentInningsData.nonStriker);
        const bowler = currentInningsData.bowlers?.find(b => b.id === currentInningsData.bowler);

        document.getElementById('currentStriker').textContent = striker?.name || '-';
        document.getElementById('strikerStats').textContent = striker ? `${striker.runs}(${striker.balls})` : '0(0)';
        document.getElementById('currentNonStriker').textContent = nonStriker?.name || '-';
        document.getElementById('nonStrikerStats').textContent = nonStriker ? `${nonStriker.runs}(${nonStriker.balls})` : '0(0)';
        document.getElementById('currentBowler').textContent = bowler?.name || '-';
        document.getElementById('bowlerStats').textContent = bowler ? `${bowler.wickets}-${bowler.runs} (${formatOvers(bowler.balls)})` : '0-0 (0.0)';

        if (inningsComplete) {
            // Lock scoring controls
            scoringControls.classList.add('hidden');

            // Show only the correct end button
            if (match.currentInnings === 1) {
                endInningsBtn.classList.remove('hidden');
                endMatchBtn.classList.add('hidden');
            } else {
                endMatchBtn.classList.remove('hidden');
                endInningsBtn.classList.add('hidden');
            }

            // Show or update the completion banner
            const reason = oversComplete
                ? `All ${match.totalOvers} overs completed`
                : 'All 10 wickets have fallen';
            const action = match.currentInnings === 1
                ? 'Click "End Innings" to start the second innings.'
                : 'Click "End Match" to finish the match.';

            let banner = document.getElementById('inningsCompleteBanner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'inningsCompleteBanner';
                banner.style.cssText = [
                    'background:linear-gradient(135deg,#FF9800,#F57C00)',
                    'color:white',
                    'padding:16px 20px',
                    'border-radius:10px',
                    'font-weight:700',
                    'font-size:16px',
                    'text-align:center',
                    'margin-bottom:20px',
                    'box-shadow:0 4px 12px rgba(255,152,0,0.4)'
                ].join(';');
                currentPlayers.insertAdjacentElement('afterend', banner);
            }
            banner.textContent = `🏏 ${reason}. ${action}`;

        } else {
            // Innings still in progress — show controls, remove any banner
            scoringControls.classList.remove('hidden');
            endInningsBtn.classList.remove('hidden');
            endMatchBtn.classList.remove('hidden');

            const existingBanner = document.getElementById('inningsCompleteBanner');
            if (existingBanner) existingBanner.remove();
        }

        renderThisOver(currentInningsData);
        renderScoringCommentary(match.id);
    }
}

function renderThisOver(inningsData) {
    const container = document.getElementById('thisOverBalls');
    container.innerHTML = '';
    const currentOverBalls = inningsData.thisOver || [];
    currentOverBalls.forEach(ball => {
        const span = document.createElement('span');
        span.className = 'over-ball';
        if (ball.isWicket) {
            span.classList.add('wicket');
            span.textContent = 'W';
        } else if (ball.extraType) {
            span.classList.add('extra');
            span.textContent = ball.extraType === 'wide' ? 'Wd' : ball.extraType === 'noball' ? 'Nb' : ball.runs > 0 ? ball.runs : '0';
        } else {
            if (ball.runs === 4) span.classList.add('four');
            if (ball.runs === 6) span.classList.add('six');
            span.textContent = ball.runs;
        }
        container.appendChild(span);
    });
}

async function renderScoringCommentary(matchId) {
    try {
        const ballsSnapshot = await db.collection('matches').doc(matchId)
            .collection('balls')
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();

        const container = document.getElementById('scoringCommentary');
        container.innerHTML = '';

        ballsSnapshot.forEach(doc => {
            const ball = doc.data();
            const item = document.createElement('div');
            item.className = 'commentary-item';
            item.innerHTML = `<div class="ball-info">${formatOvers(ball.overBall)}</div><div class="ball-desc">${ball.description}</div>`;
            container.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading scoring commentary:', error);
    }
}

async function confirmToss() {
    const winnerId = document.getElementById('tossWinnerSelect').value;
    const decision = document.getElementById('tossDecisionSelect').value;
    if (!winnerId || !decision) { showMessage('Please select toss winner and decision.'); return; }

    const match = currentScoringMatch;
    const winnerName = match.team1.id === winnerId ? match.team1.name : match.team2.name;

    let battingTeam, fieldingTeam;
    if (decision === 'bat') {
        battingTeam = match.team1.id === winnerId ? match.team1 : match.team2;
        fieldingTeam = match.team1.id === winnerId ? match.team2 : match.team1;
    } else {
        battingTeam = match.team1.id === winnerId ? match.team2 : match.team1;
        fieldingTeam = match.team1.id === winnerId ? match.team1 : match.team2;
    }

    try {
        await db.collection('matches').doc(match.id).update({
            toss: { winnerId, winnerName, decision },
            battingFirstTeam: battingTeam,
            fieldingFirstTeam: fieldingTeam,
            status: 'upcoming'
        });
        currentScoringMatch = { ...currentScoringMatch, toss: { winnerId, winnerName, decision }, battingFirstTeam: battingTeam, fieldingFirstTeam: fieldingTeam };
        refreshScoringUI();
    } catch (error) {
        showMessage('Error saving toss: ' + error.message);
    }
}

async function startInnings() {
    const match = currentScoringMatch;
    const inningsIndex = match.innings ? match.innings.length : 0;

    let battingTeam, fieldingTeam;
    if (inningsIndex === 0) {
        battingTeam = match.battingFirstTeam || match.team1;
        fieldingTeam = match.fieldingFirstTeam || match.team2;
    } else {
        battingTeam = match.innings[0].battingTeamId === match.team1.id ? match.team2 : match.team1;
        fieldingTeam = match.innings[0].battingTeamId === match.team1.id ? match.team1 : match.team2;
    }

    const newInnings = {
        inningsNumber: inningsIndex + 1,
        battingTeamId: battingTeam.id,
        battingTeamName: battingTeam.name,
        fieldingTeamId: fieldingTeam.id,
        fieldingTeamName: fieldingTeam.name,
        runs: 0, wickets: 0, balls: 0,
        batsmen: [], bowlers: [],
        striker: null, nonStriker: null, bowler: null, thisOver: []
    };

    const updatedInnings = [...(match.innings || []), newInnings];

    try {
        await db.collection('matches').doc(match.id).update({
            status: 'live',
            innings: updatedInnings,
            currentInnings: inningsIndex + 1
        });
        currentScoringMatch = { ...currentScoringMatch, status: 'live', innings: updatedInnings, currentInnings: inningsIndex + 1 };
        showBatsmenSelection();
        refreshScoringUI();
    } catch (error) {
        showMessage('Error starting innings: ' + error.message);
    }
}

function showBatsmenSelection() {
    const match = currentScoringMatch;
    const inningsData = match.innings[match.currentInnings - 1];

    db.collection('teams').doc(inningsData.battingTeamId).get().then(teamDoc => {
        if (!teamDoc.exists) return;
        const players = teamDoc.data().players || [];
        const usedPlayerIds = (inningsData.batsmen || []).map(b => b.id);

        const strikerSelect = document.getElementById('strikerSelect');
        const nonStrikerSelect = document.getElementById('nonStrikerSelect');
        strikerSelect.innerHTML = '<option value="">-- Select Striker --</option>';
        nonStrikerSelect.innerHTML = '<option value="">-- Select Non-Striker --</option>';

        players.forEach(p => {
            if (!usedPlayerIds.includes(p.id)) {
                strikerSelect.add(new Option(p.name, p.id + '||' + p.name));
                nonStrikerSelect.add(new Option(p.name, p.id + '||' + p.name));
            }
        });

        document.getElementById('batsmenSelection').classList.remove('hidden');
        document.getElementById('bowlerSelection').classList.add('hidden');
        document.getElementById('currentPlayers').classList.add('hidden');
        document.getElementById('scoringControls').classList.add('hidden');
    });
}

function showBowlerSelection() {
    const match = currentScoringMatch;
    const inningsData = match.innings[match.currentInnings - 1];

    db.collection('teams').doc(inningsData.fieldingTeamId).get().then(teamDoc => {
        if (!teamDoc.exists) return;
        const players = teamDoc.data().players || [];
        const bowlerSelect = document.getElementById('bowlerSelect');
        bowlerSelect.innerHTML = '<option value="">-- Select Bowler --</option>';
        players.forEach(p => bowlerSelect.add(new Option(p.name, p.id + '||' + p.name)));

        document.getElementById('bowlerSelection').classList.remove('hidden');
        document.getElementById('batsmenSelection').classList.add('hidden');
    });
}

async function confirmBatsmen() {
    const strikerVal = document.getElementById('strikerSelect').value;
    const nonStrikerVal = document.getElementById('nonStrikerSelect').value;

    if (!strikerVal || !nonStrikerVal || strikerVal === nonStrikerVal) {
        showMessage('Please select two different batsmen.');
        return;
    }

    const [strikerId, strikerName] = strikerVal.split('||');
    const [nonStrikerId, nonStrikerName] = nonStrikerVal.split('||');

    const match = currentScoringMatch;
    const inningsIndex = match.currentInnings - 1;
    const innings = [...match.innings];
    const currentInningsData = { ...innings[inningsIndex] };
    const batsmen = [...(currentInningsData.batsmen || [])];

    if (!batsmen.find(b => b.id === strikerId)) batsmen.push({ id: strikerId, name: strikerName, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, isStriker: true, status: 'Not Out' });
    if (!batsmen.find(b => b.id === nonStrikerId)) batsmen.push({ id: nonStrikerId, name: nonStrikerName, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, isStriker: false, status: 'Not Out' });

    currentInningsData.batsmen = batsmen;
    currentInningsData.striker = strikerId;
    currentInningsData.nonStriker = nonStrikerId;
    innings[inningsIndex] = currentInningsData;

    try {
        await db.collection('matches').doc(match.id).update({ innings });
        currentScoringMatch = { ...currentScoringMatch, innings };
        document.getElementById('batsmenSelection').classList.add('hidden');
        showBowlerSelection();
    } catch (error) {
        showMessage('Error confirming batsmen: ' + error.message);
    }
}

async function confirmBowler() {
    const bowlerVal = document.getElementById('bowlerSelect').value;
    if (!bowlerVal) { showMessage('Please select a bowler.'); return; }

    const [bowlerId, bowlerName] = bowlerVal.split('||');
    const match = currentScoringMatch;
    const inningsIndex = match.currentInnings - 1;
    const innings = [...match.innings];
    const currentInningsData = { ...innings[inningsIndex] };
    const bowlers = [...(currentInningsData.bowlers || [])];

    if (!bowlers.find(b => b.id === bowlerId)) {
        bowlers.push({ id: bowlerId, name: bowlerName, balls: 0, runs: 0, wickets: 0, maidens: 0, extras: 0 });
    }

    currentInningsData.bowlers = bowlers;
    currentInningsData.bowler = bowlerId;
    innings[inningsIndex] = currentInningsData;

    try {
        await db.collection('matches').doc(match.id).update({ innings });
        currentScoringMatch = { ...currentScoringMatch, innings };
        document.getElementById('bowlerSelection').classList.add('hidden');
        refreshScoringUI();
    } catch (error) {
        showMessage('Error confirming bowler: ' + error.message);
    }
}

async function changeStrike() {
    const match = currentScoringMatch;
    const inningsIndex = match.currentInnings - 1;
    const innings = [...match.innings];
    const currentInningsData = { ...innings[inningsIndex] };

    const temp = currentInningsData.striker;
    currentInningsData.striker = currentInningsData.nonStriker;
    currentInningsData.nonStriker = temp;

    currentInningsData.batsmen = currentInningsData.batsmen.map(b => ({
        ...b, isStriker: b.id === currentInningsData.striker
    }));
    innings[inningsIndex] = currentInningsData;

    try {
        await db.collection('matches').doc(match.id).update({ innings });
        currentScoringMatch = { ...currentScoringMatch, innings };
        refreshScoringUI();
    } catch (error) {
        showMessage('Error changing strike: ' + error.message);
    }
}

function showChangeBowler() {
    showBowlerSelection();
}

function showWicketModal() {
    const match = currentScoringMatch;
    const inningsData = match.innings[match.currentInnings - 1];

    const wicketBatsmanSelect = document.getElementById('wicketBatsmanSelect');
    wicketBatsmanSelect.innerHTML = '<option value="">-- Select --</option>';
    const activeBatsmen = (inningsData.batsmen || []).filter(b => !b.isOut);
    activeBatsmen.forEach(b => wicketBatsmanSelect.add(new Option(b.name, b.id + '||' + b.name)));

    const newBatsmanSelect = document.getElementById('newBatsmanSelect');
    newBatsmanSelect.innerHTML = '<option value="">-- Select --</option>';

    const fielderSelect = document.getElementById('fielderSelect');
    fielderSelect.innerHTML = '<option value="">-- Select Fielder --</option>';

    db.collection('teams').doc(inningsData.fieldingTeamId).get().then(teamDoc => {
        if (teamDoc.exists) {
            teamDoc.data().players?.forEach(p => fielderSelect.add(new Option(p.name, p.name)));
        }
    });

    db.collection('teams').doc(inningsData.battingTeamId).get().then(teamDoc => {
        if (teamDoc.exists) {
            const usedIds = (inningsData.batsmen || []).map(b => b.id);
            teamDoc.data().players?.forEach(p => {
                if (!usedIds.includes(p.id)) newBatsmanSelect.add(new Option(p.name, p.id + '||' + p.name));
            });
        }
    });

    document.getElementById('wicketModal').classList.remove('hidden');
}

function closeWicketModal() {
    document.getElementById('wicketModal').classList.add('hidden');
    document.getElementById('wicketForm').reset();
}

async function handleWicket(e) {
    e.preventDefault();
    const batsmanVal = document.getElementById('wicketBatsmanSelect').value;
    const wicketType = document.getElementById('wicketType').value;
    const fielder = document.getElementById('fielderSelect').value;
    const newBatsmanVal = document.getElementById('newBatsmanSelect').value;

    if (!batsmanVal || !wicketType) { showMessage('Please fill in all required fields.'); return; }

    const [outBatsmanId, outBatsmanName] = batsmanVal.split('||');
    const match = currentScoringMatch;
    const inningsIndex = match.currentInnings - 1;
    const innings = [...match.innings];
    const currentInningsData = { ...innings[inningsIndex] };

    // Block if all overs already complete
    const totalBalls = match.totalOvers * 6;
    if (currentInningsData.balls >= totalBalls) {
        showMessage(`All ${match.totalOvers} overs are complete. Please click "End Innings" to continue.`);
        closeWicketModal();
        return;
    }

    // Block if already all out
    if (currentInningsData.wickets >= 10) {
        showMessage('All 10 wickets have already fallen. Please click "End Innings" to continue.');
        closeWicketModal();
        return;
    }

    currentInningsData.batsmen = currentInningsData.batsmen.map(b => {
        if (b.id === outBatsmanId) {
            let statusText = wicketType;
            if ((wicketType === 'Caught' || wicketType === 'Run Out') && fielder) statusText = `${wicketType} (${fielder})`;
            return { ...b, isOut: true, status: statusText };
        }
        return b;
    });

    currentInningsData.wickets = (currentInningsData.wickets || 0) + 1;

    const bowlerCredited = ['Bowled', 'Caught', 'LBW', 'Stumped', 'Hit Wicket'];
    if (bowlerCredited.includes(wicketType)) {
        currentInningsData.bowlers = currentInningsData.bowlers.map(b => {
            if (b.id === currentInningsData.bowler) return { ...b, wickets: (b.wickets || 0) + 1 };
            return b;
        });
    }

    if (newBatsmanVal) {
        const [newId, newName] = newBatsmanVal.split('||');
        currentInningsData.batsmen.push({ id: newId, name: newName, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, isStriker: true, status: 'Not Out' });
        if (outBatsmanId === currentInningsData.striker) currentInningsData.striker = newId;
        else currentInningsData.nonStriker = newId;
    }

    currentInningsData.batsmen = currentInningsData.batsmen.map(b => ({
        ...b, isStriker: b.id === currentInningsData.striker
    }));

    currentInningsData.balls = (currentInningsData.balls || 0) + 1;
    currentInningsData.bowlers = currentInningsData.bowlers.map(b => {
        if (b.id === currentInningsData.bowler) return { ...b, balls: (b.balls || 0) + 1 };
        return b;
    });

    const thisOver = [...(currentInningsData.thisOver || []), { runs: 0, isWicket: true }];
    currentInningsData.thisOver = thisOver;

    innings[inningsIndex] = currentInningsData;

    const bowler = currentInningsData.bowlers?.find(b => b.id === currentInningsData.bowler);
    const description = `${outBatsmanName} ${wicketType}${fielder ? ' by ' + fielder : ''} - WICKET! b. ${bowler?.name || 'Unknown'}`;
    const ballRecord = {
        type: 'wicket', runs: 0, isWicket: true, wicketType,
        batsmanOut: outBatsmanName, overBall: currentInningsData.balls,
        description, timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        inningsNumber: match.currentInnings
    };

    try {
        await db.collection('matches').doc(match.id).update({ innings });
        await db.collection('matches').doc(match.id).collection('balls').add(ballRecord);
        lastBalls.push({ innings: JSON.parse(JSON.stringify(innings)), ballRecord });
        currentScoringMatch = { ...currentScoringMatch, innings };
        closeWicketModal();
        refreshScoringUI();
    } catch (error) {
        showMessage('Error recording wicket: ' + error.message);
    }
}

async function recordBall(runs, isExtra, extraType) {
    const match = currentScoringMatch;
    if (!match) return;

    const inningsIndex = match.currentInnings - 1;
    const innings = [...match.innings];
    const currentInningsData = { ...innings[inningsIndex] };

    // CRITICAL FIX: Check if target already reached in second innings
    if (match.currentInnings === 2 && innings.length >= 2) {
        const target = innings[0].runs + 1;
        if (currentInningsData.runs >= target) {
            showMessage('Target already achieved! Match is complete. Click "End Match" to finish.');
            return;
        }
    }

    // Block scoring if all overs are complete
    const totalBalls = match.totalOvers * 6;
    if (currentInningsData.balls >= totalBalls) {
        showMessage(`All ${match.totalOvers} overs are complete. Please click "End Innings" to continue.`);
        return;
    }

    // Block scoring if all out
    if (currentInningsData.wickets >= 10) {
        showMessage('All 10 wickets have fallen. Please click "End Innings" to continue.');
        return;
    }

    const striker = currentInningsData.batsmen?.find(b => b.id === currentInningsData.striker);
    const bowler = currentInningsData.bowlers?.find(b => b.id === currentInningsData.bowler);
    if (!striker || !bowler) { showMessage('Please set batsmen and bowler first.'); return; }

    const overBall = (!isExtra || (extraType !== 'wide' && extraType !== 'noball'))
        ? currentInningsData.balls + 1
        : currentInningsData.balls;
    
    // NEW: Calculate runs BEFORE updating to check target
    const newTotalRuns = (currentInningsData.runs || 0) + runs;
    currentInningsData.runs = newTotalRuns;

    if (!isExtra) {
        currentInningsData.batsmen = currentInningsData.batsmen.map(b => {
            if (b.id === currentInningsData.striker) {
                return {
                    ...b,
                    runs: (b.runs || 0) + runs,
                    balls: (b.balls || 0) + 1,
                    fours: runs === 4 ? (b.fours || 0) + 1 : (b.fours || 0),
                    sixes: runs === 6 ? (b.sixes || 0) + 1 : (b.sixes || 0)
                };
            }
            return b;
        });
        currentInningsData.balls = (currentInningsData.balls || 0) + 1;
        currentInningsData.bowlers = currentInningsData.bowlers.map(b => {
            if (b.id === currentInningsData.bowler) return { ...b, runs: (b.runs || 0) + runs, balls: (b.balls || 0) + 1 };
            return b;
        });
    } else {
        currentInningsData.bowlers = currentInningsData.bowlers.map(b => {
            if (b.id === currentInningsData.bowler) return { ...b, runs: (b.runs || 0) + runs, extras: (b.extras || 0) + 1 };
            return b;
        });
        if (extraType !== 'wide' && extraType !== 'noball') {
            currentInningsData.balls = (currentInningsData.balls || 0) + 1;
        }
    }

    const shouldRotate = runs % 2 === 1;
    if (shouldRotate) {
        const temp = currentInningsData.striker;
        currentInningsData.striker = currentInningsData.nonStriker;
        currentInningsData.nonStriker = temp;
    }

    currentInningsData.batsmen = currentInningsData.batsmen.map(b => ({
        ...b, isStriker: b.id === currentInningsData.striker
    }));

    const overComplete = !isExtra && currentInningsData.balls % 6 === 0 && currentInningsData.balls > 0;

    let description = '';
    if (isExtra) description = `${extraType.toUpperCase()} + ${runs} runs`;
    else if (runs === 0) description = `Dot ball. ${striker.name} to ${bowler.name}`;
    else if (runs === 4) description = `FOUR! ${striker.name} hits ${bowler.name} for 4`;
    else if (runs === 6) description = `SIX! ${striker.name} hits ${bowler.name} for 6`;
    else description = `${runs} run(s). ${striker.name} off ${bowler.name}`;

    const thisOver = [...(currentInningsData.thisOver || []), { runs, isWicket: false, extraType: isExtra ? extraType : null }];

    if (overComplete) {
        const temp = currentInningsData.striker;
        currentInningsData.striker = currentInningsData.nonStriker;
        currentInningsData.nonStriker = temp;
        currentInningsData.batsmen = currentInningsData.batsmen.map(b => ({ ...b, isStriker: b.id === currentInningsData.striker }));
        currentInningsData.thisOver = [];
        description += ' [End of Over]';
    } else {
        currentInningsData.thisOver = thisOver;
    }

    innings[inningsIndex] = currentInningsData;

    const ballRecord = {
        type: isExtra ? 'extra' : 'normal',
        runs, isExtra, extraType, overBall, description,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        inningsNumber: match.currentInnings
    };

    // CRITICAL FIX: Check if target reached in second innings AFTER this ball
    const isSecondInnings = match.currentInnings === 2;
    const targetReached = isSecondInnings && innings.length >= 2 && newTotalRuns >= (innings[0].runs + 1);

    try {
        // ALWAYS save the ball first - this ensures last ball is recorded
        await db.collection('matches').doc(match.id).update({ innings });
        await db.collection('matches').doc(match.id).collection('balls').add(ballRecord);
        lastBalls.push({ innings: JSON.parse(JSON.stringify(innings)), ballRecord });
        currentScoringMatch = { ...currentScoringMatch, innings };

        // NEW: If target reached, auto-complete match immediately
        if (targetReached) {
            const target = innings[0].runs + 1;
            const wicketsRemaining = 10 - currentInningsData.wickets;
            showMessage(`🎉 TARGET ACHIEVED! ${currentInningsData.battingTeamName} wins by ${wicketsRemaining} wicket(s)!`);
            
            // Refresh UI to show the final score
            refreshScoringUI();
            
            // Auto-complete match after short delay to let user see the last ball
            setTimeout(() => {
                endMatch();
            }, 2000);
            return;
        }

        if (overComplete) showBowlerSelection();
        else refreshScoringUI();
    } catch (error) {
        showMessage('Error recording ball: ' + error.message);
    }
}

function handleExtra(extraType) {
    let runs = 1;
    if (extraType === 'bye' || extraType === 'legbye') {
        const runsStr = prompt(`Enter runs for ${extraType} (0-6):`, '1');
        if (runsStr === null) return;
        runs = parseInt(runsStr) || 0;
    }
    recordBall(runs, true, extraType);
}

async function endInnings() {
    if (!confirm('Are you sure you want to end this innings?')) return;

    const match = currentScoringMatch;
    const innings = [...match.innings];
    innings[match.currentInnings - 1] = { ...innings[match.currentInnings - 1], completed: true };

    try {
        await db.collection('matches').doc(match.id).update({ innings });
        currentScoringMatch = { ...currentScoringMatch, innings };
        showMessage('Innings ended. Please start the second innings.');
        document.getElementById('startInningsBtn').classList.remove('hidden');
        document.getElementById('endInningsBtn').classList.add('hidden');
        document.getElementById('currentPlayers').classList.add('hidden');
        document.getElementById('scoringControls').classList.add('hidden');
    } catch (error) {
        showMessage('Error ending innings: ' + error.message);
    }
}

async function endMatch() {
    if (!confirm('Are you sure you want to end this match?')) return;

    const match = currentScoringMatch;
    const innings = match.innings;
    let result = 'Match result pending';
    let manOfTheMatch = null;
    let bestBatsman = null;
    let bestBowler = null;

    if (innings && innings.length >= 2) {
        const inn1 = innings[0];
        const inn2 = innings[1];

        if (inn2.runs > inn1.runs) result = `${inn2.battingTeamName} won by ${10 - inn2.wickets} wicket(s)`;
        else if (inn1.runs > inn2.runs) result = `${inn1.battingTeamName} won by ${inn1.runs - inn2.runs} run(s)`;
        else result = 'Match Tied';

        const allBatsmen = [...(inn1.batsmen || []), ...(inn2.batsmen || [])];
        const grouped = {};
        allBatsmen.forEach(b => {
            if (!grouped[b.name]) grouped[b.name] = { name: b.name, runs: 0, balls: 0 };
            grouped[b.name].runs += b.runs;
            grouped[b.name].balls += b.balls;
        });
        bestBatsman = Object.values(grouped).sort((a, b) => b.runs - a.runs)[0] || null;

        const allBowlers = [...(inn1.bowlers || []), ...(inn2.bowlers || [])];
        const groupedB = {};
        allBowlers.forEach(b => {
            if (!groupedB[b.name]) groupedB[b.name] = { name: b.name, wickets: 0, runs: 0, balls: 0 };
            groupedB[b.name].wickets += b.wickets;
            groupedB[b.name].runs += b.runs;
            groupedB[b.name].balls += b.balls;
        });
        bestBowler = Object.values(groupedB).sort((a, b) => {
            if (b.wickets !== a.wickets) return b.wickets - a.wickets;
            return (a.runs / (a.balls || 1)) - (b.runs / (b.balls || 1));
        })[0] || null;

        manOfTheMatch = bestBatsman;
    }

    try {
        await db.collection('matches').doc(match.id).update({
            status: 'completed', result, manOfTheMatch, bestBatsman, bestBowler,
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        currentScoringMatch = null;
        document.getElementById('scoringInterface').classList.add('hidden');
        document.getElementById('scoringMatchSelect').value = '';
        showMessage(`Match ended! Result: ${result}`);
        loadScoringInterface();
    } catch (error) {
        showMessage('Error ending match: ' + error.message);
    }
}

async function undoLastBall() {
    if (lastBalls.length === 0) { showMessage('Nothing to undo.'); return; }
    if (!confirm('Undo the last recorded ball?')) return;

    const last = lastBalls.pop();
    const match = currentScoringMatch;

    try {
        await db.collection('matches').doc(match.id).update({ innings: last.innings });

        const ballsSnapshot = await db.collection('matches').doc(match.id)
            .collection('balls')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        if (!ballsSnapshot.empty) await ballsSnapshot.docs[0].ref.delete();

        currentScoringMatch = { ...currentScoringMatch, innings: last.innings };
        refreshScoringUI();
        showMessage('Last ball undone.');
    } catch (error) {
        showMessage('Error undoing last ball: ' + error.message);
    }
}