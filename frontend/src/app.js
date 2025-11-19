// Состояние приложения
// ⚠️ Вопросы больше не хранятся на клиенте! Загружаются с сервера по одному.
let currentQuestionIndex = 0;
let correctAnswersCount = 0;
let wrongAnswersCount = 0;
let currentMode = null;  // 'training' или 'test'
let inactivityTimer = null;  // Таймер бездействия
let currentSessionId = null;  // ID текущей сессии на backend
let sessionToken = null;  // Токен сессии для защищенных запросов
let userUuid = null;  // UUID пользователя
let topWrongQuestions = [];  // Вопросы с ошибками
let totalQuestionsInSession = 0;  // Общее количество вопросов в сессии
let currentQuestion = null;  // Текущий загруженный вопрос

// Backend API URL
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001/api'
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
const continueTestBtn = document.getElementById('continueTestBtn');
const restartBtn = document.getElementById('restartBtn');
const homeBtn = document.getElementById('homeBtn');
const infoBtn = document.getElementById('infoBtn');
const statsBtn = document.getElementById('statsBtn');
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
async function apiRequest(endpoint, method = 'GET', data = null, includeToken = false) {
    try {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        // Добавляем session token для защищенных запросов
        if (includeToken && sessionToken) {
            options.headers['X-Session-Token'] = sessionToken;
        }

        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('⚠️ Ошибка API запроса:', error.message);
        throw error;
    }
}

async function startBackendSession(mode) {
    try {
        const result = await apiRequest('/session-start', 'POST', {
            userUuid: userUuid,
            mode: mode
        });

        if (result && result.success) {
            currentSessionId = result.sessionId;
            sessionToken = result.sessionToken;
            totalQuestionsInSession = result.totalQuestions;

            // Сохраняем в localStorage для восстановления
            saveSessionState();

            console.log('✅ Сессия создана:', currentSessionId);
            console.log('📊 Всего вопросов:', totalQuestionsInSession);
            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ Ошибка создания сессии:', error);
        alert('Ошибка подключения к серверу. Проверьте интернет-соединение.');
        return false;
    }
}

// Загрузить следующий вопрос с сервера
async function loadNextQuestion() {
    try {
        const result = await apiRequest(
            `/session/${currentSessionId}/next`,
            'GET',
            null,
            true
        );

        if (result.completed) {
            // Все вопросы завершены
            return null;
        }

        if (result.success && result.question) {
            currentQuestion = result.question;
            currentQuestionIndex = result.questionIndex - 1; // API возвращает 1-based
            totalQuestionsInSession = result.totalQuestions;

            console.log(`✅ Загружен вопрос ${result.questionIndex}/${result.totalQuestions}`);
            return currentQuestion;
        }

        return null;
    } catch (error) {
        console.error('❌ Ошибка загрузки вопроса:', error);
        alert('Ошибка загрузки вопроса. Проверьте подключение.');
        return null;
    }
}

// Отправить ответ на сервер для проверки
async function submitAnswerToServer(questionNumber, answerId) {
    try {
        const result = await apiRequest(
            `/session/${currentSessionId}/submit-answer`,
            'POST',
            { questionNumber, answerId },
            true
        );

        if (result.success) {
            return {
                isCorrect: result.isCorrect,
                correctAnswerId: result.correctAnswerId,
                correctAnswerText: result.correctAnswerText
            };
        }

        return null;
    } catch (error) {
        console.error('❌ Ошибка проверки ответа:', error);
        alert('Ошибка проверки ответа. Попробуйте еще раз.');
        return null;
    }
}

// Логировать смену фокуса на сервере
async function logFocusSwitchToServer() {
    if (!currentSessionId || !sessionToken) return;

    try {
        await apiRequest(
            `/session/${currentSessionId}/focus-switch`,
            'POST',
            {},
            true
        );
        console.log('📝 Смена фокуса залогирована');
    } catch (error) {
        console.warn('⚠️ Ошибка логирования смены фокуса:', error);
    }
}

async function endBackendSession() {
    if (!currentSessionId) return;

    try {
        await apiRequest('/session-end', 'POST', {
            sessionId: currentSessionId,
            correctAnswers: correctAnswersCount,
            wrongAnswers: wrongAnswersCount,
            topWrongQuestions: topWrongQuestions
        });

        console.log('✅ Сессия завершена на backend');
    } catch (error) {
        console.error('❌ Ошибка завершения сессии:', error);
    }

    currentSessionId = null;
    sessionToken = null;
    topWrongQuestions = [];
}

// Функции для работы с localStorage (ЗАЩИЩЕННАЯ ВЕРСИЯ - не сохраняем вопросы!)
function saveSessionState() {
    const state = {
        currentSessionId: currentSessionId,
        sessionToken: sessionToken,
        currentMode: currentMode,
        currentQuestionIndex: currentQuestionIndex,
        correctAnswersCount: correctAnswersCount,
        wrongAnswersCount: wrongAnswersCount,
        totalQuestionsInSession: totalQuestionsInSession
        // ⚠️ НЕ сохраняем вопросы и правильные ответы!
    };
    localStorage.setItem('quizAppState', JSON.stringify(state));
}

function loadSessionState() {
    const savedState = localStorage.getItem('quizAppState');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            currentSessionId = state.currentSessionId;
            sessionToken = state.sessionToken;
            currentMode = state.currentMode;
            currentQuestionIndex = state.currentQuestionIndex || 0;
            correctAnswersCount = state.correctAnswersCount || 0;
            wrongAnswersCount = state.wrongAnswersCount || 0;
            totalQuestionsInSession = state.totalQuestionsInSession || 0;

            console.log('✅ Состояние сессии восстановлено из localStorage');
            return true;
        } catch (error) {
            console.error('Ошибка загрузки состояния:', error);
            clearSessionState();
            return false;
        }
    }
    return false;
}

