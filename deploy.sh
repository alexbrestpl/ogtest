#!/bin/bash
set -e

echo "🚀 Начинаем деплой ogtest..."

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Переход в директорию проекта
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo -e "${BLUE}📁 Рабочая директория: $PROJECT_DIR${NC}"

# Получение последних изменений
echo -e "${BLUE}📥 Получение последних изменений из Git...${NC}"
git pull origin main

# Установка зависимостей
echo -e "${BLUE}📦 Установка зависимостей...${NC}"
cd backend
npm install --production

# Проверка наличия .env
if [ ! -f .env ]; then
    echo -e "${RED}⚠️  Файл .env не найден!${NC}"
    echo -e "${BLUE}Создайте файл .env на основе .env.example${NC}"
    exit 1
fi

# Миграции (если необходимо)
if [ ! -f statistics.db ]; then
    echo -e "${BLUE}🗄️  База данных не найдена. Запуск миграций...${NC}"
    if [ -f data/questions_data.json ]; then
        npm run migrate:questions
    fi
fi

# Перезапуск приложения
echo -e "${BLUE}🔄 Перезапуск приложения через PM2...${NC}"
cd "$PROJECT_DIR"

if pm2 describe ogtest > /dev/null 2>&1; then
    pm2 restart ogtest
else
    pm2 start ecosystem.config.js
    pm2 save
fi

echo -e "${GREEN}✅ Деплой завершен успешно!${NC}"
echo ""
echo -e "${BLUE}📊 Статус приложения:${NC}"
pm2 status ogtest

echo ""
echo -e "${BLUE}📝 Для просмотра логов используйте:${NC}"
echo "pm2 logs ogtest"
