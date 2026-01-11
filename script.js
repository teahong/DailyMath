// Supabase 연결 설정 (config.js에서 로드)
const supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// 게임 상태 관리
const state = {
    screen: 'user',
    currentUser: '',
    difficulty: 'easy',
    questions: [],
    currentIndex: 0,
    score: 0,
    startTime: 0,
    history: JSON.parse(localStorage.getItem('gugudan-history-v2') || '[]'),
    prevScreen: 'user',
    historyMode: 'recent', // 'recent' or 'ranking'
    filterUser: 'all',
    filterDiff: 'all',
    sortConfig: { column: 'created_at', ascending: false },
    viewGlobal: false
};

// DOM 요소
const screens = {
    user: document.getElementById('user-screen'),
    start: document.getElementById('start-screen'),
    game: document.getElementById('game-screen'),
    result: document.getElementById('result-screen'),
    history: document.getElementById('history-screen')
};

const elements = {
    userCards: document.querySelectorAll('.user-card'),
    diffCards: document.querySelectorAll('.diff-card'),
    questionText: document.getElementById('question-text'),
    answerInput: document.getElementById('answer-input'),
    progressBar: document.getElementById('progress-bar'),
    questionNum: document.getElementById('question-number'),
    currentScore: document.getElementById('current-score'),
    finalScore: document.getElementById('final-score'),
    fullHistoryBody: document.getElementById('full-history-body'),
    restartBtn: document.getElementById('restart-btn'),
    homeBtn: document.getElementById('home-btn'),
    changeUserBtn: document.getElementById('change-user-btn'),
    viewAllHistoryBtn: document.getElementById('view-all-history-btn'),
    historyBackBtn: document.getElementById('history-back-btn'),
    gameBackBtn: document.getElementById('game-back-btn'),
    submitBtn: document.getElementById('submit-btn'),
    userBadge: document.getElementById('current-user-badge'),
    mainTitle: document.getElementById('main-title'),
    descEasy: document.getElementById('desc-easy'),
    descNormal: document.getElementById('desc-normal'),
    descHard: document.getElementById('desc-hard'),
    finalTime: document.getElementById('final-time'),
    viewHistoryStartBtn: document.getElementById('view-history-from-start-btn'),
    viewHistoryResultBtn: document.getElementById('view-history-from-result-btn'),
    loadingOverlay: document.getElementById('loading-overlay'),
    tabRecent: document.getElementById('tab-recent'),
    tabRanking: document.getElementById('tab-ranking'),
    filterUser: document.getElementById('filter-user'),
    filterDiff: document.getElementById('filter-diff'),
    historyHeaders: document.querySelectorAll('.sortable-header'),
    firstColHeader: document.getElementById('history-first-col-header')
};

// 오디오 컨텍스트 및 효과음 생성
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// 모바일 브라우저를 위한 오디오 컨텍스트 재개 함수
function resumeAudioContext() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// 첫 사용자 상호작용 시 오디오 컨텍스트 활성화
document.addEventListener('click', resumeAudioContext, { once: true });
document.addEventListener('touchstart', resumeAudioContext, { once: true });
document.addEventListener('keydown', resumeAudioContext, { once: true });

function playSound(type) {
    // 재생 전 컨텍스트 상태 확인 및 재개 시도
    resumeAudioContext();

    const now = audioCtx.currentTime;

    if (type === 'correct') {
        // 도(C5)와 미(E5)의 짧은 화음으로 기분 좋은 소리 생성
        [523.25, 659.25].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + (i * 0.05));

            gain.gain.setValueAtTime(0, now + (i * 0.05));
            gain.gain.linearRampToValueAtTime(0.1, now + (i * 0.05) + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + (i * 0.05) + 0.3);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(now + (i * 0.05));
            osc.stop(now + (i * 0.05) + 0.3);
        });
    } else if (type === 'wrong') {
        // 낮은 주파수의 톱니파로 오답 소리 생성
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(110, now + 0.2);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.3);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.3);
    }
}

// 시간 포맷 변환 (초 -> M분 S초)
function formatDuration(seconds) {
    if (!seconds) return '-';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) {
        return `${m}분 ${s}초`;
    }
    return `${s}초`;
}

