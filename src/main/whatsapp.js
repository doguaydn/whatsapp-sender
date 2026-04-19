const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');
const { app } = require('electron');

class WhatsAppService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isReady = false;
  }

  initialize() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: path.join(app.getPath('userData'), '.wwebjs_auth'),
      }),
      puppeteer: {
        headless: true,
        executablePath: puppeteer.executablePath(),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      },
    });

    this.client.on('qr', (qr) => {
      this.emit('qr', qr);
    });

    this.client.on('auth_failure', (msg) => {
      this.emit('disconnected', msg);
    });

    this.client.on('ready', () => {
      this.isReady = true;
      this.emit('ready');
    });

    this.client.on('disconnected', (reason) => {
      this.isReady = false;
      this.emit('disconnected', reason);
    });

    this.client.initialize().catch((err) => {
      console.error('WhatsApp initialization error:', err);
    });
  }

  formatNumber(phone) {
    // Tüm boşluk, tire, parantez, artı işaretlerini temizle
    let cleaned = String(phone).replace(/[\s\-\(\)\+\.]/g, '');

    // Başındaki 90'ı kontrol et
    if (cleaned.startsWith('900')) {
      // 900532... → 90532...
      cleaned = '90' + cleaned.substring(3);
    } else if (cleaned.startsWith('0')) {
      // 0532... → 90532...
      cleaned = '90' + cleaned.substring(1);
    } else if (cleaned.startsWith('90')) {
      // zaten doğru formatta
    } else if (cleaned.length === 10) {
      // 5321234567 → 905321234567
      cleaned = '90' + cleaned;
    }

    if (!cleaned.includes('@')) {
      cleaned = cleaned + '@c.us';
    }
    return cleaned;
  }

  // Kişiden telefon numarasını bul (dinamik sütun desteği)
  findPhone(contact) {
    // Renderer'dan gelen _phone alanı varsa kullan
    if (contact._phone) return contact._phone;

    // Standartlaştırılmış alan
    if (contact['Telefon']) return contact['Telefon'];

    // Geniş pattern eşleştirmesi
    const phonePatterns = [
      'telefon', 'phone', 'tel', 'numara', 'cep', 'gsm', 'mobile',
      'no', 'iletisim', 'iletişim', 'hücre', 'cell',
    ];
    for (const key of Object.keys(contact)) {
      const lower = key.toLowerCase().replace(/[_\-\.]/g, ' ').trim();
      if (phonePatterns.some((p) => lower === p || lower.includes(p))) {
        return contact[key];
      }
    }

    // Son çare: telefon numarasına benzeyen değer
    for (const val of Object.values(contact)) {
      const cleaned = String(val || '').replace(/[\s\-\(\)\+\.]/g, '');
      if (/^\d{10,13}$/.test(cleaned)) return val;
    }

    return null;
  }

  interpolateMessage(template, contact) {
    let message = template;
    for (const [key, value] of Object.entries(contact)) {
      const placeholder = new RegExp(`\\{${key}\\}`, 'gi');
      message = message.replace(placeholder, value || '');
    }
    return message;
  }

  async sendMessage(contact, messageTemplate, mediaPath = null) {
    if (!this.isReady) {
      throw new Error('WhatsApp bağlantısı yok');
    }

    const phone = this.findPhone(contact);
    if (!phone) {
      throw new Error('Telefon numarası bulunamadı');
    }

    const chatId = this.formatNumber(phone);
    const message = this.interpolateMessage(messageTemplate, contact);

    // Kişiden okunabilir isim bul
    const displayName = contact['İsim'] || contact['isim'] || contact['Ad'] || contact['ad'] ||
      contact['name'] || contact['Name'] || contact['Adı'] || '';
    const displayPhone = String(phone);

    try {
      let media = null;
      if (mediaPath && fs.existsSync(mediaPath)) {
        media = MessageMedia.fromFilePath(mediaPath);
      }

      if (media) {
        await this.client.sendMessage(chatId, media, { caption: message });
      } else {
        await this.client.sendMessage(chatId, message);
      }

      this.emit('message-status', {
        phone: displayPhone,
        name: displayName,
        status: 'sent',
        timestamp: new Date().toISOString(),
      });

      return { success: true, phone: displayPhone, name: displayName };
    } catch (error) {
      this.emit('message-status', {
        phone: displayPhone,
        name: displayName,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      return { success: false, phone: displayPhone, name: displayName, error: error.message };
    }
  }

  async sendBulkMessages(contacts, messageTemplate, mediaPath = null) {
    const results = [];
    this._paused = false;
    this._stopped = false;

    const BATCH_SIZE = 50;         // Her 50 mesajda bir kısa mola
    const BATCH_PAUSE_MS = 60000;  // 1 dakika mola
    const MIN_DELAY = 2000;        // Minimum 2 saniye
    const MAX_DELAY = 4000;        // Maximum 4 saniye

    for (let i = 0; i < contacts.length; i++) {
      // Durduruldu mu kontrol et
      if (this._stopped) {
        this.emit('bulk-stopped', { sent: i, total: contacts.length });
        break;
      }

      // Duraklatıldı mı kontrol et
      while (this._paused) {
        await this.delay(500);
        if (this._stopped) break;
      }

      const contact = contacts[i];

      const result = await this.sendMessage(contact, messageTemplate, mediaPath);
      results.push(result);

      // Son mesaj değilse bekle
      if (i < contacts.length - 1) {
        // Her BATCH_SIZE mesajda uzun mola
        if ((i + 1) % BATCH_SIZE === 0) {
          this.emit('bulk-pause', {
            sent: i + 1,
            total: contacts.length,
            pauseMinutes: BATCH_PAUSE_MS / 60000,
          });
          await this.delay(BATCH_PAUSE_MS);
        } else {
          // Rastgele bekleme
          const randomDelay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
          await this.delay(randomDelay);
        }
      }
    }

    return results;
  }

  pauseSending() { this._paused = true; }
  resumeSending() { this._paused = false; }
  stopSending() { this._stopped = true; this._paused = false; }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async logout() {
    if (this.client) {
      try {
        await this.client.logout();
      } catch (e) {}
      await this.client.destroy().catch(() => {});
      this.isReady = false;
      this.emit('disconnected');
      this.initialize();
    }
  }

  async destroy() {
    if (this.client) {
      await this.client.destroy().catch(() => {});
    }
  }
}

module.exports = { WhatsAppService };
