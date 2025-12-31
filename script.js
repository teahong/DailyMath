// Supabase 연결 설정
const SUPABASE_URL = 'https://hsoktyzjmqqpitqjoasx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhzb2t0eXpqbXFxcGl0cWpvYXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTE3MTIsImV4cCI6MjA4Mjc2NzcxMn0.x6kRqsXsoI7qhZYnshTbGoqavh2IMmRZMainTQ89pWI';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 게임 상태 관리
const state = {
    screen: 'user',
    currentUser: '',
    difficulty: 'easy',
    questions: [],
    currentIndex: 0,
    score: 0,
    startTime: 0,
    history: JSON.parse(localStorage.getItem('gugudan-history-v2') || '[]')
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
    descHard: document.getElementById('desc-hard')
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
    state.screen = screenName;

    if (screenName === 'game') {
        setTimeout(() => elements.answerInput.focus(), 100);
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
    elements.finalScore.textContent = `${state.score} / 10`;

    const endTime = Date.now();
    const duration = Math.floor((endTime - state.startTime) / 1000);

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

// 전체 기록 UI 업데이트
async function updateFullHistoryUI() {
    // 1. Supabase에서 최신 기록 20개 가져오기
    // created_at 기준으로 내림차순(최신순) 정렬합니다.
    const { data: results, error } = await supabaseClient
        .from('quiz_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('기록 로드 실패:', error.message);
        return;
    }

    // 2. UI 업데이트 (DB 컬럼명인 user_name을 사용해야 함에 주의!)
    elements.fullHistoryBody.innerHTML = results.map(h => `
        <tr>
            <td>${h.user_name}</td> 
            <td>${h.difficulty}</td>
            <td>${h.score} / 10</td>
            <td>${formatDuration(h.duration)}</td>
        </tr>
    `).join('');
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
    updateFullHistoryUI();
    showScreen('history');
});

elements.historyBackBtn.addEventListener('click', () => {
    showScreen('user');
});

elements.gameBackBtn.addEventListener('click', () => {
    if (confirm('게임을 중단하고 나가시겠습니까?')) {
        showScreen('start');
    }
});

// 초기화
// (기록은 '기록 확인' 버튼을 누를 때 업데이트됨)
