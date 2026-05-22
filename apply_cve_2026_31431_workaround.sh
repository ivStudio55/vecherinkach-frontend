#!/bin/bash
#
# Скрипт применения workaround для CVE-2026-31431 (Copy Fail Linux Kernel)
# Дата: 1 мая 2026
# Уровень опасности: 7.8/10
#
# Использование:
#   bash apply_cve_2026_31431_workaround.sh
#

set -e

echo "=================================================="
echo "CVE-2026-31431 Workaround Application Script"
echo "=================================================="
echo ""

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Ошибка: Скрипт должен быть запущен с правами root"
    echo "   Используйте: sudo bash apply_cve_2026_31431_workaround.sh"
    exit 1
fi

# Информация о системе
echo "📋 Информация о системе:"
echo "   Hostname: $(hostname)"
echo "   OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "   Kernel: $(uname -r)"
echo "   Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Проверка, не применен ли уже workaround
if [ -f /etc/modprobe.d/blacklist-algif_aead.conf ]; then
    echo "⚠️  Workaround уже применен!"
    echo "   Файл /etc/modprobe.d/blacklist-algif_aead.conf существует"
    echo ""
    cat /etc/modprobe.d/blacklist-algif_aead.conf
    echo ""
    read -p "Переприменить workaround? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Отменено."
        exit 0
    fi
    rm /etc/modprobe.d/blacklist-algif_aead.conf
fi

# Создание blacklist конфигурации
echo "🔧 Создание blacklist для модуля algif_aead..."
tee /etc/modprobe.d/blacklist-algif_aead.conf > /dev/null <<'EOF'
# CVE-2026-31431 Workaround
# Applied: $(date '+%Y-%m-%d %H:%M:%S')
# Remove this file after kernel patch is installed
blacklist algif_aead
install algif_aead /bin/false
EOF

echo "✅ Файл создан: /etc/modprobe.d/blacklist-algif_aead.conf"
echo ""

# Проверка загружен ли модуль
echo "🔍 Проверка загруженного модуля algif_aead..."
if lsmod | grep -q algif_aead; then
    echo "⚠️  Модуль algif_aead загружен в память"
    echo "   Попытка выгрузить модуль..."
    
    if modprobe -r algif_aead 2>/dev/null; then
        echo "✅ Модуль успешно выгружен"
        echo ""
        echo "=================================================="
        echo "✅ Workaround успешно применен!"
        echo "   Перезагрузка НЕ требуется."
        echo "=================================================="
    else
        echo "❌ Не удалось выгрузить модуль (возможно, используется)"
        echo ""
        echo "⚠️  ТРЕБУЕТСЯ ПЕРЕЗАГРУЗКА СЕРВЕРА"
        echo ""
        read -p "Перезагрузить сервер сейчас? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "🔄 Перезагрузка через 5 секунд..."
            echo "   (Ctrl+C для отмены)"
            sleep 5
            reboot
        else
            echo "⚠️  Не забудьте перезагрузить сервер вручную!"
            echo "   Команда: sudo reboot"
        fi
    fi
else
    echo "✅ Модуль algif_aead не загружен"
    echo ""
    echo "=================================================="
    echo "✅ Workaround успешно применен!"
    echo "=================================================="
fi

# Логирование
LOG_FILE="/root/security-patches.log"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] CVE-2026-31431 workaround applied (kernel: $(uname -r))" >> "$LOG_FILE"
echo ""
echo "📝 Действие залогировано в: $LOG_FILE"
echo ""

# Инструкции по мониторингу патча
echo "=================================================="
echo "📌 Следующие шаги:"
echo "=================================================="
echo ""
echo "1. Следите за выходом патча для вашего дистрибутива:"
echo ""

# Определение дистрибутива и ссылка
if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "$ID" in
        ubuntu)
            echo "   Ubuntu: https://ubuntu.com/security/CVE-2026-31431"
            ;;
        debian)
            echo "   Debian: https://security-tracker.debian.org/tracker/CVE-2026-31431"
            ;;
        rhel|centos|rocky|almalinux)
            echo "   RHEL: https://access.redhat.com/security/cve/CVE-2026-31431"
            ;;
        fedora)
            echo "   Fedora: https://bodhi.fedoraproject.org/"
            ;;
        arch)
            echo "   Arch: https://security.archlinux.org/"
            ;;
        *)
            echo "   Проверьте безопасность вашего дистрибутива"
            ;;
    esac
fi

echo ""
echo "2. После установки патча обновите ядро:"
echo "   sudo apt update && sudo apt upgrade"  # для Debian/Ubuntu
echo "   sudo reboot"
echo ""
echo "3. Удалите workaround:"
echo "   bash remove_cve_2026_31431_workaround.sh"
echo ""
echo "=================================================="
