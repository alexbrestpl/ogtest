/**
 * Миграция схемы базы данных - добавление новых полей в таблицу sessions
 * Запуск: node migrate-database.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'config', 'statistics.db');
const db = new Database(dbPath);

console.log('🔄 Начинаю миграцию схемы базы данных...');

// Проверяем существующую структуру таблицы sessions
const tableInfo = db.prepare("PRAGMA table_info(sessions)").all();
const existingColumns = tableInfo.map(col => col.name);

console.log('📋 Существующие столбцы в sessions:', existingColumns.join(', '));

// Список новых столбцов для добавления
const newColumns = [
    { name: 'session_token', type: 'TEXT UNIQUE', defaultValue: null },
    { name: 'question_ids', type: 'TEXT', defaultValue: null },
    { name: 'current_question_index', type: 'INTEGER DEFAULT 0', defaultValue: '0' },
    { name: 'focus_switches', type: 'INTEGER DEFAULT 0', defaultValue: '0' }
];

let addedCount = 0;

// Добавляем отсутствующие столбцы
for (const column of newColumns) {
    if (!existingColumns.includes(column.name)) {
        try {
            const sql = `ALTER TABLE sessions ADD COLUMN ${column.name} ${column.type}`;
            db.prepare(sql).run();
            console.log(`✅ Добавлен столбец: ${column.name}`);
            addedCount++;
        } catch (error) {
            console.error(`❌ Ошибка добавления столбца ${column.name}:`, error.message);
        }
    } else {
        console.log(`⏭️  Столбец ${column.name} уже существует`);
    }
}

// Проверяем обновленную структуру
const updatedTableInfo = db.prepare("PRAGMA table_info(sessions)").all();
console.log('\n📊 Обновленная структура таблицы sessions:');
updatedTableInfo.forEach(col => {
    console.log(`   - ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
});

console.log(`\n✅ Миграция завершена. Добавлено столбцов: ${addedCount}`);

db.close();