// 화면 전환
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');

    // 이전 화면 기록 (통계 화면에서 돌아올 때 사용)
    if (screenName !== 'history') {
        state.prevScreen = screenName;
    }

    if (screenName === 'game') {
        setTimeout(() => elements.answerInput.focus(), 100);
    }
}

// 로딩 표시 관리
function setLoading(isLoading) {
    if (isLoading) {
        elements.loadingOverlay.classList.add('active');
    } else {
        elements.loadingOverlay.classList.remove('active');
    }
}

// 사용자 선택
function selectUser(user) {
    state.currentUser = user;
    elements.userBadge.textContent = user;
    elements.mainTitle.innerHTML = `${user}이를 위한 수학퀴즈<br><span>CHALLENGE</span>`;

    // 난이도 설명 업데이트
    if (user === '재민') {
        elements.descEasy.textContent = '한자리수 + 한자리수';
        elements.descNormal.textContent = '두자리수 + 한자리수';
        elements.descHard.textContent = '두자리수 - 한자리수';
    } else {
        elements.descEasy.textContent = '한자리수 × 한자리수';
        elements.descNormal.textContent = '두자리수 × 한자리수';
        elements.descHard.textContent = '두자리수 × 두자리수';
    }

    showScreen('start');
}

// 문제 생성
function generateQuestions(difficulty) {
    const questions = [];
    const usedQuestions = new Set();
    const isJaemin = state.currentUser === '재민';

    while (questions.length < 10) {
        let a, b, answer, operator;

        if (isJaemin) {
            if (difficulty === 'easy') {
                a = Math.floor(Math.random() * 9) + 1; // 1~9
                b = Math.floor(Math.random() * 9) + 1; // 1~9
                answer = a + b;
                operator = '+';
            } else if (difficulty === 'normal') {
                a = Math.floor(Math.random() * 90) + 10; // 10~99
                b = Math.floor(Math.random() * 9) + 1; // 1~9
                answer = a + b;
                operator = '+';
            } else {
                a = Math.floor(Math.random() * 90) + 10; // 10~99
                b = Math.floor(Math.random() * 9) + 1; // 1~9
                // 큰 수에서 작은 수 빼기
                if (a < b) [a, b] = [b, a];
                answer = a - b;
                operator = '-';
            }
        } else {
            operator = '×';
            if (difficulty === 'easy') {
                a = Math.floor(Math.random() * 8) + 2; // 2~9
                b = Math.floor(Math.random() * 8) + 2; // 2~9
            } else if (difficulty === 'normal') {
                a = Math.floor(Math.random() * 90) + 10; // 10~99
                b = Math.floor(Math.random() * 8) + 2; // 2~9
            } else {
                a = Math.floor(Math.random() * 90) + 10; // 10~99
                b = Math.floor(Math.random() * 90) + 10; // 10~99
            }
            answer = a * b;
        }

        // 중복 체크 (덧셈과 곱셈은 교환법칙이 성립하므로 정렬하여 체크)
        const questionKey = (operator === '+' || operator === '×')
            ? [a, b].sort((x, y) => x - y).join(operator)
            : `${a}${operator}${b}`;

        if (!usedQuestions.has(questionKey)) {
            usedQuestions.add(questionKey);
            questions.push({ a, b, answer, operator });
        }
    }
    return questions;
}

// 게임 시작
function startGame(difficulty) {
    state.difficulty = difficulty;
    state.questions = generateQuestions(difficulty);
    state.currentIndex = 0;
    state.score = 0;
    state.startTime = Date.now();

    updateGameUI();
    showScreen('game');
}

// 게임 UI 업데이트
function updateGameUI() {
    const q = state.questions[state.currentIndex];
    elements.questionText.textContent = `${q.a} ${q.operator} ${q.b}`;
    elements.questionNum.textContent = `${state.currentIndex + 1} / 10`;
    elements.currentScore.textContent = `Score: ${state.score}`;
    elements.progressBar.style.width = `${(state.currentIndex / 10) * 100}%`;
    elements.answerInput.value = '';
}

