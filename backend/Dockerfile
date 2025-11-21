FROM node:18-alpine

WORKDIR /app

# Копируем package файлы
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Создаем директорию для БД если её нет
RUN mkdir -p /app/src/config

# Открываем порт
EXPOSE 3001

# Запускаем приложение
CMD ["node", "src/server.js"]
