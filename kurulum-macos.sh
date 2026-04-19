#!/bin/bash
echo "========================================="
echo "  WhatsApp Sender - macOS Kurulum"
echo "========================================="
echo ""

# Node.js kontrolü
if command -v node &> /dev/null; then
    echo "[OK] Node.js zaten kurulu: $(node -v)"
else
    echo "[...] Node.js kuruluyor..."
    # Homebrew var mı kontrol et
    if command -v brew &> /dev/null; then
        brew install node
    else
        echo "[...] Homebrew kuruluyor..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        brew install node
    fi
    echo "[OK] Node.js kuruldu: $(node -v)"
fi

echo ""

# Proje klasörüne git
cd "$(dirname "$0")"
echo "[...] Bağımlılıklar kuruluyor (bu birkaç dakika sürebilir)..."
npm install

echo ""
echo "========================================="
echo "  Kurulum tamamlandı!"
echo "  Çalıştırmak için: npm start"
echo "========================================="