// 정답 확인
function checkAnswer() {
    // [추가] 이미 10문제를 다 풀었다면 더 이상 로직을 실행하지 않음
    if (state.currentIndex >= 10) return;

    const userAnswer = parseInt(elements.answerInput.value);
    const correctAnswer = state.questions[state.currentIndex].answer;

    if (userAnswer === correctAnswer) {
        state.score++;
        playSound('correct');
        document.body.classList.add('correct-flash');
        setTimeout(() => document.body.classList.remove('correct-flash'), 500);
    } else {
        playSound('wrong');
        elements.answerInput.classList.add('wrong-shake');
        setTimeout(() => elements.answerInput.classList.remove('wrong-shake'), 400);
    }

    state.currentIndex++;

    if (state.currentIndex < 10) {
        updateGameUI();
    } else {
        endGame();
    }
}

// 게임 종료
async function endGame() {
    const endTime = Date.now();
    const duration = Math.floor((endTime - state.startTime) / 1000);
    const formattedDuration = formatDuration(duration);

    elements.finalScore.textContent = `${state.score} / 10`;
    elements.finalTime.textContent = `소요 시간: ${formattedDuration}`;

    // 1. Supabase에 저장할 데이터 객체 만들기 (DB 컬럼명과 일치해야 함)
    const resultForDB = {
        user_name: state.currentUser,
        difficulty: state.difficulty,
        score: state.score,
        duration: duration
    };

    // 2. Supabase로 데이터 전송 (비동기 처리)
    const { data, error } = await supabaseClient
        .from('quiz_results')
        .insert([resultForDB]);

    if (error) {
        console.error('Supabase 저장 실패:', error.message);
    } else {
        console.log('Supabase에 성공적으로 저장되었습니다!');
    }

    // (기존 로직) 로컬 히스토리 업데이트 및 화면 전환
    const resultForLocal = {
        user: state.currentUser,
        date: new Date().toLocaleString('ko-KR'),
        difficulty: state.difficulty,
        score: state.score,
        duration: duration
    };
    state.history.unshift(resultForLocal);
    localStorage.setItem('gugudan-history-v2', JSON.stringify(state.history));

    showScreen('result');
}

