const Database = require('better-sqlite3');
const path = require('path');

// Путь к файлу базы данных
const dbPath = path.join(__dirname, 'statistics.db');
const db = new Database(dbPath);

// Включаем внешние ключи
db.pragma('foreign_keys = ON');

// Создаем таблицы
function initDatabase() {
    // Таблица пользователей
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            uuid TEXT PRIMARY KEY,
            first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            total_sessions INTEGER DEFAULT 0
        )
    `);

    // Таблица сессий
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_uuid TEXT NOT NULL,
            mode TEXT NOT NULL,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            end_time DATETIME,
            correct_answers INTEGER DEFAULT 0,
            wrong_answers INTEGER DEFAULT 0,
            percentage REAL DEFAULT 0,
            session_token TEXT UNIQUE,
            question_ids TEXT,
            current_question_index INTEGER DEFAULT 0,
            focus_switches INTEGER DEFAULT 0,
            FOREIGN KEY (user_uuid) REFERENCES users(uuid)
        )
    `);

    // Таблица ответов
    db.exec(`
        CREATE TABLE IF NOT EXISTS answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            is_correct BOOLEAN NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
    `);

    // Таблица статистики по вопросам
    db.exec(`
        CREATE TABLE IF NOT EXISTS questions_stats (
            question_id INTEGER PRIMARY KEY,
            total_shown INTEGER DEFAULT 0,
            total_wrong INTEGER DEFAULT 0,
            error_rate REAL DEFAULT 0
        )
    `);

    console.log('✅ База данных инициализирована');
}

// Добавить или обновить пользователя
function upsertUser(uuid) {
    const stmt = db.prepare(`
        INSERT INTO users (uuid, total_sessions)
        VALUES (?, 1)
        ON CONFLICT(uuid) DO UPDATE SET
            last_seen = CURRENT_TIMESTAMP,
            total_sessions = total_sessions + 1
    `);

    return stmt.run(uuid);
}

// Создать новую сессию с выбором вопросов
function createSession(userUuid, mode) {
    upsertUser(userUuid);

    // Получаем список вопросов для сессии
    const questionIds = getQuestionIdsForMode(mode);

    // Генерируем токен сессии
    const sessionToken = generateSessionToken();

    const stmt = db.prepare(`
        INSERT INTO sessions (user_uuid, mode, session_token, question_ids, current_question_index)
        VALUES (?, ?, ?, ?, 0)
    `);

    const result = stmt.run(userUuid, mode, sessionToken, JSON.stringify(questionIds));
    return {
        sessionId: result.lastInsertRowid,
        sessionToken: sessionToken,
        totalQuestions: questionIds.length
    };
}

// Завершить сессию
function endSession(sessionId, correctAnswers, wrongAnswers) {
    const totalAnswers = correctAnswers + wrongAnswers;
    const percentage = totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0;

    const stmt = db.prepare(`
        UPDATE sessions
        SET end_time = CURRENT_TIMESTAMP,
            correct_answers = ?,
            wrong_answers = ?,
            percentage = ?
        WHERE id = ?
    `);

    return stmt.run(correctAnswers, wrongAnswers, percentage, sessionId);
}

// Записать ответ на вопрос
function logAnswer(sessionId, questionId, isCorrect) {
    const stmt = db.prepare(`
        INSERT INTO answers (session_id, question_id, is_correct)
        VALUES (?, ?, ?)
    `);

    stmt.run(sessionId, questionId, isCorrect ? 1 : 0);

    // Обновляем статистику по вопросу
    updateQuestionStats(questionId, isCorrect);
}

// Обновить статистику по вопросу
function updateQuestionStats(questionId, isCorrect) {
    const stmt = db.prepare(`
        INSERT INTO questions_stats (question_id, total_shown, total_wrong, error_rate)
        VALUES (?, 1, ?, CAST(? AS REAL) / 1 * 100)
        ON CONFLICT(question_id) DO UPDATE SET
            total_shown = total_shown + 1,
            total_wrong = total_wrong + ?,
            error_rate = CAST(total_wrong + ? AS REAL) / (total_shown + 1) * 100
    `);

    const wrongIncrement = isCorrect ? 0 : 1;
    stmt.run(questionId, wrongIncrement, wrongIncrement, wrongIncrement, wrongIncrement);
}

// Получить статистику сессии
function getSessionStats(sessionId) {
    const stmt = db.prepare(`
        SELECT * FROM sessions WHERE id = ?
    `);

    return stmt.get(sessionId);
}

