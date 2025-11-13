// Состояние приложения
let allQuestions = [];  // Все вопросы из базы
let questions = [];      // Вопросы текущей сессии
let currentQuestionIndex = 0;
let correctAnswersCount = 0;
let wrongAnswersCount = 0;
let currentMode = null;  // 'training' или 'test'
let inactivityTimer = null;  // Таймер бездействия
let currentSessionId = null;  // ID текущей сессии на backend
let userUuid = null;  // UUID пользователя
let topWrongQuestions = [];  // Вопросы с ошибками

// Backend API URL
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : '/api';  // В продакшне API на том же домене

// DOM элементы
const startScreen = document.getElementById('startScreen');
const questionScreen = document.getElementById('questionScreen');
const resultScreen = document.getElementById('resultScreen');
const infoScreen = document.getElementById('infoScreen');
const trainingBtn = document.getElementById('trainingBtn');
const testBtn = document.getElementById('testBtn');
const nextBtn = document.getElementById('nextBtn');
const exitBtn = document.getElementById('exitBtn');
const restartBtn = document.getElementById('restartBtn');
const homeBtn = document.getElementById('homeBtn');
const infoBtn = document.getElementById('infoBtn');
const backToHomeBtn = document.getElementById('backToHomeBtn');
const headerTitle = document.getElementById('headerTitle');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const totalQuestionsSpan = document.getElementById('totalQuestions');
const currentQuestionNum = document.getElementById('currentQuestionNum');
const questionText = document.getElementById('questionText');
const questionImageContainer = document.getElementById('questionImageContainer');
const questionImage = document.getElementById('questionImage');
const answersContainer = document.getElementById('answersContainer');
const feedback = document.getElementById('feedback');

// Функции для работы с UUID пользователя
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getUserUUID() {
    let uuid = localStorage.getItem('userUUID');
    if (!uuid) {
        uuid = generateUUID();
        localStorage.setItem('userUUID', uuid);
        console.log('✅ Создан новый UUID пользователя:', uuid);
    }
    return uuid;
}

// Функции для работы с backend API
async function apiRequest(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.warn('⚠️ Ошибка API запроса:', error.message);
        // Приложение продолжает работать без backend
        return null;
    }
}

async function startBackendSession(mode) {
    const result = await apiRequest('/session-start', 'POST', {
        userUuid: userUuid,
        mode: mode
    });

    if (result && result.sessionId) {
        currentSessionId = result.sessionId;
        console.log('✅ Сессия создана на backend:', currentSessionId);
    }
}

async function logBackendAnswer(questionId, isCorrect) {
    if (!currentSessionId) return;

    await apiRequest('/answer', 'POST', {
        sessionId: currentSessionId,
        questionId: questionId,
        isCorrect: isCorrect
    });
}

async function endBackendSession() {
    if (!currentSessionId) return;

    await apiRequest('/session-end', 'POST', {
        sessionId: currentSessionId,
        correctAnswers: correctAnswersCount,
        wrongAnswers: wrongAnswersCount,
        topWrongQuestions: topWrongQuestions
    });

    console.log('✅ Сессия завершена на backend');
    currentSessionId = null;
    topWrongQuestions = [];
}

// Функции для работы с localStorage
function saveState() {
    const state = {
        currentMode: currentMode,
        currentQuestionIndex: currentQuestionIndex,
        correctAnswersCount: correctAnswersCount,
        wrongAnswersCount: wrongAnswersCount,
        questions: questions,
        shuffleMode: document.getElementById('shuffleCheckbox')?.checked || false
    };
    localStorage.setItem('quizAppState', JSON.stringify(state));
}

function loadState() {
    const savedState = localStorage.getItem('quizAppState');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            currentMode = state.currentMode;
            currentQuestionIndex = state.currentQuestionIndex;
            correctAnswersCount = state.correctAnswersCount;
            wrongAnswersCount = state.wrongAnswersCount;
            questions = state.questions;

            // Восстанавливаем чекбокс перемешивания
            const shuffleCheckbox = document.getElementById('shuffleCheckbox');
            if (shuffleCheckbox) {
                shuffleCheckbox.checked = state.shuffleMode;
            }

            return true;
        } catch (error) {
            console.error('Ошибка загрузки состояния:', error);
            clearState();
            return false;
        }
    }
    return false;
}