// 전체 기록 및 랭킹 UI 업데이트
async function updateFullHistoryUI() {
    // viewGlobal 모드가 아닐 때만 사용자 체크
    if (!state.viewGlobal && !state.currentUser) {
        elements.fullHistoryBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">사용자를 선택해 주세요.</td></tr>`;
        return;
    }

    setLoading(true);

    // 헤더 텍스트 변경
    elements.firstColHeader.textContent = state.historyMode === 'recent' ? '날짜' : '순위';

    let query = supabaseClient
        .from('quiz_results')
        .select('*');

    // 필터 적용
    if (!state.viewGlobal) {
        // 특정 사용자 화면에서 진입한 경우 해당 사용자만
        query = query.eq('user_name', state.currentUser);
        // 필터 UI도 해당 사용자로 고정 (시각적 일관성)
        elements.filterUser.value = state.currentUser;
        elements.filterUser.disabled = true;
    } else {
        elements.filterUser.disabled = false;
        if (state.filterUser !== 'all') {
            query = query.eq('user_name', state.filterUser);
        }
    }

    if (state.filterDiff !== 'all') {
        query = query.eq('difficulty', state.filterDiff);
    }

    // 정렬 적용
    if (state.historyMode === 'recent') {
        query = query.order(state.sortConfig.column, { ascending: state.sortConfig.ascending });
    } else {
        // 명예의 전당 기본 정렬
        query = query.order('score', { ascending: false }).order('duration', { ascending: true });
    }

    const { data: results, error } = await query.limit(30);

    setLoading(false);

    if (error) {
        console.error('기록 로드 실패:', error.message);
        elements.fullHistoryBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">기록을 로드할 수 없습니다.</td></tr>`;
        return;
    }

    if (!results || results.length === 0) {
        const msg = state.viewGlobal ? '해당하는 기록이 없습니다.' : `${state.currentUser}님의 기록이 없습니다. 도전을 시작해보세요!`;
        elements.fullHistoryBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">${msg}</td></tr>`;
        return;
    }

    elements.fullHistoryBody.innerHTML = results.map((h, index) => {
        const dateObj = new Date(h.created_at);
        const dateStr = `${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

        // 랭킹 모드일 때 메달 표시
        let rankPrefix = '';
        if (state.historyMode === 'ranking') {
            if (index === 0) rankPrefix = '🥇 ';
            else if (index === 1) rankPrefix = '🥈 ';
            else if (index === 2) rankPrefix = '🥉 ';
            else rankPrefix = `${index + 1}. `;
        }

        return `
            <tr>
                <td>${state.historyMode === 'recent' ? dateStr : rankPrefix}</td>
                <td style="font-weight:700;">${h.user_name}</td> 
                <td>${h.difficulty}</td>
                <td style="color:var(--secondary); font-weight:700;">${h.score} / 10</td>
                <td>${formatDuration(h.duration)}</td>
            </tr>
        `;
    }).join('');
}

// 이벤트 리스너
elements.userCards.forEach(card => {
    card.addEventListener('click', () => {
        selectUser(card.dataset.user);
    });
});

elements.diffCards.forEach(card => {
    card.addEventListener('click', () => {
        startGame(card.dataset.difficulty);
    });
});

elements.answerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && elements.answerInput.value !== '') {
        checkAnswer();
    }
});

elements.submitBtn.addEventListener('click', () => {
    if (elements.answerInput.value !== '') {
        checkAnswer();
    }
});

elements.restartBtn.addEventListener('click', () => {
    startGame(state.difficulty);
});

elements.homeBtn.addEventListener('click', () => {
    showScreen('start');
});

elements.changeUserBtn.addEventListener('click', () => {
    showScreen('user');
});

elements.viewAllHistoryBtn.addEventListener('click', () => {
    state.viewGlobal = true;
    state.filterUser = 'all';
    state.filterDiff = 'all';
    elements.filterUser.value = 'all';
    elements.filterDiff.value = 'all';
    updateFullHistoryUI();
    showScreen('history');
});

elements.viewHistoryStartBtn.addEventListener('click', () => {
    state.viewGlobal = false;
    updateFullHistoryUI();
    showScreen('history');
});

elements.viewHistoryResultBtn.addEventListener('click', () => {
    state.viewGlobal = false;
    updateFullHistoryUI();
    showScreen('history');
});

elements.historyBackBtn.addEventListener('click', () => {
    showScreen(state.prevScreen || 'user');
});

elements.gameBackBtn.addEventListener('click', () => {
    if (confirm('게임을 중단하고 나가시겠습니까?')) {
        showScreen('start');
    }
});

// 탭 전환 이벤트
elements.tabRecent.addEventListener('click', () => {
    state.historyMode = 'recent';
    elements.tabRecent.classList.add('active');
    elements.tabRanking.classList.remove('active');
    updateFullHistoryUI();
});

elements.tabRanking.addEventListener('click', () => {
    state.historyMode = 'ranking';
    elements.tabRanking.classList.add('active');
    elements.tabRecent.classList.remove('active');
    updateFullHistoryUI();
});

// 필터 변경 이벤트
elements.filterUser.addEventListener('change', (e) => {
    state.filterUser = e.target.value;
    updateFullHistoryUI();
});

elements.filterDiff.addEventListener('change', (e) => {
    state.filterDiff = e.target.value;
    updateFullHistoryUI();
});

// 헤더 정렬 이벤트
elements.historyHeaders.forEach(header => {
    header.addEventListener('click', () => {
        const column = header.dataset.sort;
        if (state.sortConfig.column === column) {
            state.sortConfig.ascending = !state.sortConfig.ascending;
        } else {
            state.sortConfig.column = column;
            state.sortConfig.ascending = true;
        }

        // UI 업데이트 (화살표 표시)
        elements.historyHeaders.forEach(h => {
            h.classList.remove('asc', 'desc');
        });
        header.classList.add(state.sortConfig.ascending ? 'asc' : 'desc');

        updateFullHistoryUI();
    });
});

// 초기화
// (기록은 '기록 확인' 버튼을 누를 때 업데이트됨)
