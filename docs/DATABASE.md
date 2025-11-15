# 📊 Структура базы данных

База данных SQLite: `backend/statistics.db`

## Таблицы

### 1. `questions` - Вопросы для тестирования
```sql
CREATE TABLE questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_number INTEGER UNIQUE NOT NULL,
    question_text TEXT NOT NULL,
    answers TEXT NOT NULL,          -- JSON массив [{text, id}]
    correct_answer_id INTEGER NOT NULL,
    correct_answer_text TEXT NOT NULL,
    document_link TEXT,
    document_text TEXT,
    image_url TEXT,
    image_file TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2. `users` - Пользователи
```sql
CREATE TABLE users (
    uuid TEXT PRIMARY KEY,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_sessions INTEGER DEFAULT 0
);
```

### 3. `sessions` - Сессии тестирования
```sql
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_uuid TEXT NOT NULL,
    mode TEXT NOT NULL,             -- 'training' или 'test'
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    correct_answers INTEGER DEFAULT 0,
    wrong_answers INTEGER DEFAULT 0,
    percentage REAL DEFAULT 0,
    session_token TEXT UNIQUE,      -- Токен безопасности
    question_ids TEXT,              -- JSON массив ID вопросов
    current_question_index INTEGER DEFAULT 0,
    focus_switches INTEGER DEFAULT 0,
    FOREIGN KEY (user_uuid) REFERENCES users(uuid)
);
```

### 4. `answers` - История ответов
```sql
CREATE TABLE answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    is_correct BOOLEAN NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### 5. `questions_stats` - Статистика по вопросам
```sql
CREATE TABLE questions_stats (
    question_id INTEGER PRIMARY KEY,
    total_shown INTEGER DEFAULT 0,
    total_wrong INTEGER DEFAULT 0,
    error_rate REAL DEFAULT 0
);
```

## Миграции

Запустить миграции:
```bash
npm run migrate:questions  # Загрузка вопросов из JSON
npm run migrate:db         # Обновление схемы БД
```
