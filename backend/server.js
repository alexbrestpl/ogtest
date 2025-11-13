require('dotenv').config({ path: './.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const telegram = require('./telegram');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// CORS настройки
const isDevelopment = process.env.NODE_ENV !== 'production';
const allowedOrigins = isDevelopment
    ? ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:5500']
    : process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];

app.use(cors({
    origin: function (origin, callback) {
        // Разрешаем запросы без origin (например, мобильные приложения, Postman)
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    credentials: false
}));

// Раздача статических файлов (frontend)
app.use(express.static(path.join(__dirname, '../frontend')));

// API эндпоинты

// POST /api/session-start - начать новую сессию
app.post('/api/session-start', (req, res) => {
    try {
        const { userUuid, mode } = req.body;

        if (!userUuid || !mode) {
            return res.status(400).json({ error: 'userUuid и mode обязательны' });
        }

        if (!['training', 'test'].includes(mode)) {
            return res.status(400).json({ error: 'mode должен быть training или test' });
        }

        const sessionId = db.createSession(userUuid, mode);

        res.json({
            success: true,
            sessionId: sessionId
        });
    } catch (error) {
        console.error('Ошибка создания сессии:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/answer - записать ответ на вопрос
app.post('/api/answer', (req, res) => {
    try {
        const { sessionId, questionId, isCorrect } = req.body;

        if (!sessionId || !questionId || isCorrect === undefined) {
            return res.status(400).json({ error: 'sessionId, questionId и isCorrect обязательны' });
        }

        db.logAnswer(sessionId, questionId, isCorrect);

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка записи ответа:', error);
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

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📊 API доступно по адресу http://localhost:${PORT}/api`);
    console.log(`🌐 Frontend доступен по адресу http://localhost:${PORT}`);
    console.log(`🤖 Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ настроен' : '❌ не настроен'}`);
    console.log(`🔧 Режим: ${isDevelopment ? 'разработка' : 'продакшн'}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Получен сигнал SIGINT, завершаю работу...');
    db.db.close();
    process.exit(0);
});
