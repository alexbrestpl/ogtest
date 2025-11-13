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

module.exports = {
    sendTelegramMessage,
    formatSessionResults,
    formatOverallStats
};
