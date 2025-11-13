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

// Создать новую сессию
function createSession(userUuid, mode) {
    upsertUser(userUuid);

    const stmt = db.prepare(`
        INSERT INTO sessions (user_uuid, mode)
        VALUES (?, ?)
    `);

    const result = stmt.run(userUuid, mode);
    return result.lastInsertRowid;
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

    // Топ-10 самых сложных вопросов
    stats.topDifficultQuestions = db.prepare(`
        SELECT question_id, total_shown, total_wrong, error_rate
        FROM questions_stats
        WHERE total_shown >= 5
        ORDER BY error_rate DESC
        LIMIT 10
    `).all();

    return stats;
}

// Инициализируем базу данных при загрузке модуля
initDatabase();

module.exports = {
    db,
    createSession,
    endSession,
    logAnswer,
    getSessionStats,
    getOverallStats
};
