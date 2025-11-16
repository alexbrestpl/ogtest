/**
 * Миграция вопросов из JSON в SQLite
 * Запуск: node migrate-questions.js
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'src', 'config', 'statistics.db');
const questionsJsonPath = path.join(__dirname, '..', 'data', 'questions_data.json');

console.log('🔄 Начинаю миграцию вопросов...');

// Открываем БД
const db = new Database(dbPath);

// Создаем таблицу вопросов
console.log('📋 Создаю таблицу questions...');

db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_number INTEGER UNIQUE NOT NULL,
        question_text TEXT NOT NULL,
        answers TEXT NOT NULL,  -- JSON массив [{text, id}, ...] БЕЗ flag
        correct_answer_id INTEGER NOT NULL,
        correct_answer_text TEXT NOT NULL,
        document_link TEXT,
        document_text TEXT,
        image_url TEXT,
        image_file TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_question_number ON questions(question_number);
`);

console.log('✅ Таблица создана');

// Читаем JSON
console.log('📖 Читаю questions_data.json...');
const questionsData = JSON.parse(fs.readFileSync(questionsJsonPath, 'utf8'));
console.log(`   Найдено ${questionsData.length} вопросов`);

// Очищаем таблицу если есть старые данные
const existingCount = db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
if (existingCount > 0) {
    console.log(`⚠️  Найдено ${existingCount} существующих записей. Удаляю...`);
    db.prepare('DELETE FROM questions').run();
}

// Подготавливаем INSERT
const insertStmt = db.prepare(`
    INSERT INTO questions (
        question_number,
        question_text,
        answers,
        correct_answer_id,
        correct_answer_text,
        document_link,
        document_text,
        image_url,
        image_file
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Миграция в транзакции
const migrateAll = db.transaction((questions) => {
    let successCount = 0;
    let errorCount = 0;

    for (const q of questions) {
        try {
            // Находим правильный ответ
            const correctAnswer = q.answers.find(a => a.flag === true);

            if (!correctAnswer) {
                console.error(`   ❌ Вопрос ${q.question_number}: правильный ответ не найден!`);
                errorCount++;
                continue;
            }

            // Подготавливаем публичные ответы (БЕЗ flag)
            const publicAnswers = q.answers.map(a => ({
                text: a.text,
                id: a.id
            }));

            insertStmt.run(
                q.question_number,
                q.question_text,
                JSON.stringify(publicAnswers),
                correctAnswer.id,
                correctAnswer.text,
                q.document_link || '',
                q.document_text || '',
                q.image_url || '',
                q.image_file || ''
            );

            successCount++;
        } catch (error) {
            console.error(`   ❌ Ошибка при миграции вопроса ${q.question_number}:`, error.message);
            errorCount++;
        }
    }

    return { successCount, errorCount };
});

console.log('💾 Мигрирую данные...');
const result = migrateAll(questionsData);

console.log(`\n✅ Миграция завершена:`);
console.log(`   Успешно: ${result.successCount}`);
console.log(`   Ошибки: ${result.errorCount}`);

// Проверка
const finalCount = db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
console.log(`   Записей в БД: ${finalCount}`);

// Пример запроса
const sampleQuestion = db.prepare('SELECT * FROM questions WHERE question_number = 1').get();
if (sampleQuestion) {
    console.log('\n📄 Пример вопроса из БД:');
    console.log(`   Номер: ${sampleQuestion.question_number}`);
    console.log(`   Текст: ${sampleQuestion.question_text.substring(0, 50)}...`);
    console.log(`   Правильный ответ ID: ${sampleQuestion.correct_answer_id}`);
    const answers = JSON.parse(sampleQuestion.answers);
    console.log(`   Количество вариантов: ${answers.length}`);
    console.log(`   Есть flag в ответах: ${answers[0].hasOwnProperty('flag') ? '❌ ДА (утечка!)' : '✅ НЕТ'}`);
}

db.close();

console.log('\n🎉 Готово! Вопросы теперь в SQLite.');
console.log('   Файл: backend/statistics.db');
console.log('   Таблица: questions');
