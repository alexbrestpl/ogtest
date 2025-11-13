# Небезопасные грузы - Quiz приложение

Веб-приложение для подготовки к экзамену по перевозке опасных грузов железнодорожным транспортом (Республика Беларусь).

## Возможности

- **Два режима**:
  - Режим обучения (все вопросы, можно перемешать)
  - Режим теста (45 случайных вопросов)
- **Интерактивные функции**:
  - Подсветка правильных/неправильных ответов
  - Ссылки на нормативные документы
  - Таймер бездействия с подсказками
  - Сохранение прогресса в браузере
- **Статистика**:
  - Сбор статистики использования
  - Отправка результатов в Telegram
  - Аналитика по сложным вопросам

## ⚠️ Безопасность

**ВАЖНО!** При развертывании на VPS:

1. **Файл .env содержит секретные данные** (Telegram токен)
2. **НИКОГДА не коммитьте .env в Git** (уже в .gitignore ✅)
3. **Веб-сервер ОБЯЗАТЕЛЬНО должен блокировать доступ к .env**
   - **Nginx**: См. конфигурацию ниже с правилами `deny all`
   - **Apache**: Файл `.htaccess` уже включен в репозиторий ✅
   - Без этого `.env` будет доступен по URL `https://domain/.env`
4. **Проверьте после деплоя**:
   ```bash
   curl https://yourdomain/.env
   # Должно вернуть: 404 Not Found или 403 Forbidden

   curl https://yourdomain/.git/config
   # Должно вернуть: 404 Not Found или 403 Forbidden
   ```

## Структура проекта

```
ogtest/
├── index.html            # Frontend - главная страница
├── app.js                # Frontend - логика приложения
├── style.css             # Frontend - стили
├── questions_data.json   # База вопросов
├── img/                  # Изображения к вопросам
├── backend/              # Backend API
│   ├── server.js         # Express сервер
│   ├── database.js       # Работа с SQLite
│   ├── telegram.js       # Telegram интеграция
│   ├── package.json      # Зависимости Node.js
│   └── statistics.db     # База данных (создается автоматически)
├── .env                  # Конфигурация (не в Git)
├── .env.example          # Пример конфигурации
├── .htaccess             # Защита для Apache (блокирует .env)
└── .gitignore            # Игнорируемые файлы
```

## Установка и запуск

### 1. Клонирование репозитория

```bash
git clone https://github.com/alexbrestpl/ogtest.git
cd ogtest
```

### 2. Настройка backend

```bash
cd backend
npm install
```

### 3. Настройка Telegram бота

1. Создайте бота через [@BotFather](https://t.me/BotFather):
   - Отправьте `/newbot`
   - Следуйте инструкциям
   - Сохраните токен бота

2. Получите свой Chat ID:
   - Напишите боту [@userinfobot](https://t.me/userinfobot)
   - Скопируйте ваш ID

3. Создайте файл `.env` в корне проекта:

```bash
cp .env.example .env
```

4. Отредактируйте `.env`:

```env
PORT=3000
NODE_ENV=development

TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# Для продакшна укажите URL frontend
FRONTEND_URL=https://test.domain.com
```

### 4. Запуск приложения

#### Режим разработки

Запустите backend:
```bash
cd backend
npm start
```

Откройте браузер: `http://localhost:3000`

#### С автоперезагрузкой (для разработки)

```bash
cd backend
npm run dev
```

### 5. Проверка работы

Откройте в браузере:
- Frontend: `http://localhost:3000`
- API Health: `http://localhost:3000/api/health`

## API Эндпоинты

### POST /api/session-start
Начать новую сессию
```json
{
  "userUuid": "uuid-string",
  "mode": "training" | "test"
}
```

### POST /api/answer
Записать ответ на вопрос
```json
{
  "sessionId": 123,
  "questionId": 45,
  "isCorrect": true
}
```

### POST /api/session-end
Завершить сессию и отправить результаты в Telegram
```json
{
  "sessionId": 123,
  "correctAnswers": 40,
  "wrongAnswers": 5,
  "topWrongQuestions": [{"question_id": 12}, ...]
}
```

### GET /api/stats
Получить общую статистику

Параметры:
- `?sendToTelegram=true` - отправить статистику в Telegram

### GET /api/health
Проверка работоспособности сервера

## Деплой на VPS

### Требования
- Ubuntu/Debian
- Node.js 16+
- Nginx
- Домен (для SSL)

### Шаги развертывания

1. **Клонирование на сервер**:
```bash
ssh user@your-vps
cd /var/www
git clone https://github.com/alexbrestpl/ogtest.git
cd ogtest/backend
npm install --production
```

2. **Настройка .env**:
```bash
cp ../.env.example ../.env
nano ../.env
# Укажите продакшн настройки
```

3. **Настройка Nginx**:
```nginx
server {
    listen 80;
    server_name test.domain.com;

    # SECURITY: Блокировка доступа к .env и другим dotfiles
    location ~ /\. {
        deny all;
        return 404;
    }

    # SECURITY: Дополнительная защита для критичных файлов
    location ~* ^/(\.env|\.git|node_modules|backend/\.env|backend/node_modules) {
        deny all;
        return 404;
    }

    # Frontend (статика)
    location / {
        root /var/www/ogtest;
        index index.html;
        try_files $uri $uri/ =404;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

4. **Запуск backend с PM2**:
```bash
npm install -g pm2
cd /var/www/ogtest/backend
pm2 start server.js --name ogtest-backend
pm2 startup
pm2 save
```

5. **Установка SSL (Let's Encrypt)**:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d test.domain.com
```

6. **Проверка**:
```bash
pm2 status
sudo nginx -t
sudo systemctl restart nginx
```

Откройте https://test.domain.com

## Обновление

```bash
cd /var/www/ogtest
git pull origin main
cd backend
npm install
pm2 restart ogtest-backend
```

## База данных

База данных SQLite (`backend/statistics.db`) создается автоматически при первом запуске.

### Таблицы:
- `users` - пользователи (UUID, дата первого/последнего посещения)
- `sessions` - сессии тестов/обучения
- `answers` - ответы на вопросы
- `questions_stats` - статистика по вопросам

### Backup базы данных:
```bash
cp backend/statistics.db backend/statistics.db.backup
```

## Лицензия

MIT License. Проект создан для ознакомительных и учебных целей.

## Автор

Alex Leoniuk
- Telegram: [@brest_by](https://t.me/brest_by)
- GitHub: [alexbrestpl](https://github.com/alexbrestpl)