function clearState() {
    localStorage.removeItem('quizAppState');
}

// Загрузка вопросов из JSON
async function loadQuestions() {
    try {
        const response = await fetch('questions_data.json');
        if (!response.ok) {
            throw new Error('Не удалось загрузить вопросы');
        }
        allQuestions = await response.json();
        totalQuestionsSpan.textContent = allQuestions.length;
    } catch (error) {
        alert('Ошибка загрузки вопросов: ' + error.message);
        console.error(error);
    }
}

// Получить случайные вопросы
function getRandomQuestions(count) {
    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Перемешать массив (алгоритм Fisher-Yates)
function shuffleArray(array) {
    const shuffled = [...array]; // Создаем копию
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Варианты текста для кнопки "Выйти"
const exitButtonTexts = [
    'Сдаюсь!',
    'Хватит!',
    'Отдыхаю',
    'Пауза',
    'Передышка',
    'Катапульта!',
    'Устал 😩',
    'Бегство 🏃',
    'Пойду пить чай',
    'Хватит уже',
    'Мне хватит',
    'Перерыв',
    'Ухожу',
    'Пора домой',
    'Обе машины стоп!',
    'Сдаюсь!',
    'Хватит!',
    'Отдыхаю',
    'Пауза',
    'Передышка',
    'Катапульта!',
    'Устал 😩',
    'Бегство 🏃',
    'Пойду пить чай',
    'Хватит уже',
    'Мне хватит',
    'Перерыв',
    'Ухожу',
    'Пора домой',
    'Стоп тест',
    'С меня хватит',
    'Выход 🚪',
    'Покеда!',
    'Баста!',
    'Хватит мучить',
    'Отбой',
    'Стоп! ✋', 
    'До свидания',
    'Game Over 💀',
    'Финиш',
    'Пора свалить',
    'Спасите 😅',
    'Хватит ну 😤',
    'Вырубаюсь',
    'Сил нет 😩'
     ]

// Установить случайный текст для кнопки "Выйти"
function randomizeExitButtonText() {
    const randomText = exitButtonTexts[Math.floor(Math.random() * exitButtonTexts.length)];
    exitBtn.textContent = randomText;
}


// Показать экран
function showScreen(screen) {
    startScreen.classList.add('hidden');
    questionScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    infoScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// Обновить прогресс-бар
function updateProgress() {
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
    progressBar.style.width = progress + '%';
    progressText.textContent = `Вопрос ${currentQuestionIndex + 1} из ${questions.length}`;
}

// Сбросить таймер бездействия
function resetInactivityTimer() {
    // Очищаем предыдущий таймер
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }

    // Запускаем новый таймер на 1 минуту (60000 мс)
    inactivityTimer = setTimeout(() => {
        showInactivityModal();
    }, 60000);
}

// Остановить таймер бездействия
function stopInactivityTimer() {
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }
}

// Показать всплывающее окно бездействия
function showInactivityModal() {
    if (currentMode === 'test') {
        // Режим теста: показываем окно с предложением пропустить
        const modal = document.getElementById('inactivityModal');
        document.getElementById('modalTitle').textContent = 'Нужна помощь?';
        document.getElementById('modalText').textContent = 'Хотите пропустить вопрос?';
        document.getElementById('skipBtn').style.display = 'inline-block';
        document.getElementById('hintText').style.display = 'none';
        modal.classList.remove('hidden');
    } else if (currentMode === 'training') {
        // Режим тренировки: показываем подсказку с правильным ответом
        const question = questions[currentQuestionIndex];
        let correctAnswerText = question.right_answer;

        // Извлекаем правильный ответ из текста
        const patterns = [
            /Правильный ответ:\s*(.+)/i,
            /The correct answer is:\s*(.+)/i,
            /Ответ:\s*(.+)/i
        ];
        for (const pattern of patterns) {
            const match = correctAnswerText.match(pattern);
            if (match) {
                correctAnswerText = match[1].trim();
                break;
            }
        }

        const modal = document.getElementById('inactivityModal');
        document.getElementById('modalTitle').textContent = 'Подсказка';
        document.getElementById('modalText').textContent = 'Правильный ответ:';
        document.getElementById('skipBtn').style.display = 'none';
        document.getElementById('hintText').textContent = correctAnswerText;
        document.getElementById('hintText').style.display = 'block';
        modal.classList.remove('hidden');
    }
}

// Скрыть всплывающее окно бездействия
function hideInactivityModal() {
    const modal = document.getElementById('inactivityModal');
    modal.classList.add('hidden');
    resetInactivityTimer();
}

// Пропустить вопрос
function skipQuestion() {
    hideInactivityModal();

    // Получаем текущий вопрос
    const question = questions[currentQuestionIndex];

    // Считаем пропуск как неправильный ответ
    wrongAnswersCount++;

    // Добавляем вопрос в список неправильных ответов
    topWrongQuestions.push({
        question_id: question.question_number
    });

    // Логируем пропуск на backend как неправильный ответ
    logBackendAnswer(question.question_number, false);

    saveState();
    nextQuestion();
}

// Отобразить вопрос
function displayQuestion() {
    if (currentQuestionIndex >= questions.length) {
        showResults();
        return;
    }

    const question = questions[currentQuestionIndex];
    
    // Рандомизируем текст кнопки "Выйти"
    randomizeExitButtonText();


    // Обновляем номер вопроса
    currentQuestionNum.textContent = currentQuestionIndex + 1;

    // Обновляем текст вопроса
    questionText.textContent = question.question_text;

    // Обрабатываем изображение
    if (question.image_file && question.image_file !== '') {
        questionImageContainer.classList.remove('hidden');
        questionImage.src = 'img/' + question.image_file;
        questionImage.alt = 'Изображение к вопросу ' + question.question_number;
    } else {
        questionImageContainer.classList.add('hidden');
    }

    // Очищаем предыдущие ответы и feedback
    answersContainer.innerHTML = '';
    feedback.textContent = '';
    feedback.className = 'feedback';
    nextBtn.disabled = true;

    // Перемешиваем ответы для режима тренировки
    let answersToDisplay = question.answers;
    if (currentMode === 'training') {
        answersToDisplay = shuffleArray(question.answers);
    }

    // Создаем варианты ответов
    answersToDisplay.forEach((answer, index) => {
        const answerDiv = document.createElement('div');
        answerDiv.className = 'answer-option';
        // Используем порядковый номер после перемешивания (index + 1)
        answerDiv.textContent = (index + 1) + '. ' + answer.text;
        answerDiv.dataset.index = index;
        answerDiv.dataset.flag = answer.flag;
        answerDiv.addEventListener('click', () => selectAnswer(answerDiv, question));
        answersContainer.appendChild(answerDiv);
    });

    // Обновляем прогресс
    updateProgress();

    // Запускаем таймер бездействия
    resetInactivityTimer();
}

// Выбор ответа
function selectAnswer(answerElement, question) {
    // Если ответ уже выбран, игнорируем клик
    const allAnswers = answersContainer.querySelectorAll('.answer-option');
    if (Array.from(allAnswers).some(el => el.classList.contains('disabled'))) {
        return;
    }

    // Останавливаем таймер при выборе ответа
    stopInactivityTimer();

    // Убираем выделение со всех ответов
    allAnswers.forEach(el => el.classList.remove('selected'));

    // Выделяем выбранный ответ
    answerElement.classList.add('selected');

    // Проверяем ответ
    checkAnswer(answerElement, question);
}

// Проверка ответа
function checkAnswer(answerElement, question) {
    const allAnswers = answersContainer.querySelectorAll('.answer-option');

    // Блокируем все ответы
    allAnswers.forEach(el => el.classList.add('disabled'));

    // Проверяем, правильный ли ответ (используем dataset.flag)
    const isCorrect = answerElement.dataset.flag === 'true';

    if (isCorrect) {
        answerElement.classList.add('correct');
        feedback.textContent = 'Правильно!';
        feedback.classList.add('correct');
        correctAnswersCount++;
    } else {
        answerElement.classList.add('wrong');

        // Формируем сообщение с правильным ответом
        let feedbackHTML = 'Неправильно.'
        // Добавляем информацию о документе
        if (question.document_text && question.document_text !== '') {
            feedbackHTML += '<br><br><span class="document-text">' + question.document_text + '</span>';
        }

        if (question.document_link && question.document_link !== '') {
            feedbackHTML += '<br><a href="' + question.document_link + '" target="_blank">Ссылка на документ</a>';
        }

        feedback.innerHTML = feedbackHTML;
        feedback.classList.add('wrong');
        wrongAnswersCount++;

        // Добавляем вопрос в список неправильных ответов
        topWrongQuestions.push({
            question_id: question.question_number
        });

        // Подсвечиваем правильный ответ
        allAnswers.forEach(el => {
            if (el.dataset.flag === 'true') {
                el.classList.add('correct');
            }
        });
    }

    // Логируем ответ на backend
    logBackendAnswer(question.question_number, isCorrect);

    // Активируем кнопку "Следующий вопрос"
    nextBtn.disabled = false;

    // Сохраняем состояние
    saveState();
}

// Следующий вопрос
function nextQuestion() {
    currentQuestionIndex++;
    saveState();
    displayQuestion();
}

// Показать результаты
async function showResults() {
    const answeredQuestions = correctAnswersCount + wrongAnswersCount;
    const percentage = answeredQuestions > 0 ? Math.round((correctAnswersCount / answeredQuestions) * 100) : 0;

    document.getElementById('correctAnswers').textContent = correctAnswersCount;
    document.getElementById('wrongAnswers').textContent = wrongAnswersCount;
    document.getElementById('scorePercentage').textContent = percentage + '%';
    document.getElementById('answeredQuestions').textContent = answeredQuestions;

    // Останавливаем таймер бездействия
    stopInactivityTimer();

    // Отправляем результаты на backend
    await endBackendSession();

    showScreen(resultScreen);
}

// Начать режим обучения
async function startTraining() {
    currentMode = 'training';

    // Проверяем, нужно ли перемешивать вопросы
    const shuffleCheckbox = document.getElementById('shuffleCheckbox');
    if (shuffleCheckbox.checked) {
        questions = shuffleArray(allQuestions);
    } else {
        questions = [...allQuestions];  // Все вопросы в исходном порядке
    }

    currentQuestionIndex = 0;
    correctAnswersCount = 0;
    wrongAnswersCount = 0;
    topWrongQuestions = [];

    // Создаем сессию на backend
    await startBackendSession('training');

    saveState();
    showScreen(questionScreen);
    displayQuestion();
}

// Начать режим теста
async function startTest() {
    currentMode = 'test';
    questions = getRandomQuestions(45);  // 45 случайных вопросов
    currentQuestionIndex = 0;
    correctAnswersCount = 0;
    wrongAnswersCount = 0;
    topWrongQuestions = [];

    // Создаем сессию на backend
    await startBackendSession('test');

    saveState();
    showScreen(questionScreen);
    displayQuestion();
}

// Начать заново
function restartTest() {
    if (currentMode === 'training') {
        startTraining();
    } else {
        startTest();
    }
}

// Вернуться к выбору режима
function goToStart() {
    currentMode = null;
    currentQuestionIndex = 0;
    correctAnswersCount = 0;
    wrongAnswersCount = 0;

    // Останавливаем таймер
    stopInactivityTimer();

    // Очищаем сохраненное состояние
    clearState();

    // Сбрасываем прогресс-бар
    progressBar.style.width = '0%';
    progressText.textContent = 'Вопрос 0 из 0';

    showScreen(startScreen);
}

// События
trainingBtn.addEventListener('click', startTraining);
testBtn.addEventListener('click', startTest);
nextBtn.addEventListener('click', nextQuestion);
exitBtn.addEventListener('click', showResults);
restartBtn.addEventListener('click', restartTest);
homeBtn.addEventListener('click', goToStart);
infoBtn.addEventListener('click', () => showScreen(infoScreen));
backToHomeBtn.addEventListener('click', goToStart);
headerTitle.addEventListener('click', goToStart);

// События для модального окна
document.getElementById('skipBtn').addEventListener('click', skipQuestion);
document.getElementById('continueBtn').addEventListener('click', hideInactivityModal);

// Инициализация
async function initApp() {
    // Получаем или создаем UUID пользователя
    userUuid = getUserUUID();

    // Загружаем вопросы
    await loadQuestions();

    // Пытаемся восстановить состояние
    if (loadState() && questions.length > 0) {
        // Состояние успешно загружено, восстанавливаем экран
        showScreen(questionScreen);
        displayQuestion();
    } else {
        // Нет сохраненного состояния, показываем стартовый экран
        showScreen(startScreen);
    }
}

initApp();