// Получить общую статистику
function getOverallStats() {
    const stats = {};

    // Общее количество сессий
    stats.totalSessions = db.prepare('SELECT COUNT(*) as count FROM sessions').get().count;

    // Количество пользователей
    stats.totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

    // Средний процент успешности
    const avgPercentage = db.prepare('SELECT AVG(percentage) as avg FROM sessions WHERE end_time IS NOT NULL').get();
    stats.averagePercentage = avgPercentage.avg ? avgPercentage.avg.toFixed(2) : 0;

    // Топ-10 самых сложных вопросов с полными данными
    stats.topDifficultQuestions = db.prepare(`
        SELECT
            qs.question_id,
            qs.total_shown,
            qs.total_wrong,
            qs.error_rate,
            q.question_text,
            q.answers,
            q.correct_answer_id,
            q.correct_answer_text,
            q.document_link
        FROM questions_stats qs
        JOIN questions q ON qs.question_id = q.question_number
        WHERE qs.total_shown >= 5
        ORDER BY qs.error_rate DESC
        LIMIT 10
    `).all().map(q => ({
        ...q,
        answers: JSON.parse(q.answers)
    }));

    return stats;
}

// Генерация токена сессии
function generateSessionToken() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
}

// Получить ID вопросов для сессии в зависимости от режима
function getQuestionIdsForMode(mode) {
    const allQuestions = db.prepare('SELECT question_number FROM questions ORDER BY question_number').all();
    const allIds = allQuestions.map(q => q.question_number);

    if (mode === 'test') {
        // Режим теста: 45 случайных вопросов
        return shuffleArray(allIds).slice(0, 45);
    } else {
        // Режим обучения: все вопросы в порядке
        return allIds;
    }
}

// Перемешать массив (Fisher-Yates shuffle)
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Получить следующий вопрос для сессии
function getNextQuestion(sessionId, sessionToken) {
    // Проверяем токен и получаем сессию
    const session = db.prepare(`
        SELECT * FROM sessions WHERE id = ? AND session_token = ?
    `).get(sessionId, sessionToken);

    if (!session) {
        throw new Error('Недействительная сессия или токен');
    }

    if (session.end_time) {
        throw new Error('Сессия уже завершена');
    }

    const questionIds = JSON.parse(session.question_ids);
    const currentIndex = session.current_question_index;

    if (currentIndex >= questionIds.length) {
        return null; // Все вопросы завершены
    }

    const questionNumber = questionIds[currentIndex];

    // Получаем вопрос БЕЗ правильного ответа
    const question = db.prepare(`
        SELECT
            question_number,
            question_text,
            answers,
            document_link,
            document_text,
            image_url,
            image_file
        FROM questions
        WHERE question_number = ?
    `).get(questionNumber);

    if (!question) {
        throw new Error(`Вопрос ${questionNumber} не найден`);
    }

    // Парсим JSON ответов
    question.answers = JSON.parse(question.answers);

    return {
        questionIndex: currentIndex + 1,
        totalQuestions: questionIds.length,
        question: question
    };
}

// Проверить ответ и перейти к следующему вопросу
function submitAnswer(sessionId, sessionToken, questionNumber, answerId) {
    // Проверяем токен и получаем сессию
    const session = db.prepare(`
        SELECT * FROM sessions WHERE id = ? AND session_token = ?
    `).get(sessionId, sessionToken);

    if (!session) {
        throw new Error('Недействительная сессия или токен');
    }

    if (session.end_time) {
        throw new Error('Сессия уже завершена');
    }

    // Получаем правильный ответ
    const questionData = db.prepare(`
        SELECT correct_answer_id, correct_answer_text
        FROM questions
        WHERE question_number = ?
    `).get(questionNumber);

    if (!questionData) {
        throw new Error(`Вопрос ${questionNumber} не найден`);
    }

    const isCorrect = questionData.correct_answer_id === answerId;

    // Логируем ответ
    logAnswer(sessionId, questionNumber, isCorrect);

    // Увеличиваем индекс текущего вопроса
    db.prepare(`
        UPDATE sessions
        SET current_question_index = current_question_index + 1
        WHERE id = ?
    `).run(sessionId);

    return {
        isCorrect: isCorrect,
        correctAnswerId: questionData.correct_answer_id,
        correctAnswerText: questionData.correct_answer_text
    };
}

// Логировать смену фокуса
function logFocusSwitch(sessionId, sessionToken) {
    const session = db.prepare(`
        SELECT * FROM sessions WHERE id = ? AND session_token = ?
    `).get(sessionId, sessionToken);

    if (!session) {
        return;
    }

    db.prepare(`
        UPDATE sessions
        SET focus_switches = focus_switches + 1
        WHERE id = ?
    `).run(sessionId);
}

// Получить топ N самых сложных вопросов
function getDifficultQuestions(limit = 10) {
    const stmt = db.prepare(`
        SELECT question_id, total_shown, total_wrong, error_rate
        FROM questions_stats
        WHERE total_shown >= 5
        ORDER BY error_rate DESC
        LIMIT ?
    `);

    return stmt.all(limit);
}

// Инициализируем базу данных при загрузке модуля
initDatabase();

module.exports = {
    db,
    createSession,
    endSession,
    logAnswer,
    getSessionStats,
    getOverallStats,
    getNextQuestion,
    submitAnswer,
    logFocusSwitch,
    getDifficultQuestions
};
