#!/bin/bash
#
# Скрипт удаления workaround для CVE-2026-31431
# Запускать ТОЛЬКО после установки патча ядра!
#
# Использование:
#   bash remove_cve_2026_31431_workaround.sh
#

set -e

echo "=================================================="
echo "CVE-2026-31431 Workaround Removal Script"
echo "=================================================="
echo ""

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Ошибка: Скрипт должен быть запущен с правами root"
    echo "   Используйте: sudo bash remove_cve_2026_31431_workaround.sh"
    exit 1
fi

# Информация о системе
echo "📋 Информация о системе:"
echo "   Kernel: $(uname -r)"
echo "   Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Проверка наличия workaround
if [ ! -f /etc/modprobe.d/blacklist-algif_aead.conf ]; then
    echo "ℹ️  Workaround не установлен"
    echo "   Файл /etc/modprobe.d/blacklist-algif_aead.conf не найден"
    exit 0
fi

# Предупреждение
echo "⚠️  ВАЖНО: Этот скрипт удаляет workaround для CVE-2026-31431"
echo "   Убедитесь, что патч ядра установлен!"
echo ""
read -p "Вы установили обновление ядра с патчем CVE-2026-31431? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Отменено."
    echo "Сначала обновите ядро, затем запустите этот скрипт."
    exit 0
fi

# Удаление blacklist файла
echo "🔧 Удаление blacklist конфигурации..."
rm /etc/modprobe.d/blacklist-algif_aead.conf
echo "✅ Файл удален: /etc/modprobe.d/blacklist-algif_aead.conf"
echo ""

# Логирование
LOG_FILE="/root/security-patches.log"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] CVE-2026-31431 workaround removed (kernel: $(uname -r))" >> "$LOG_FILE"
echo "📝 Действие залогировано в: $LOG_FILE"
echo ""

echo "=================================================="
echo "✅ Workaround успешно удален!"
echo "=================================================="
echo ""
echo "Модуль algif_aead будет доступен после перезагрузки."
echo ""
read -p "Перезагрузить сервер сейчас? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔄 Перезагрузка через 5 секунд..."
    echo "   (Ctrl+C для отмены)"
    sleep 5
    reboot
else
    echo "Не забудьте перезагрузить сервер позже: sudo reboot"
fi
