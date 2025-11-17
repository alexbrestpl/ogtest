const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const db = require('./config/database');
const telegram = require('./services/telegram');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// CORS настройки
const isDevelopment = process.env.NODE_ENV !== 'production';
const allowedOrigins = isDevelopment
    ? ['http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1:8080', 'http://127.0.0.1:3000', 'http://localhost:5500']
    : process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];

app.use(cors({
    origin: function (origin, callback) {
        // Разрешаем запросы без origin (например, мобильные приложения, Postman, same-origin)
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn('⚠️ CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    credentials: false
}));

// Раздача статических файлов (frontend)
app.use(express.static(path.join(__dirname, '../../frontend')));

// API эндпоинты

// POST /api/session-start - начать новую сессию (возвращает sessionToken, НЕ возвращает вопросы)
app.post('/api/session-start', (req, res) => {
    try {
        const { userUuid, mode } = req.body;

        if (!userUuid || !mode) {
            return res.status(400).json({ error: 'userUuid и mode обязательны' });
        }

        if (!['training', 'test'].includes(mode)) {
            return res.status(400).json({ error: 'mode должен быть training или test' });
        }

        const sessionData = db.createSession(userUuid, mode);

        res.json({
            success: true,
            sessionId: sessionData.sessionId,
            sessionToken: sessionData.sessionToken,
            totalQuestions: sessionData.totalQuestions
        });
    } catch (error) {
        console.error('Ошибка создания сессии:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/session/:id/next - получить следующий вопрос (по одному)
app.get('/api/session/:id/next', (req, res) => {
    try {
        const sessionId = parseInt(req.params.id);
        const sessionToken = req.headers['x-session-token'];

        if (!sessionToken) {
            return res.status(401).json({ error: 'Отсутствует токен сессии' });
        }

        const result = db.getNextQuestion(sessionId, sessionToken);

        if (!result) {
            return res.json({ completed: true });
        }

        res.json({
            success: true,
            questionIndex: result.questionIndex,
            totalQuestions: result.totalQuestions,
            question: result.question
        });
    } catch (error) {
        console.error('Ошибка получения вопроса:', error);
        if (error.message.includes('Недействительная') || error.message.includes('завершена')) {
            return res.status(403).json({ error: error.message });
        }
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/session/:id/submit-answer - отправить ответ и получить результат
app.post('/api/session/:id/submit-answer', (req, res) => {
    try {
        const sessionId = parseInt(req.params.id);
        const sessionToken = req.headers['x-session-token'];
        const { questionNumber, answerId } = req.body;

        if (!sessionToken) {
            return res.status(401).json({ error: 'Отсутствует токен сессии' });
        }

        if (!questionNumber || !answerId) {
            return res.status(400).json({ error: 'questionNumber и answerId обязательны' });
        }

        const result = db.submitAnswer(sessionId, sessionToken, questionNumber, answerId);

        res.json({
            success: true,
            isCorrect: result.isCorrect,
            correctAnswerId: result.correctAnswerId,
            correctAnswerText: result.correctAnswerText
        });
    } catch (error) {
        console.error('Ошибка проверки ответа:', error);
        if (error.message.includes('Недействительная') || error.message.includes('завершена')) {
            return res.status(403).json({ error: error.message });
        }
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/session/:id/focus-switch - логировать смену фокуса/вкладки
app.post('/api/session/:id/focus-switch', (req, res) => {
    try {
        const sessionId = parseInt(req.params.id);
        const sessionToken = req.headers['x-session-token'];

        if (!sessionToken) {
            return res.status(401).json({ error: 'Отсутствует токен сессии' });
        }

        db.logFocusSwitch(sessionId, sessionToken);

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка логирования смены фокуса:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/session-end - завершить сессию
app.post('/api/session-end', async (req, res) => {
    try {
        const { sessionId, correctAnswers, wrongAnswers, topWrongQuestions } = req.body;

        if (!sessionId || correctAnswers === undefined || wrongAnswers === undefined) {
            return res.status(400).json({ error: 'sessionId, correctAnswers и wrongAnswers обязательны' });
        }

        // Завершаем сессию в БД
        db.endSession(sessionId, correctAnswers, wrongAnswers);

        // Получаем данные сессии
        const sessionData = db.getSessionStats(sessionId);

        // Отправляем в Telegram
        if (sessionData) {
            const message = telegram.formatSessionResults(sessionData, topWrongQuestions);
            await telegram.sendTelegramMessage(message);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка завершения сессии:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/stats/session/:id - получить статистику конкретной сессии
app.get('/api/stats/session/:id', (req, res) => {
    try {
        const sessionId = parseInt(req.params.id);
        const sessionStats = db.getSessionStats(sessionId);

        if (!sessionStats) {
            return res.status(404).json({ error: 'Сессия не найдена' });
        }

        res.json(sessionStats);
    } catch (error) {
        console.error('Ошибка получения статистики сессии:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/stats - получить общую статистику
app.get('/api/stats', async (req, res) => {
    try {
        const stats = db.getOverallStats();

        // Если запрошено, отправляем статистику в Telegram
        if (req.query.sendToTelegram === 'true') {
            const message = telegram.formatOverallStats(stats);
            await telegram.sendTelegramMessage(message);
        }

        res.json(stats);
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/health - проверка работоспособности сервера
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        telegram_configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
    });
});

// Обработка несуществующих маршрутов API
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint не найден' });
});

// Главная страница - отдаем index.html только для HTML запросов
// Статические файлы уже обработаны express.static выше
app.get('*', (req, res, next) => {
    // Пропускаем запросы к статическим файлам (с расширениями)
    if (req.path.match(/\.(js|css|jpg|jpeg|png|gif|svg|ico)$/)) {
        return next();
    }
    // Для всех остальных запросов отдаем index.html
    res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📊 API доступно по адресу http://localhost:${PORT}/api`);
    console.log(`🌐 Frontend доступен по адресу http://localhost:${PORT}`);
    console.log(`🤖 Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ настроен' : '❌ не настроен'}`);
    console.log(`🔧 Режим: ${isDevelopment ? 'разработка' : 'продакшн'}`);

    // Запускаем Telegram бота
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        telegram.startPolling();
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Получен сигнал SIGINT, завершаю работу...');
    telegram.stopPolling();
    db.db.close();
    process.exit(0);
});
