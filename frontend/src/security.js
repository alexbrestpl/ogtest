/**
 * Модуль защиты экзаменационного приложения от читерства
 * Блокирует: copy-paste, right-click, DevTools, выделение текста
 * Мониторинг: смена вкладок/окон, DevTools открытие
 */

// Счетчик смены фокуса
let focusSwitchCount = 0;
let devToolsDetected = false;

// Колбэки для событий
let onFocusSwitchCallback = null;
let onDevToolsOpenCallback = null;

/**
 * Инициализация защитных механизмов
 */
function initSecurity(options = {}) {
    onFocusSwitchCallback = options.onFocusSwitch || null;
    onDevToolsOpenCallback = options.onDevToolsOpen || null;

    // 1. Блокировка контекстного меню (правая кнопка мыши)
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    // 2. Блокировка горячих клавиш
    document.addEventListener('keydown', (e) => {
        // Блокировка Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+X
        if (e.ctrlKey && ['c', 'v', 'a', 'x'].includes(e.key.toLowerCase())) {
            e.preventDefault();
            return false;
        }

        // Блокировка F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U
        if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase())) ||
            (e.ctrlKey && e.key.toLowerCase() === 'u')
        ) {
            e.preventDefault();
            if (!devToolsDetected && onDevToolsOpenCallback) {
                devToolsDetected = true;
                onDevToolsOpenCallback();
            }
            return false;
        }
    });

    // 3. Блокировка копирования и вырезания
    document.addEventListener('copy', (e) => {
        e.preventDefault();
        return false;
    });

    document.addEventListener('cut', (e) => {
        e.preventDefault();
        return false;
    });

    // 4. Блокировка вставки
    document.addEventListener('paste', (e) => {
        e.preventDefault();
        return false;
    });

    // 5. Отслеживание смены фокуса окна
    let lastFocusTime = Date.now();

    window.addEventListener('blur', () => {
        const now = Date.now();
        // Игнорируем быстрые переключения (< 500ms)
        if (now - lastFocusTime > 500) {
            focusSwitchCount++;
            lastFocusTime = now;

            if (onFocusSwitchCallback) {
                onFocusSwitchCallback(focusSwitchCount);
            }
        }
    });

    window.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            const now = Date.now();
            if (now - lastFocusTime > 500) {
                focusSwitchCount++;
                lastFocusTime = now;

                if (onFocusSwitchCallback) {
                    onFocusSwitchCallback(focusSwitchCount);
                }
            }
        }
    });

    // 6. Детектирование DevTools (console.log timing)
    const devToolsChecker = setInterval(() => {
        const start = performance.now();
        debugger; // eslint-disable-line no-debugger
        const end = performance.now();

        // Если debugger задержал выполнение > 100ms, значит DevTools открыт
        if (end - start > 100 && !devToolsDetected) {
            devToolsDetected = true;
            if (onDevToolsOpenCallback) {
                onDevToolsOpenCallback();
            }
        }
    }, 1000);

    // 7. Детектирование изменения размера окна (признак открытия DevTools)
    let windowWidth = window.outerWidth;
    let windowHeight = window.outerHeight;

    window.addEventListener('resize', () => {
        const widthDiff = Math.abs(window.outerWidth - windowWidth);
        const heightDiff = Math.abs(window.outerHeight - windowHeight);

        // Если размер изменился значительно (> 200px), возможно открыли DevTools
        if ((widthDiff > 200 || heightDiff > 200) && !devToolsDetected) {
            devToolsDetected = true;
            if (onDevToolsOpenCallback) {
                onDevToolsOpenCallback();
            }
        }

        windowWidth = window.outerWidth;
        windowHeight = window.outerHeight;
    });

    console.log('🔒 Защита активирована');
}

/**
 * Создать водяной знак с UUID пользователя
 */
function createWatermark(userUuid) {
    // Удаляем старый watermark если есть
    const existing = document.getElementById('security-watermark');
    if (existing) {
        existing.remove();
    }

    const watermark = document.createElement('div');
    watermark.id = 'security-watermark';
    watermark.className = 'security-watermark';
    watermark.textContent = `ID: ${userUuid}`;

    document.body.appendChild(watermark);
}

/**
 * Показать предупреждение о смене фокуса
 */
function showFocusWarning(count) {
    const existing = document.getElementById('focus-warning');
    if (existing) {
        existing.remove();
    }

    const warning = document.createElement('div');
    warning.id = 'focus-warning';
    warning.className = 'focus-warning';
    warning.innerHTML = `
        <div class="focus-warning-content">
            <span class="warning-icon">⚠️</span>
            <p>Обнаружена смена окна/вкладки</p>
            <p class="warning-count">Количество переключений: ${count}</p>
            <p class="warning-note">Подозрительная активность фиксируется</p>
        </div>
    `;

    document.body.appendChild(warning);

    // Автоматически скрыть через 5 секунд
    setTimeout(() => {
        warning.style.opacity = '0';
        setTimeout(() => warning.remove(), 500);
    }, 5000);
}

/**
 * Показать предупреждение о попытке открыть DevTools
 */
function showDevToolsWarning() {
    const existing = document.getElementById('devtools-warning');
    if (existing) {
        return; // Показываем только один раз
    }

    const warning = document.createElement('div');
    warning.id = 'devtools-warning';
    warning.className = 'devtools-warning';
    warning.innerHTML = `
        <div class="devtools-warning-content">
            <span class="warning-icon">🚨</span>
            <h3>Внимание!</h3>
            <p>Обнаружена попытка открыть инструменты разработчика</p>
            <p class="warning-note">Это действие зафиксировано и может привести к аннулированию результата теста</p>
        </div>
    `;

    document.body.appendChild(warning);

    // Автоматически скрыть через 5 секунд
    setTimeout(() => {
        warning.style.opacity = '0';
        setTimeout(() => warning.remove(), 500);
    }, 5000);
}

/**
 * Получить количество смен фокуса
 */
function getFocusSwitchCount() {
    return focusSwitchCount;
}

/**
 * Проверка DevTools
 */
function isDevToolsOpen() {
    return devToolsDetected;
}

// Экспорт функций
window.Security = {
    init: initSecurity,
    createWatermark: createWatermark,
    showFocusWarning: showFocusWarning,
    showDevToolsWarning: showDevToolsWarning,
    getFocusSwitchCount: getFocusSwitchCount,
    isDevToolsOpen: isDevToolsOpen
};
