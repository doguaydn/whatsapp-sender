@echo off
echo =========================================
echo   WhatsApp Sender - Windows Kurulum
echo =========================================
echo.

:: Node.js kontrolu
where node >nul 2>nul
if %errorlevel%==0 (
    echo [OK] Node.js zaten kurulu.
    node -v
) else (
    echo [!!] Node.js bulunamadi.
    echo.
    echo Node.js indiriliyor...
    curl -o nodejs-installer.msi https://nodejs.org/dist/v22.13.0/node-v22.13.0-x64.msi
    if exist nodejs-installer.msi (
        echo Node.js kuruluyor... Kurulum ekraninda "Next" diyerek ilerleyin.
        start /wait msiexec /i nodejs-installer.msi /passive
        del nodejs-installer.msi
        echo [OK] Node.js kuruldu. Bu pencereyi kapatin ve tekrar calistirin.
        pause
        exit
    ) else (
        echo [HATA] Indirme basarisiz. Lutfen https://nodejs.org adresinden manuel indirin.
        pause
        exit
    )
)

echo.
echo [...] Bagimliliklar kuruluyor (birkac dakika surebilir)...
cd /d "%~dp0"
call npm install

echo.
echo =========================================
echo   Kurulum tamamlandi!
echo   Calistirmak icin: npm start
echo   veya baslat.bat dosyasini cift tiklayin
echo =========================================
pause
