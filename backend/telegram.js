const fetch = require('node-fetch');

// Отправить сообщение в Telegram
async function sendTelegramMessage(message) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.warn('⚠️  Telegram не настроен (отсутствуют TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID)');
        return null;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML',
            }),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('❌ Ошибка отправки в Telegram:', data);
            return null;
        }

        console.log('✅ Сообщение отправлено в Telegram');
        return data;
    } catch (error) {
        console.error('❌ Ошибка отправки в Telegram:', error.message);
        return null;
    }
}

// Форматировать результаты сессии для отправки
function formatSessionResults(sessionData, topWrongQuestions = []) {
    const mode = sessionData.mode === 'test' ? 'Тест' : 'Обучение';
    const totalAnswers = sessionData.correct_answers + sessionData.wrong_answers;
    const percentage = sessionData.percentage.toFixed(1);

    let message = `🎯 <b>Завершена сессия</b>\n\n`;
    message += `👤 Пользователь: <code>${sessionData.user_uuid.substring(0, 8)}...</code>\n`;
    message += `📋 Режим: ${mode}\n`;
    message += `📊 Результаты:\n`;
    message += `  ✅ Правильных: ${sessionData.correct_answers}\n`;
    message += `  ❌ Неправильных: ${sessionData.wrong_answers}\n`;
    message += `  📈 Процент: ${percentage}%\n`;
    message += `  📝 Всего вопросов: ${totalAnswers}\n`;

    if (topWrongQuestions && topWrongQuestions.length > 0) {
        message += `\n❗️ <b>Вопросы с ошибками:</b>\n`;
        topWrongQuestions.forEach((q, index) => {
            message += `  ${index + 1}. Вопрос #${q.question_id}\n`;
        });
    }

    const startTime = new Date(sessionData.start_time);
    const endTime = new Date(sessionData.end_time);
    const duration = Math.round((endTime - startTime) / 1000 / 60); // в минутах
    message += `\n⏱ Время прохождения: ${duration} мин.\n`;
    message += `🕐 Завершено: ${endTime.toLocaleString('ru-RU')}`;

    return message;
}

// Форматировать общую статистику
function formatOverallStats(stats) {
    let message = `📊 <b>Общая статистика приложения</b>\n\n`;
    message += `👥 Всего пользователей: ${stats.totalUsers}\n`;
    message += `🎯 Всего сессий: ${stats.totalSessions}\n`;
    message += `📈 Средний процент успешности: ${stats.averagePercentage}%\n`;

    if (stats.topDifficultQuestions && stats.topDifficultQuestions.length > 0) {
        message += `\n❗️ <b>Топ-10 сложных вопросов:</b>\n`;
        stats.topDifficultQuestions.forEach((q, index) => {
            message += `  ${index + 1}. Вопрос #${q.question_id} (${q.error_rate.toFixed(1)}% ошибок, показан ${q.total_shown} раз)\n`;
        });
    }

    return message;
}

// Переменные для long polling
let lastUpdateId = 0;
let pollingInterval = null;
let isPolling = false;

// Проверка авторизации (только владелец)
function isAuthorized(chatId) {
    const authorizedChatId = process.env.TELEGRAM_CHAT_ID;
    return chatId && authorizedChatId && chatId.toString() === authorizedChatId.toString();
}

// Получение обновлений от Telegram (long polling)
async function getUpdates(offset = 0) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
        return null;
    }

    const url = `https://api.telegram.org/bot${botToken}/getUpdates`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                offset: offset,
                timeout: 30, // Long polling timeout
                allowed_updates: ['message']
            }),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('❌ Ошибка getUpdates:', data);
            return null;
        }

        return data.result;
    } catch (error) {
        console.error('❌ Ошибка getUpdates:', error.message);
        return null;
    }
}

// Форматирование топ сложных вопросов
function formatDifficultQuestions(questions) {
    if (!questions || questions.length === 0) {
        return '📊 <b>Топ сложных вопросов</b>\n\nПока недостаточно данных для статистики.';
    }

    let message = '❗️ <b>Топ-10 самых сложных вопросов:</b>\n\n';

    questions.forEach((q, index) => {
        message += `${index + 1}. <b>Вопрос #${q.question_id}</b>\n`;
        message += `   📊 Ошибок: <b>${q.error_rate.toFixed(1)}%</b> (показан ${q.total_shown} раз)\n\n`;
    });

    message += `💡 <i>Минимум показов: 5 раз</i>\n`;
    message += `🕐 Обновлено: ${new Date().toLocaleString('ru-RU')}`;

    return message;
}

// Обработка команды /difficult
async function handleDifficultCommand(chatId) {
    try {
        const db = require('./database');
        const difficultQuestions = db.getDifficultQuestions(10);
        const message = formatDifficultQuestions(difficultQuestions);
        await sendTelegramMessage(message);
        console.log('✅ Отправлен ответ на команду /difficult');
    } catch (error) {
        console.error('❌ Ошибка обработки команды /difficult:', error.message);
        await sendTelegramMessage('❌ Ошибка при получении статистики');
    }
}

// Обработка входящих команд
async function handleCommand(message) {
    const chatId = message.chat.id;
    const text = message.text;

    // Проверка авторизации
    if (!isAuthorized(chatId)) {
        console.warn('⚠️ Неавторизованная попытка доступа от chat:', chatId);
        return;
    }

    console.log(`📨 Получена команда: ${text} от chat: ${chatId}`);

    // Обработка команд
    if (text === '/difficult' || text === '/difficult@' + process.env.TELEGRAM_BOT_USERNAME) {
        await handleDifficultCommand(chatId);
    } else if (text.startsWith('/')) {
        // Неизвестная команда
        await sendTelegramMessage(`❓ Неизвестная команда: ${text}\n\nДоступные команды:\n/difficult - топ сложных вопросов`);
    }
}

// Запуск long polling
async function startPolling() {
    if (isPolling) {
        console.log('⚠️ Polling уже запущен');
        return;
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.log('⚠️ Telegram бот не настроен (отсутствуют переменные окружения)');
        return;
    }

    isPolling = true;
    console.log('🤖 Запуск Telegram бота (long polling)...');

    const poll = async () => {
        if (!isPolling) {
            return;
        }

        try {
            const updates = await getUpdates(lastUpdateId + 1);

            if (updates && updates.length > 0) {
                for (const update of updates) {
                    lastUpdateId = update.update_id;

                    if (update.message && update.message.text) {
                        await handleCommand(update.message);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Ошибка в polling цикле:', error.message);
        }

        // Следующий опрос через 2 секунды
        if (isPolling) {
            pollingInterval = setTimeout(poll, 2000);
        }
    };

    poll();
}

// Остановка long polling
function stopPolling() {
    isPolling = false;
    if (pollingInterval) {
        clearTimeout(pollingInterval);
        pollingInterval = null;
    }
    console.log('🛑 Telegram бот остановлен');
}

module.exports = {
    sendTelegramMessage,
    formatSessionResults,
    formatOverallStats,
    startPolling,
    stopPolling
};
