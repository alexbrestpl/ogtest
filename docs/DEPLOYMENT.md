# Деплой на VPS с PM2 и Nginx

Пошаговая инструкция для развертывания приложения на VPS с использованием субдомена.

## Требования

- VPS с Ubuntu 20.04/22.04 (или Debian)
- Root или sudo доступ
- Домен с возможностью настройки DNS

## 1. Подготовка сервера

### Обновление системы
```bash
sudo apt update && sudo apt upgrade -y
```

### Установка Node.js (версия 18+)
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Проверка версии
```

### Установка PM2
```bash
sudo npm install -g pm2
pm2 --version  # Проверка установки
```

### Установка Nginx
```bash
sudo apt install -y nginx
sudo systemctl status nginx  # Проверка статуса
```

### Установка Git
```bash
sudo apt install -y git
```

### Установка SQLite (если не установлен)
```bash
sudo apt install -y sqlite3 libsqlite3-dev
```

## 2. Настройка DNS

В панели управления доменом (Cloudflare, Namecheap, и т.д.) добавьте A-запись:

```
Тип: A
Имя: test (или любое другое для субдомена)
Значение: <IP вашего VPS>
TTL: Auto или 3600
```

Проверьте DNS:
```bash
nslookup test.yourdomain.com
# Должен вернуть IP вашего VPS
```

## 3. Клонирование проекта

```bash
cd /var/www
sudo git clone https://github.com/alexbrestpl/ogtest.git
sudo chown -R $USER:$USER ogtest
cd ogtest
```

## 4. Настройка приложения

### Установка зависимостей
```bash
cd backend
npm install --production
```

### Настройка переменных окружения
```bash
cp .env.example .env
nano .env
```

Обязательно настройте:
```env
PORT=3000
NODE_ENV=production

# Telegram Bot (опционально)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# CORS (укажите ваш домен)
FRONTEND_URL=https://test.yourdomain.com
```

### Создание директории для логов
```bash
mkdir -p logs
```

### Миграция базы данных
```bash
# Если есть JSON с вопросами
npm run migrate:questions

# Если нужны дополнительные миграции
npm run migrate:db
```

## 5. Запуск с PM2

```bash
cd /var/www/ogtest
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# Выполните команду, которую выдаст pm2 startup
```

### Полезные PM2 команды
```bash
pm2 status           # Статус приложений
pm2 logs ogtest      # Логи приложения
pm2 restart ogtest   # Перезапуск
pm2 stop ogtest      # Остановка
pm2 delete ogtest    # Удаление из PM2
pm2 monit            # Мониторинг в реальном времени
```

## 6. Настройка Nginx

### Копирование конфигурации
```bash
sudo cp /var/www/ogtest/nginx.conf.example /etc/nginx/sites-available/ogtest
sudo nano /etc/nginx/sites-available/ogtest
```

**Замените** `test.yourdomain.com` на ваш реальный субдомен.

### Активация конфигурации
```bash
sudo ln -s /etc/nginx/sites-available/ogtest /etc/nginx/sites-enabled/
```

### Проверка конфигурации
```bash
sudo nginx -t
```

### Перезапуск Nginx
```bash
sudo systemctl restart nginx
```

## 7. Установка SSL (Let's Encrypt)

### Установка Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Получение SSL сертификата
```bash
sudo certbot --nginx -d test.yourdomain.com
```

Следуйте инструкциям certbot:
- Введите email
- Согласитесь с условиями
- Выберите опцию редиректа HTTP → HTTPS (рекомендуется)

### Автоматическое обновление сертификата
```bash
sudo certbot renew --dry-run  # Тест обновления
```

Certbot автоматически добавит задачу в cron для обновления.

## 8. Настройка Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 9. Проверка работы

Откройте в браузере:
- `http://test.yourdomain.com` (должен редиректить на HTTPS)
- `https://test.yourdomain.com` (должно открыться приложение)

## 10. Обновление приложения

Создайте скрипт для быстрого обновления:

```bash
nano /var/www/ogtest/deploy.sh
```

Содержимое:
```bash
#!/bin/bash
set -e

echo "🚀 Начинаем деплой..."

# Переход в директорию проекта
cd /var/www/ogtest

# Получение последних изменений
git pull origin main

# Установка зависимостей
cd backend
npm install --production

# Перезапуск приложения
pm2 restart ogtest

echo "✅ Деплой завершен!"
echo "📊 Статус приложения:"
pm2 status ogtest
```

Сделайте исполняемым:
```bash
chmod +x /var/www/ogtest/deploy.sh
```

Использование:
```bash
/var/www/ogtest/deploy.sh
```

## Мониторинг и отладка

### Просмотр логов приложения
```bash
pm2 logs ogtest
pm2 logs ogtest --lines 100  # Последние 100 строк
```

### Просмотр логов Nginx
```bash
sudo tail -f /var/log/nginx/ogtest_access.log
sudo tail -f /var/log/nginx/ogtest_error.log
```

### Проверка статуса сервисов
```bash
sudo systemctl status nginx
pm2 status
```

### Проверка портов
```bash
sudo netstat -tlnp | grep :3000  # Node.js приложение
sudo netstat -tlnp | grep :80    # Nginx HTTP
sudo netstat -tlnp | grep :443   # Nginx HTTPS
```

## Решение проблем

### Приложение не запускается
```bash
cd /var/www/ogtest/backend
node src/server.js  # Запуск напрямую для диагностики
```

### Nginx не проксирует запросы
```bash
sudo nginx -t  # Проверка конфигурации
curl http://localhost:3000  # Проверка Node.js напрямую
```

### База данных не работает
```bash
cd /var/www/ogtest/backend
sqlite3 statistics.db ".tables"  # Проверка таблиц
```

### SSL не работает
```bash
sudo certbot certificates  # Проверка статуса сертификатов
sudo certbot renew  # Принудительное обновление
```

## Бэкапы

### Бэкап базы данных
```bash
# Создание бэкапа
cp /var/www/ogtest/backend/statistics.db /var/www/ogtest/backups/statistics_$(date +%Y%m%d_%H%M%S).db

# Автоматический бэкап (добавить в crontab)
crontab -e
# Добавить строку:
# 0 2 * * * cp /var/www/ogtest/backend/statistics.db /var/www/ogtest/backups/statistics_$(date +\%Y\%m\%d).db
```

## Производительность

### Мониторинг ресурсов
```bash
pm2 monit  # CPU и память PM2
htop       # Общий мониторинг системы
```

### Настройка PM2 для production
В `ecosystem.config.js` можно настроить:
- `instances: 'max'` - использование всех CPU ядер (cluster mode)
- `max_memory_restart` - автоперезапуск при превышении памяти
- `cron_restart` - перезапуск по расписанию

## Безопасность

### Дополнительные рекомендации
1. Регулярно обновляйте систему: `sudo apt update && sudo apt upgrade`
2. Настройте fail2ban для защиты от брутфорса SSH
3. Используйте SSH ключи вместо паролей
4. Регулярно делайте бэкапы базы данных
5. Мониторьте логи на подозрительную активность

### Настройка fail2ban (опционально)
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

**Готово!** Ваше приложение теперь доступно на субдомене с SSL и автоматическим перезапуском.
