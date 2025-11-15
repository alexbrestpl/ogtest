# 📡 API Документация

Base URL: `http://localhost:3000/api`

## Endpoints

### POST /session-start
Начать новую сессию

**Request:**
```json
{
  "userUuid": "string",
  "mode": "training" | "test"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": 123,
  "sessionToken": "hex_string",
  "totalQuestions": 45
}
```

---

### GET /session/:id/next
Получить следующий вопрос

**Headers:**
- `X-Session-Token`: session token

**Response:**
```json
{
  "success": true,
  "questionIndex": 1,
  "totalQuestions": 45,
  "question": {
    "question_number": 1,
    "question_text": "...",
    "answers": [{text, id}],
    "image_url": "...",
    "document_link": "..."
  }
}
```

---

### POST /session/:id/submit-answer
Отправить ответ на вопрос

**Headers:**
- `X-Session-Token`: session token

**Request:**
```json
{
  "questionNumber": 1,
  "answerId": 2
}
```

**Response:**
```json
{
  "success": true,
  "isCorrect": true,
  "correctAnswerId": 2,
  "correctAnswerText": "..."
}
```

---

### POST /session/:id/focus-switch
Логировать смену фокуса (анти-чит)

**Headers:**
- `X-Session-Token`: session token

---

### POST /session-end
Завершить сессию

**Request:**
```json
{
  "sessionId": 123,
  "correctAnswers": 30,
  "wrongAnswers": 15,
  "topWrongQuestions": [{question_id: 1}]
}
```

---

### GET /stats/session/:id
Получить статистику сессии

**Response:**
```json
{
  "id": 123,
  "user_uuid": "...",
  "mode": "test",
  "correct_answers": 30,
  "wrong_answers": 15,
  "percentage": 66.7,
  "start_time": "...",
  "end_time": "..."
}
```

---

### GET /stats
Получить общую статистику

**Query параметры:**
- `sendToTelegram=true` - отправить в Telegram

**Response:**
```json
{
  "totalSessions": 100,
  "totalUsers": 50,
  "averagePercentage": "75.5",
  "topDifficultQuestions": [...]
}
```

---

### GET /health
Проверка работоспособности

**Response:**
```json
{
  "status": "ok",
  "timestamp": "...",
  "telegram_configured": true
}
```