function clearSessionState() {
    localStorage.removeItem('quizAppState');
    currentSessionId = null;
    sessionToken = null;
}

// ⚠️ Старые функции loadQuestions() и getRandomQuestions() удалены
// Теперь вопросы загружаются с защищенного backend API по одному через loadNextQuestion()

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

    // Отключаем клик по заголовку во время прохождения теста
    if (screen === questionScreen) {
        headerTitle.style.cursor = 'default';
        headerTitle.style.pointerEvents = 'none';
    } else {
        headerTitle.style.cursor = 'pointer';
        headerTitle.style.pointerEvents = 'auto';
    }
}

// Обновить прогресс-бар
function updateProgress() {
    const progress = ((currentQuestionIndex + 1) / totalQuestionsInSession) * 100;
    progressBar.style.width = progress + '%';
    progressText.textContent = `Вопрос ${currentQuestionIndex + 1} из ${totalQuestionsInSession}`;
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
    if (!currentQuestion) return;

    if (currentMode === 'test') {
        // Режим теста: показываем окно с предложением пропустить
        const modal = document.getElementById('inactivityModal');
        document.getElementById('modalTitle').textContent = 'Нужна помощь?';
        document.getElementById('modalText').textContent = 'Хотите пропустить вопрос?';
        document.getElementById('skipBtn').style.display = 'inline-block';
        document.getElementById('hintText').style.display = 'none';
        modal.classList.remove('hidden');
    } else if (currentMode === 'training') {
        // Режим тренировки: НЕ показываем правильный ответ (его нет на клиенте!)
        const modal = document.getElementById('inactivityModal');
        document.getElementById('modalTitle').textContent = 'Подсказка';
        document.getElementById('modalText').textContent = 'Попробуйте еще раз или пропустите вопрос';
        document.getElementById('skipBtn').style.display = 'inline-block';
        document.getElementById('hintText').style.display = 'none';
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
async function skipQuestion() {
    hideInactivityModal();

    if (!currentQuestion) return;

    // Считаем пропуск как неправильный ответ
    wrongAnswersCount++;

    // Добавляем вопрос в список неправильных ответов
    topWrongQuestions.push({
        question_id: currentQuestion.question_number
    });

    // Отправляем на сервер: пропуск = неправильный ответ (выбираем первый ID как "неправильный")
    await submitAnswerToServer(currentQuestion.question_number, currentQuestion.answers[0].id);

    saveSessionState();
    await nextQuestion();
}

// Отобразить вопрос
function displayQuestion(question) {
    if (!question) {
        showResults();
        return;
    }

    // Рандомизируем текст кнопки "Выйти"
    randomizeExitButtonText();

    // Обновляем номер вопроса
    currentQuestionNum.textContent = currentQuestionIndex + 1;
    totalQuestionsSpan.textContent = totalQuestionsInSession;

    // Обновляем текст вопроса
    questionText.textContent = question.question_text;

    // Обрабатываем изображение
    if (question.image_file && question.image_file !== '') {
        questionImageContainer.classList.remove('hidden');
        questionImage.src = 'public/img/' + question.image_file;
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

    // Создаем варианты ответов (БЕЗ flag - его нет в защищенном API!)
    answersToDisplay.forEach((answer, index) => {
        const answerDiv = document.createElement('div');
        answerDiv.className = 'answer-option';
        answerDiv.textContent = (index + 1) + '. ' + answer.text;
        answerDiv.dataset.answerId = answer.id; // Сохраняем ID для отправки на сервер
        answerDiv.addEventListener('click', () => selectAnswer(answerDiv, question));
        answersContainer.appendChild(answerDiv);
    });

    // Обновляем прогресс
    updateProgress();

    // Запускаем таймер бездействия
    resetInactivityTimer();
}

// Выбор ответа
async function selectAnswer(answerElement, question) {
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

    // Проверяем ответ (отправляем на сервер для проверки)
    await checkAnswer(answerElement, question);
}

// Проверка ответа (ЗАЩИЩЕННАЯ ВЕРСИЯ - проверка на сервере)
async function checkAnswer(answerElement, question) {
    const allAnswers = answersContainer.querySelectorAll('.answer-option');

    // Блокируем все ответы
    allAnswers.forEach(el => el.classList.add('disabled'));

    // Получаем ID выбранного ответа
    const selectedAnswerId = parseInt(answerElement.dataset.answerId);

    // Отправляем на сервер для проверки
    const result = await submitAnswerToServer(question.question_number, selectedAnswerId);

    if (!result) {
        // Ошибка связи
        feedback.textContent = 'Ошибка проверки ответа';
        feedback.classList.add('wrong');
        return;
    }

    const isCorrect = result.isCorrect;

    if (isCorrect) {
        answerElement.classList.add('correct');
        feedback.textContent = 'Правильно!';
        feedback.classList.add('correct');
        correctAnswersCount++;
    } else {
        answerElement.classList.add('wrong');

        // Формируем сообщение с правильным ответом
        let feedbackHTML = 'Неправильно.';

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

        // Подсвечиваем правильный ответ (получен с сервера)
        allAnswers.forEach(el => {
            if (parseInt(el.dataset.answerId) === result.correctAnswerId) {
                el.classList.add('correct');
            }
        });
    }

    // Активируем кнопку "Следующий вопрос"
    nextBtn.disabled = false;

    // Сохраняем состояние
    saveSessionState();
}

// Следующий вопрос (загружаем с сервера)
async function nextQuestion() {
    saveSessionState();
    await loadAndDisplayNextQuestion();
}

// Показать результаты
async function showResults(forceEnd = false) {
    // Останавливаем таймер бездействия
    stopInactivityTimer();

    let allQuestionsCompleted = false;

    // Получаем актуальные счетчики и состояние сессии с сервера
    if (currentSessionId) {
        try {
            const sessionStats = await apiRequest(`/stats/session/${currentSessionId}`, 'GET');
            if (sessionStats) {
                correctAnswersCount = sessionStats.correct_answers || correctAnswersCount;
                wrongAnswersCount = sessionStats.wrong_answers || wrongAnswersCount;

                // Проверяем, завершены ли все вопросы по данным с сервера
                if (sessionStats.question_ids) {
                    const questionIds = JSON.parse(sessionStats.question_ids);
                    const currentIndex = sessionStats.current_question_index || 0;
                    allQuestionsCompleted = currentIndex >= questionIds.length;
                    totalQuestionsInSession = questionIds.length;
                }
            }
        } catch (error) {
            console.warn('⚠️ Не удалось получить статистику с сервера, используем локальные счетчики');
            // Fallback на локальную проверку
            allQuestionsCompleted = currentQuestionIndex >= totalQuestionsInSession;
        }
    }

    // Завершаем сессию только если:
    // 1. Все вопросы пройдены ИЛИ
    // 2. Принудительно запрошено завершение (при выходе на главную/рестарте)
    if (allQuestionsCompleted || forceEnd) {
        await endBackendSession();
    }

    // Используем обновленные счетчики
    const answeredQuestions = correctAnswersCount + wrongAnswersCount;
    const percentage = answeredQuestions > 0 ? Math.round((correctAnswersCount / answeredQuestions) * 100) : 0;

    document.getElementById('correctAnswers').textContent = correctAnswersCount;
    document.getElementById('wrongAnswers').textContent = wrongAnswersCount;
    document.getElementById('scorePercentage').textContent = percentage + '%';
    document.getElementById('answeredQuestions').textContent = answeredQuestions;

    // Показываем/скрываем кнопку "Продолжить тест" в зависимости от состояния
    if (allQuestionsCompleted || forceEnd) {
        // Тест завершен - скрываем кнопку "Продолжить"
        continueTestBtn.classList.add('hidden');
    } else {
        // Есть еще вопросы - показываем кнопку "Продолжить"
        continueTestBtn.classList.remove('hidden');
    }

    showScreen(resultScreen);
}

// Начать режим обучения
async function startTraining() {
    currentMode = 'training';
    currentQuestionIndex = 0;
    correctAnswersCount = 0;
    wrongAnswersCount = 0;
    topWrongQuestions = [];

    // Создаем защищенную сессию на backend
    const success = await startBackendSession('training');
    if (!success) {
        return; // Ошибка подключения
    }

    showScreen(questionScreen);

    // Загружаем первый вопрос с сервера
    await loadAndDisplayNextQuestion();
}

// Начать режим теста
async function startTest() {
    currentMode = 'test';
    currentQuestionIndex = 0;
    correctAnswersCount = 0;
    wrongAnswersCount = 0;
    topWrongQuestions = [];

    // Создаем защищенную сессию на backend (сервер выберет 45 случайных вопросов)
    const success = await startBackendSession('test');
    if (!success) {
        return; // Ошибка подключения
    }

    showScreen(questionScreen);

    // Загружаем первый вопрос с сервера
    await loadAndDisplayNextQuestion();
}

// Загрузить следующий вопрос и показать его
async function loadAndDisplayNextQuestion() {
    const question = await loadNextQuestion();

    if (!question) {
        // Все вопросы завершены
        await showResults();
        return;
    }

    displayQuestion(question);
}

// Продолжить тест после просмотра промежуточных результатов
async function continueTest() {
    // Возвращаемся к экрану вопросов
    showScreen(questionScreen);

    // Загружаем следующий вопрос
    await loadAndDisplayNextQuestion();
}

// Начать заново
async function restartTest() {
    // Завершаем текущую сессию перед началом новой
    if (currentSessionId) {
        await showResults(true); // forceEnd = true
    }

    // Запускаем новую сессию
    if (currentMode === 'training') {
        await startTraining();
    } else {
        await startTest();
    }
}

// Вернуться к выбору режима
async function goToStart() {
    // Завершаем активную сессию перед выходом
    if (currentSessionId) {
        await endBackendSession();
    }

    currentMode = null;
    currentQuestionIndex = 0;
    correctAnswersCount = 0;
    wrongAnswersCount = 0;

    // Останавливаем таймер
    stopInactivityTimer();

    // Очищаем сохраненное состояние
    clearSessionState();

    // Сбрасываем прогресс-бар
    progressBar.style.width = '0%';
    progressText.textContent = 'Вопрос 0 из 0';

    showScreen(startScreen);
}

// События
trainingBtn.addEventListener('click', startTraining);
testBtn.addEventListener('click', startTest);
nextBtn.addEventListener('click', nextQuestion);
exitBtn.addEventListener('click', async () => {
    // Небольшая задержка чтобы последний checkAnswer успел завершиться
    await new Promise(resolve => setTimeout(resolve, 100));
    await showResults(); // Показываем промежуточные результаты, НЕ завершая сессию
});
continueTestBtn.addEventListener('click', continueTest);
restartBtn.addEventListener('click', restartTest);
homeBtn.addEventListener('click', goToStart);
infoBtn.addEventListener('click', () => showScreen(infoScreen));
statsBtn.addEventListener('click', () => window.location.href = '/stats');
backToHomeBtn.addEventListener('click', goToStart);
headerTitle.addEventListener('click', goToStart);

// События для модального окна
document.getElementById('skipBtn').addEventListener('click', skipQuestion);
document.getElementById('continueBtn').addEventListener('click', hideInactivityModal);

// Инициализация приложения с защитой
async function initApp() {
    // Получаем или создаем UUID пользователя
    userUuid = getUserUUID();

    // Инициализируем систему безопасности
    // if (window.Security) {
    //     Security.init({
    //         onFocusSwitch: (count) => {
    //             console.warn(`⚠️ Смена фокуса: ${count}`);
    //             Security.showFocusWarning(count);
    //             // Логируем на сервер
    //             logFocusSwitchToServer();
    //         },
    //         onDevToolsOpen: () => {
    //             console.error('🚨 Обнаружена попытка открыть DevTools!');
    //             Security.showDevToolsWarning();
    //         }
    //     });

    //     // Создаем водяной знак с UUID
    //     Security.createWatermark(userUuid);
    //     console.log('🔒 Система безопасности активирована');
    // }

    // Пытаемся восстановить состояние сессии
    if (loadSessionState() && currentSessionId && sessionToken) {
        // Состояние успешно загружено, восстанавливаем экран
        console.log('✅ Восстановлена сессия:', currentSessionId);
        showScreen(questionScreen);

        // Загружаем текущий вопрос с сервера
        await loadAndDisplayNextQuestion();
    } else {
        // Нет сохраненного состояния, показываем стартовый экран
        showScreen(startScreen);
    }
}

initApp();
