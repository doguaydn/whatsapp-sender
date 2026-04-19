/* ========================================
   WhatsApp Sender — Renderer Application
   ======================================== */

class App {
  constructor() {
    this.contacts = [];
    this.columns = [];
    this.phoneColumn = null;
    this.selectedContacts = new Set();
    this.currentMediaPath = null;
    this.contactLists = [];
    this.activeListId = 'all';

    this.init();
  }

  async init() {
    this.bindNavigation();
    this.bindContactEvents();
    this.bindMessageEvents();
    this.bindTemplateEvents();
    this.bindScheduleEvents();
    this.bindReportEvents();
    this.bindWhatsAppEvents();
    this.bindThemeToggle();
    this.bindLogout();
    this.bindListEvents();
    this.bindEmojiPicker();
    this.bindVcfEvents();

    // Listeleri yükle ve tümünü göster
    await this.loadContactLists();
    this.switchToList('all');

    this.loadTemplates();
    this.loadScheduledMessages();
    this.loadReports();
  }

  // ========================================
  // Toast Bildirimleri
  // ========================================

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ========================================
  // Navigasyon
  // ========================================

  bindNavigation() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        this.navigateTo(page);
      });
    });

    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-page]') && e.target.classList.contains('btn-link')) {
        this.navigateTo(e.target.dataset.page);
      }
    });
  }

  navigateTo(page) {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));

    const btn = document.querySelector(`.nav-btn[data-page="${page}"]`);
    const pageEl = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));

    if (btn) btn.classList.add('active');
    if (pageEl) pageEl.classList.add('active');

    if (page === 'message') {
      this.updateRecipientsInfo();
      this.updateMessagePreview();
      this.loadTemplateSelect();
      this.updateVariableTags();
    } else if (page === 'lists') {
      this.loadContactLists();
    }
  }

  // ========================================
  // WhatsApp Bağlantı
  // ========================================

  bindWhatsAppEvents() {
    const statusEl = document.getElementById('connectionStatus');
    const qrPage = document.getElementById('pageQR');
    let lastQr = null;
    let wasReady = false;

    document.getElementById('btnReconnect').addEventListener('click', () => {
      window.api.reconnectWhatsApp();
      this.showToast('Yeniden bağlanılıyor...', 'info');
    });

    window.api.onMessageStatus((data) => {
      this.updateProgressLog(data);
    });

    // WhatsApp durumunu polling ile takip et
    const pollStatus = async () => {
      try {
        const state = await window.api.pollWhatsApp();
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('.status-text');

        if (state.isReady) {
          if (!wasReady) {
            dot.className = 'status-dot connected';
            text.textContent = 'Bağlı';
            qrPage.classList.remove('active');
            qrPage.classList.add('hidden');
            this.navigateTo('contacts');
            this.showToast('WhatsApp bağlantısı kuruldu!', 'success');
            wasReady = true;
            lastQr = null;
          }
        } else if (state.qr) {
          if (state.qr !== lastQr) {
            dot.className = 'status-dot connecting';
            text.textContent = 'QR kod taranıyor...';
            qrPage.classList.add('active');
            qrPage.classList.remove('hidden');
            const qrContainer = document.getElementById('qrCode');
            qrContainer.innerHTML = `<img src="${state.qr}" alt="QR Code">`;
            lastQr = state.qr;
            wasReady = false;
          }
        } else if (wasReady) {
          dot.className = 'status-dot disconnected';
          text.textContent = 'Bağlantı kesildi';
          qrPage.classList.add('active');
          qrPage.classList.remove('hidden');
          wasReady = false;
          lastQr = null;
        }
      } catch (e) {}
    };

    // Her 2 saniyede bir kontrol et
    pollStatus();
    setInterval(pollStatus, 2000);
  }

  // ========================================
  // Kişi Yönetimi
  // ========================================

  bindContactEvents() {
    document.getElementById('btnImportExcel').addEventListener('click', () => this.importExcel());

    document.getElementById('btnAddContact').addEventListener('click', () => {
      this.buildContactForm();
      document.getElementById('addContactForm').classList.toggle('hidden');
    });

    document.getElementById('btnCancelContact').addEventListener('click', () => {
      document.getElementById('addContactForm').classList.add('hidden');
      this.clearContactForm();
    });

    document.getElementById('btnSaveContact').addEventListener('click', () => this.addManualContact());

    document.getElementById('searchContacts').addEventListener('input', (e) => {
      this.renderContacts(e.target.value);
    });

    document.getElementById('selectAll').addEventListener('change', (e) => {
      if (e.target.checked) {
        this.contacts.forEach((_, i) => this.selectedContacts.add(i));
      } else {
        this.selectedContacts.clear();
      }
      this.renderContacts();
      this.updateSelectedCount();
    });

    document.getElementById('btnDeleteSelected').addEventListener('click', () => {
      if (this.selectedContacts.size === 0) return;
      const indices = Array.from(this.selectedContacts).sort((a, b) => b - a);
      indices.forEach((i) => this.contacts.splice(i, 1));
      this.selectedContacts.clear();
      this.renderContacts();
      this.updateSelectedCount();
      this.saveContactsToStore();
      this.showToast('Seçili kişiler silindi', 'info');
    });
  }

  // ========================================
  // Akıllı Sütun Algılama
  // ========================================

  // Sütun adından alan tipini tahmin et
  guessFieldByName(colName) {
    // Türkçe karakterleri normalize et ve küçük harfe çevir
    const col = colName
      .replace(/İ/gi, 'i').replace(/I/g, 'ı')
      .toLowerCase()
      .replace(/[_\-\.:\(\)]/g, ' ')
      .trim();

    // Telefon — önce kontrol et (iletişim dahil)
    const phoneWords = [
      'telefon', 'phone', 'tel', 'numara', 'cep', 'gsm', 'mobile',
      'iletisim', 'iletişim', 'no', 'hücre', 'hucre', 'cell',
      'tel no', 'cep no', 'cep tel', 'gsm no', 'telefon no',
      'phone number', 'mobile number', 'cep telefon',
    ];
    if (phoneWords.some((p) => col === p || col.startsWith(p + ' ') || col.endsWith(' ' + p))) {
      return 'telefon';
    }

    // Birleşik Ad Soyad — telefon kontrolünden sonra
    const fullNameWords = [
      'ad soyad', 'adsoyad', 'adı soyadı', 'adi soyadi',
      'isim soyisim', 'isim soyad', 'ad-soyad',
      'tam ad', 'tam isim', 'full name', 'fullname',
      'müşteri', 'musteri', 'müşteri adı', 'kişi', 'kisi',
      'müsteri adi',
    ];
    if (fullNameWords.some((p) => col === p || col.includes(p))) return 'adsoyad';

    // İsim
    const nameWords = [
      'isim', 'İsim', 'ad', 'adı', 'adi', 'name', 'first',
      'firstname', 'first name',
    ];
    if (nameWords.some((p) => col === p.toLowerCase())) return 'isim';
    // "ad" veya "adı" ile başlayan kısa sütun adları
    if (/^ad[ıi]?$/.test(col)) return 'isim';

    // Soyisim
    const surnameWords = [
      'soyisim', 'soyad', 'soyadı', 'soyadi', 'surname', 'lastname',
      'last name', 'last', 'soy ad', 'soy isim',
    ];
    if (surnameWords.some((p) => col === p)) return 'soyisim';
    if (/^soyad[ıi]?$/.test(col)) return 'soyisim';

    // Ünvan
    const titleWords = [
      'ünvan', 'unvan', 'görev', 'gorev', 'pozisyon', 'title', 'position',
      'meslek', 'rol', 'role',
    ];
    if (titleWords.some((p) => col === p || col.includes(p))) return 'unvan';

    return null;
  }

  // Veri içeriğinden telefon sütununu tahmin et
  guessPhoneByData(rows, columns) {
    for (const col of columns) {
      const values = rows.slice(0, 10).map((r) => String(r[col] || '').trim()).filter(Boolean);
      if (values.length === 0) continue;

      const phoneCount = values.filter((v) => {
        const cleaned = v.replace(/[\s\-\(\)\+\.]/g, '');
        // 10-13 haneli sayı, başında 0, 90, +90 olabilir
        return /^\d{10,13}$/.test(cleaned);
      }).length;

      // Değerlerin %70'inden fazlası telefon gibi görünüyorsa
      if (phoneCount / values.length >= 0.7) return col;
    }
    return null;
  }

  // Excel verilerini standart formata dönüştür
  normalizeExcelData(rows, columns) {
    // Sütun eşlemesi oluştur
    const mapping = {};
    const usedFields = new Set();

    // 1. Sütun adına göre algıla
    for (const col of columns) {
      const field = this.guessFieldByName(col);
      if (field && !usedFields.has(field)) {
        mapping[col] = field;
        usedFields.add(field);
      }
    }

    // 2. Telefon bulunamadıysa veri içeriğine göre algıla
    if (!usedFields.has('telefon')) {
      const unmappedCols = columns.filter((c) => !mapping[c]);
      const phoneCol = this.guessPhoneByData(rows, unmappedCols.length > 0 ? unmappedCols : columns);
      if (phoneCol) {
        mapping[phoneCol] = 'telefon';
        usedFields.add('telefon');
      }
    }

    // Kişileri dönüştür
    return rows.map((row) => {
      const contact = {};

      for (const col of columns) {
        const value = String(row[col] ?? '').trim();
        const field = mapping[col];

        if (field === 'adsoyad') {
          // Birleşik "Ad Soyad" sütununu ayır
          const parts = value.split(/\s+/);
          if (parts.length >= 2) {
            contact['İsim'] = parts[0];
            contact['Soyisim'] = parts.slice(1).join(' ');
          } else {
            contact['İsim'] = value;
            contact['Soyisim'] = '';
          }
        } else if (field === 'telefon') {
          contact['Telefon'] = value;
        } else if (field === 'isim') {
          contact['İsim'] = value;
        } else if (field === 'soyisim') {
          contact['Soyisim'] = value;
        } else if (field === 'unvan') {
          contact['Ünvan'] = value;
        } else {
          // Bilinmeyen sütunları orijinal adıyla ekle
          contact[col] = value;
        }
      }

      return contact;
    });
  }

  // Telefon sütununu algıla (mevcut kişiler için)
  detectPhoneColumn(columns) {
    for (const col of columns) {
      const field = this.guessFieldByName(col);
      if (field === 'telefon') return col;
    }
    // İsme göre bulunamadıysa, varsayılan "Telefon" var mı
    if (columns.includes('Telefon')) return 'Telefon';
    return null;
  }

  // Mevcut kişilerden sütunları algıla
  detectColumns() {
    if (this.contacts.length === 0) {
      this.columns = [];
      this.phoneColumn = null;
      return;
    }
    const keySet = new Set();
    this.contacts.forEach((c) => Object.keys(c).forEach((k) => keySet.add(k)));
    this.columns = Array.from(keySet);
    this.phoneColumn = this.detectPhoneColumn(this.columns);
  }

  async importExcel() {
    const result = await window.api.importExcel();
    if (!result) return;

    if (result.rows.length === 0) {
      this.showToast('Excel dosyası boş', 'error');
      return;
    }

    // Liste adı sor
    const listName = await this.showPrompt('Liste Adı', 'Örn: Müşteriler, Ekip...');
    if (!listName) return;

    // Akıllı sütun algılama ile kişileri oluştur
    const newContacts = this.normalizeExcelData(result.rows, result.columns);

    // Listeyi kaydet
    const list = await window.api.saveContactList({
      name: listName,
      contacts: newContacts,
    });

    await this.loadContactLists();

    // Aktif listeyi yeni listeye geçir
    this.switchToList(list.id);

    this.showToast(`"${listName}" listesi oluşturuldu (${newContacts.length} kişi)`, 'success');
  }

  // Kişi ekleme formunu mevcut sütunlara göre oluştur
  buildContactForm() {
    const container = document.getElementById('addContactFields');
    const cols = this.columns.length > 0 ? this.columns : ['Telefon', 'İsim', 'Soyisim'];

    // Telefon sütununu başa al
    const phoneCols = cols.filter((c) => this.guessFieldByName(c) === 'telefon' || c === 'Telefon');
    const otherCols = cols.filter((c) => !phoneCols.includes(c));
    const orderedCols = [...phoneCols, ...otherCols];

    container.innerHTML = orderedCols
      .map((col) => {
        const isPhone = phoneCols.includes(col);
        return `
          <div class="form-group">
            <label>${this.escapeHtml(col)}${isPhone ? ' *' : ''}</label>
            <input type="text" class="contact-field-input" data-column="${this.escapeHtml(col)}" placeholder="${this.escapeHtml(col)}">
          </div>`;
      })
      .join('');
  }

  async addManualContact() {
    const inputs = document.querySelectorAll('#addContactFields .contact-field-input');
    const contact = {};
    let hasPhone = false;

    let phoneValue = '';

    inputs.forEach((input) => {
      const col = input.dataset.column;
      const val = input.value.trim();
      contact[col] = val;

      if (val && (this.guessFieldByName(col) === 'telefon' || col === 'Telefon')) {
        hasPhone = true;
        phoneValue = val;
      }
    });

    if (!hasPhone) {
      this.showToast('Telefon numarası zorunludur', 'error');
      return;
    }

    // Telefon numarası geçerli mi kontrol et
    const cleaned = phoneValue.replace(/[\s\-\(\)\+\.]/g, '');
    if (!/^\d{10,13}$/.test(cleaned)) {
      this.showToast('Geçersiz telefon numarası', 'error');
      return;
    }

    this.contacts.push(contact);

    // Aktif listeye ekle, "Tümü" ise "Genel" listesi oluştur/bul
    if (this.activeListId === 'all') {
      let generalList = this.contactLists.find((l) => l.name === 'Eklediklerim');
      if (!generalList) {
        generalList = await window.api.saveContactList({ name: 'Eklediklerim', contacts: [contact] });
        await this.loadContactLists();
      } else {
        generalList.contacts.push(contact);
        await window.api.updateContactList(generalList.id, { contacts: generalList.contacts });
        this.renderListChips();
      }
    } else {
      const list = this.contactLists.find((l) => l.id === this.activeListId);
      if (list) {
        list.contacts.push(contact);
        await window.api.updateContactList(list.id, { contacts: list.contacts });
        this.renderListChips();
      }
    }

    this.detectColumns();
    this.renderContacts();
    this.clearContactForm();
    document.getElementById('addContactForm').classList.add('hidden');
    this.showToast('Kişi eklendi', 'success');
  }

  clearContactForm() {
    document.querySelectorAll('#addContactFields .contact-field-input').forEach((input) => {
      input.value = '';
    });
  }

  renderContacts(filter = '') {
    const thead = document.querySelector('#contactsTable thead tr');
    const tbody = document.getElementById('contactsBody');
    const filterLower = filter.toLowerCase();

    // Dinamik tablo başlıkları
    const cols = this.columns.length > 0 ? this.columns : ['Telefon', 'İsim', 'Soyisim'];
    thead.innerHTML =
      '<th class="th-checkbox"><input type="checkbox" id="selectAll"></th>' +
      cols.map((c) => `<th>${this.escapeHtml(c)}</th>`).join('') +
      '<th class="th-actions">İşlem</th>';

    // SelectAll yeniden bağla
    document.getElementById('selectAll').addEventListener('change', (e) => {
      if (e.target.checked) {
        this.contacts.forEach((_, i) => this.selectedContacts.add(i));
      } else {
        this.selectedContacts.clear();
      }
      this.renderContacts(filter);
      this.updateSelectedCount();
    });

    // Filtrele
    const filtered = this.contacts
      .map((c, i) => ({ ...c, _index: i }))
      .filter((c) => {
        if (!filter) return true;
        return Object.values(c).some((v) =>
          typeof v === 'string' && v.toLowerCase().includes(filterLower)
        );
      });

    if (filtered.length === 0) {
      const colSpan = cols.length + 2;
      tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="${colSpan}">
            <div class="empty-state">
              <p>${filter ? 'Sonuç bulunamadı' : 'Henüz kişi eklenmedi'}</p>
              <p class="empty-hint">${filter ? 'Farklı bir arama deneyin' : 'Excel yükleyin veya elle kişi ekleyin'}</p>
            </div>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((c) => {
        const checked = this.selectedContacts.has(c._index) ? 'checked' : '';
        const selectedClass = this.selectedContacts.has(c._index) ? 'selected' : '';
        const cells = cols.map((col) => `<td>${this.escapeHtml(c[col] || '')}</td>`).join('');
        return `
          <tr class="${selectedClass}" data-index="${c._index}">
            <td><input type="checkbox" class="contact-checkbox" data-index="${c._index}" ${checked}></td>
            ${cells}
            <td style="text-align:center">
              <button class="btn-icon btn-delete-contact" data-index="${c._index}" title="Sil">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </td>
          </tr>`;
      })
      .join('');

    // Checkbox event'leri
    tbody.querySelectorAll('.contact-checkbox').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        if (e.target.checked) {
          this.selectedContacts.add(index);
        } else {
          this.selectedContacts.delete(index);
        }
        this.renderContacts(filter);
        this.updateSelectedCount();
      });
    });

    // Silme butonları
    tbody.querySelectorAll('.btn-delete-contact').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        this.contacts.splice(index, 1);
        this.selectedContacts.clear();
        this.detectColumns();
        this.renderContacts();
        this.updateSelectedCount();
        this.saveContactsToStore();
      });
    });

    // SelectAll checkbox durumu
    document.getElementById('selectAll').checked =
      this.selectedContacts.size === this.contacts.length && this.contacts.length > 0;
  }

  updateSelectedCount() {
    document.getElementById('selectedCount').textContent = `${this.selectedContacts.size} kişi seçili`;
  }

  async saveContactsToStore() {
    if (this.activeListId !== 'all') {
      await this.saveActiveListContacts();
    }
    await window.api.saveContacts(this.contacts);
  }

  updateVariableTags() {
    const container = document.querySelector('.message-variables');
    if (!container) return;

    const keys = this.columns.length > 0 ? this.columns : ['Telefon', 'İsim', 'Soyisim'];
    container.innerHTML = keys
      .map((k) => `<span class="variable-tag" data-var="{${k}}">{${k}}</span>`)
      .join('');

    container.querySelectorAll('.variable-tag').forEach((tag) => {
      tag.addEventListener('click', () => {
        const textarea = document.getElementById('messageText');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + tag.dataset.var + text.substring(end);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + tag.dataset.var.length;
        this.updateMessagePreview();
      });
    });
  }

  // ========================================
  // Mesaj Gönderme
  // ========================================

  bindMessageEvents() {
    document.getElementById('btnAttachFile').addEventListener('click', async () => {
      const file = await window.api.selectMedia();
      if (file) {
        this.currentMediaPath = file.path;
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('btnRemoveFile').classList.remove('hidden');
      }
    });

    document.getElementById('btnRemoveFile').addEventListener('click', () => {
      this.currentMediaPath = null;
      document.getElementById('fileName').textContent = 'Dosya seçilmedi';
      document.getElementById('btnRemoveFile').classList.add('hidden');
    });

    document.getElementById('messageText').addEventListener('input', () => this.updateMessagePreview());

    document.querySelectorAll('.variable-tag').forEach((tag) => {
      tag.addEventListener('click', () => {
        const textarea = document.getElementById('messageText');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + tag.dataset.var + text.substring(end);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + tag.dataset.var.length;
        this.updateMessagePreview();
      });
    });

    document.getElementById('btnSendNow').addEventListener('click', () => this.sendMessages());

    // Duraklat/Devam et butonu
    let isPaused = false;
    document.getElementById('btnPauseSending').addEventListener('click', async () => {
      const btn = document.getElementById('btnPauseSending');
      if (isPaused) {
        await window.api.resumeSending();
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Duraklat';
        document.getElementById('progressTitle').textContent = 'Mesajlar gönderiliyor...';
        isPaused = false;
      } else {
        await window.api.pauseSending();
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Devam Et';
        document.getElementById('progressTitle').textContent = 'Duraklatıldı';
        isPaused = true;
      }
    });

    // Durdur butonu
    document.getElementById('btnStopSending').addEventListener('click', async () => {
      await window.api.stopSending();
      document.getElementById('progressTitle').textContent = 'Gönderim durduruldu';
      this.showToast('Gönderim durduruldu', 'info');
    });

    // Bulk mola bildirimi
    window.api.onBulkPause((data) => {
      const info = document.getElementById('progressInfo');
      info.classList.remove('hidden');
      info.textContent = `${data.sent}/${data.total} mesaj gönderildi. Ban koruması: ${data.pauseMinutes} dakika mola veriliyor...`;
      document.getElementById('progressTitle').textContent = 'Mola veriliyor...';

      // Mola bitince info'yu gizle
      setTimeout(() => {
        info.classList.add('hidden');
        document.getElementById('progressTitle').textContent = 'Mesajlar gönderiliyor...';
      }, data.pauseMinutes * 60000);
    });

    document.getElementById('btnScheduleSend').addEventListener('click', () => {
      document.getElementById('scheduleModal').classList.remove('hidden');
    });

    document.getElementById('btnSaveAsTemplate').addEventListener('click', () => this.saveCurrentAsTemplate());

    document.getElementById('btnClearMessage').addEventListener('click', () => {
      document.getElementById('messageText').value = '';
      document.getElementById('templateSelect').value = '';
      this.currentMediaPath = null;
      document.getElementById('fileName').textContent = 'Dosya seçilmedi';
      document.getElementById('btnRemoveFile').classList.add('hidden');
      this.updateMessagePreview();
      this.showToast('Mesaj temizlendi', 'info');
    });

    document.getElementById('templateSelect').addEventListener('change', (e) => {
      this.applyTemplate(e.target.value);
    });
  }

  updateRecipientsInfo() {
    const info = document.getElementById('recipientsInfo');
    const count = this.selectedContacts.size;
    info.querySelector('span').textContent = `${count} kişi seçili`;
  }

  updateMessagePreview() {
    const text = document.getElementById('messageText').value;
    const preview = document.getElementById('previewBubble');

    if (!text) {
      preview.innerHTML = '<p class="preview-text">Mesaj önizlemesi burada görünecek...</p>';
      return;
    }

    let previewText = text;
    if (this.contacts.length > 0) {
      const sampleContact = this.selectedContacts.size > 0
        ? this.contacts[Array.from(this.selectedContacts)[0]]
        : this.contacts[0];

      if (sampleContact) {
        for (const [key, value] of Object.entries(sampleContact)) {
          const placeholder = new RegExp(`\\{${key}\\}`, 'gi');
          previewText = previewText.replace(placeholder, value || '');
        }
      }
    }

    preview.innerHTML = `<p class="preview-text">${this.escapeHtml(previewText)}</p>`;
  }

  // Kişiden telefon numarasını al (hangi sütunda olursa olsun)
  getPhoneFromContact(contact) {
    // Standartlaştırılmış "Telefon" alanı
    if (contact['Telefon']) return contact['Telefon'];

    // phoneColumn varsa kullan
    if (this.phoneColumn && contact[this.phoneColumn]) {
      return contact[this.phoneColumn];
    }

    // Tüm anahtarlarda telefon alanını ara
    for (const key of Object.keys(contact)) {
      const field = this.guessFieldByName(key);
      if (field === 'telefon') return contact[key];
    }

    // Son çare: içerik bazlı — telefon numarasına benzeyen ilk değer
    for (const val of Object.values(contact)) {
      const cleaned = String(val || '').replace(/[\s\-\(\)\+\.]/g, '');
      if (/^\d{10,13}$/.test(cleaned)) return val;
    }

    return null;
  }

  async sendMessages() {
    if (this.selectedContacts.size === 0) {
      this.showToast('Lütfen en az bir kişi seçin', 'error');
      this.navigateTo('contacts');
      return;
    }

    const message = document.getElementById('messageText').value.trim();
    if (!message) {
      this.showToast('Lütfen mesaj yazın', 'error');
      return;
    }

    const status = await window.api.getWhatsAppStatus();
    if (!status.isReady) {
      this.showToast('WhatsApp bağlantısı yok', 'error');
      return;
    }

    const contacts = Array.from(this.selectedContacts).map((i) => {
      const c = { ...this.contacts[i] };
      // telefon alanını normalize et (whatsapp servisi için)
      c._phone = this.getPhoneFromContact(c);
      return c;
    });

    // Progress UI
    const progressEl = document.getElementById('sendProgress');
    const progressFill = document.getElementById('progressFill');
    const progressCount = document.getElementById('progressCount');
    const progressLog = document.getElementById('progressLog');

    progressEl.classList.remove('hidden');
    progressLog.innerHTML = '';
    progressCount.textContent = `0/${contacts.length}`;
    progressFill.style.width = '0%';

    const report = await window.api.sendMessage({
      contacts,
      message,
      mediaPath: this.currentMediaPath,
    });

    progressCount.textContent = `${contacts.length}/${contacts.length}`;
    progressFill.style.width = '100%';

    this.showToast(
      `${report.sent} gönderildi, ${report.failed} başarısız`,
      report.failed > 0 ? 'error' : 'success'
    );

    this.loadReports();
  }

  updateProgressLog(data) {
    const progressLog = document.getElementById('progressLog');
    const progressEl = document.getElementById('sendProgress');

    if (progressEl.classList.contains('hidden')) return;

    const item = document.createElement('div');
    item.className = `progress-log-item ${data.status}`;

    const icon = data.status === 'sent' ? '&#10003;' : '&#10007;';
    const name = data.name || data.phone;
    item.innerHTML = `<span>${icon}</span> <span>${this.escapeHtml(name)} - ${data.phone}</span>`;
    progressLog.appendChild(item);
    progressLog.scrollTop = progressLog.scrollHeight;

    const total = this.selectedContacts.size;
    const current = progressLog.children.length;
    const progressFill = document.getElementById('progressFill');
    const progressCount = document.getElementById('progressCount');
    progressFill.style.width = `${(current / total) * 100}%`;
    progressCount.textContent = `${current}/${total}`;
  }

  // ========================================
  // Şablonlar
  // ========================================

  bindTemplateEvents() {
    document.getElementById('templatesGrid').addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.btn-delete-template');
      const useBtn = e.target.closest('.btn-use-template');

      if (deleteBtn) {
        this.deleteTemplate(deleteBtn.dataset.id);
      } else if (useBtn) {
        this.useTemplate(useBtn.dataset.id);
      }
    });
  }

  async loadTemplates() {
    const templates = await window.api.getTemplates();
    this.renderTemplates(templates);
  }

  renderTemplates(templates) {
    const grid = document.getElementById('templatesGrid');

    if (templates.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <p>Henüz şablon yok</p>
          <p class="empty-hint">Mesaj sayfasından "Şablon Olarak Kaydet" butonunu kullanın</p>
        </div>`;
      return;
    }

    grid.innerHTML = templates
      .map((t) => {
        const date = new Date(t.createdAt).toLocaleDateString('tr-TR');
        return `
          <div class="template-card">
            <div class="template-card-header">
              <h4>${this.escapeHtml(t.name)}</h4>
              <div class="template-card-actions">
                <button class="btn btn-sm btn-primary btn-use-template" data-id="${t.id}">Kullan</button>
                <button class="btn-icon btn-delete-template" data-id="${t.id}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="template-card-body">${this.escapeHtml(t.message)}</div>
            <div class="template-card-footer">
              <span class="template-date">${date}</span>
            </div>
          </div>`;
      })
      .join('');
  }

  async saveCurrentAsTemplate() {
    const message = document.getElementById('messageText').value.trim();
    if (!message) {
      this.showToast('Lütfen önce mesaj yazın', 'error');
      return;
    }

    const name = await this.showPrompt('Şablon Adı', 'Şablon için bir isim girin...');
    if (!name) return;

    await window.api.saveTemplate({ name, message });
    this.showToast('Şablon kaydedildi', 'success');
    this.loadTemplates();
    this.loadTemplateSelect();
  }

  async deleteTemplate(id) {
    await window.api.deleteTemplate(id);
    this.showToast('Şablon silindi', 'info');
    this.loadTemplates();
    this.loadTemplateSelect();
  }

  async useTemplate(id) {
    const templates = await window.api.getTemplates();
    const template = templates.find((t) => t.id === id);
    if (template) {
      document.getElementById('messageText').value = template.message;
      this.navigateTo('message');
      await this.loadTemplateSelect();
      document.getElementById('templateSelect').value = id;
      this.updateMessagePreview();
    }
  }

  async loadTemplateSelect() {
    const select = document.getElementById('templateSelect');
    const templates = await window.api.getTemplates();

    select.innerHTML = '<option value="">-- Şablon seçin --</option>';
    templates.forEach((t) => {
      select.innerHTML += `<option value="${t.id}">${this.escapeHtml(t.name)}</option>`;
    });
  }

  async applyTemplate(id) {
    if (!id) return;
    const templates = await window.api.getTemplates();
    const template = templates.find((t) => t.id === id);
    if (template) {
      document.getElementById('messageText').value = template.message;
      this.updateMessagePreview();
    }
  }

  // ========================================
  // Zamanlama
  // ========================================

  bindScheduleEvents() {
    document.getElementById('btnConfirmSchedule').addEventListener('click', () => this.confirmSchedule());
    document.getElementById('btnCancelSchedule').addEventListener('click', () => {
      document.getElementById('scheduleModal').classList.add('hidden');
    });

    document.querySelector('#scheduleModal .modal-overlay').addEventListener('click', () => {
      document.getElementById('scheduleModal').classList.add('hidden');
    });

    document.getElementById('scheduledList').addEventListener('click', (e) => {
      const cancelBtn = e.target.closest('.btn-cancel-scheduled');
      if (cancelBtn) {
        this.cancelScheduledMessage(cancelBtn.dataset.id);
      }
    });
  }

  async confirmSchedule() {
    const dateTime = document.getElementById('scheduleDateTime').value;
    if (!dateTime) {
      this.showToast('Lütfen tarih ve saat seçin', 'error');
      return;
    }

    const sendAt = new Date(dateTime);
    if (sendAt <= new Date()) {
      this.showToast('Geçmiş bir tarih seçemezsiniz', 'error');
      return;
    }

    if (this.selectedContacts.size === 0) {
      this.showToast('Lütfen en az bir kişi seçin', 'error');
      return;
    }

    const message = document.getElementById('messageText').value.trim();
    if (!message) {
      this.showToast('Lütfen mesaj yazın', 'error');
      return;
    }

    const contacts = Array.from(this.selectedContacts).map((i) => {
      const c = { ...this.contacts[i] };
      c._phone = this.getPhoneFromContact(c);
      return c;
    });

    await window.api.scheduleMessage({
      contacts,
      message,
      mediaPath: this.currentMediaPath,
      sendAt: sendAt.toISOString(),
    });

    document.getElementById('scheduleModal').classList.add('hidden');
    this.showToast('Mesaj zamanlandı', 'success');
    this.loadScheduledMessages();
  }

  async loadScheduledMessages() {
    const messages = await window.api.getScheduledMessages();
    this.renderScheduledMessages(messages);
  }

  renderScheduledMessages(messages) {
    const list = document.getElementById('scheduledList');

    if (messages.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>Zamanlanmış mesaj yok</p>
          <p class="empty-hint">Mesaj sayfasından "Zamanla" butonunu kullanın</p>
        </div>`;
      return;
    }

    list.innerHTML = messages
      .map((m) => {
        const date = new Date(m.sendAt).toLocaleString('tr-TR');
        const statusClass = m.status || 'pending';
        const statusText = m.status === 'completed' ? 'Gönderildi' : 'Bekliyor';
        return `
          <div class="scheduled-item">
            <div class="scheduled-info">
              <h4>${m.contacts.length} kişiye mesaj</h4>
              <p>${this.escapeHtml(m.message.substring(0, 80))}${m.message.length > 80 ? '...' : ''}</p>
            </div>
            <span class="scheduled-time">${date}</span>
            <span class="scheduled-status ${statusClass}">${statusText}</span>
            ${m.status !== 'completed' ? `<button class="btn btn-danger btn-sm btn-cancel-scheduled" data-id="${m.id}">İptal</button>` : ''}
          </div>`;
      })
      .join('');
  }

  async cancelScheduledMessage(id) {
    await window.api.cancelScheduledMessage(id);
    this.showToast('Zamanlanmış mesaj iptal edildi', 'info');
    this.loadScheduledMessages();
  }

  // ========================================
  // Raporlar
  // ========================================

  bindReportEvents() {
    document.getElementById('btnClearReports').addEventListener('click', async () => {
      await window.api.clearReports();
      this.loadReports();
      this.showToast('Raporlar temizlendi', 'info');
    });

    document.getElementById('reportsList').addEventListener('click', (e) => {
      if (e.target.closest('.btn-retry-failed')) return;
      const header = e.target.closest('.report-header');
      if (header) {
        const details = header.nextElementSibling;
        if (details) details.classList.toggle('open');
      }
    });

    window.api.onScheduledComplete((data) => {
      this.showToast('Zamanlanmış mesaj gönderildi!', 'success');
      this.loadScheduledMessages();
      this.loadReports();
    });
  }

  async loadReports() {
    const reports = await window.api.getReports();
    this.renderReports(reports);
  }

  renderReports(reports) {
    const list = document.getElementById('reportsList');

    if (reports.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>Henüz rapor yok</p>
          <p class="empty-hint">Mesaj gönderdiğinizde raporlar burada görünecek</p>
        </div>`;
      return;
    }

    list.innerHTML = reports
      .reverse()
      .map((r) => {
        const date = new Date(r.createdAt).toLocaleString('tr-TR');
        const details = (r.details || [])
          .map((d) => {
            const statusClass = d.success ? 'sent' : 'failed';
            const statusText = d.success ? 'Gönderildi' : 'Başarısız';
            return `
              <div class="report-detail-item">
                <span>${d.name ? this.escapeHtml(d.name) + ' — ' : ''}${this.escapeHtml(d.phone)}</span>
                <span class="report-detail-status ${statusClass}">${statusText}</span>
              </div>`;
          })
          .join('');

        const retryBtn = r.failed > 0 && r.message && r.contacts
          ? `<div class="report-actions">
               <button class="btn btn-sm btn-retry btn-retry-failed" data-report-index="${reports.indexOf(r)}">Ba&#351;ar&#305;s&#305;z Olanlar&#305; Tekrar Dene</button>
             </div>`
          : '';

        return `
          <div class="report-card">
            <div class="report-header">
              <div class="report-stats">
                <span class="report-stat total">Toplam: ${r.totalContacts}</span>
                <span class="report-stat sent">Gönderildi: ${r.sent}</span>
                <span class="report-stat failed">Başarısız: ${r.failed}</span>
              </div>
              <span class="report-date">${date}</span>
            </div>
            <div class="report-details">
              ${details}
            </div>
            ${retryBtn}
          </div>`;
      })
      .join('');

    // Bind retry buttons
    list.querySelectorAll('.btn-retry-failed').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.reportIndex);
        this.retryFailedMessages(reports[index]);
      });
    });
  }

  // ========================================
  // Tema Değiştirme
  // ========================================

  bindThemeToggle() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      document.body.classList.add('light-theme');
    }

    document.getElementById('btnToggleTheme').addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      const isLight = document.body.classList.contains('light-theme');
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
    });
  }

  // ========================================
  // Kişi Listeleri
  // ========================================

  bindListEvents() {
    document.getElementById('btnDeleteList').addEventListener('click', () => this.deleteActiveList());

    // Listeler sayfasından Excel yükle
    document.getElementById('btnImportExcelFromLists').addEventListener('click', () => this.importExcel());

    // Liste kartları event delegation
    document.getElementById('listsPageGrid').addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.btn-delete-list');
      const openBtn = e.target.closest('.btn-open-list');
      if (deleteBtn) {
        this.deleteListById(deleteBtn.dataset.id);
      } else if (openBtn) {
        this.switchToList(openBtn.dataset.id);
        this.navigateTo('contacts');
      }
    });
  }

  async loadContactLists() {
    this.contactLists = await window.api.getContactLists();
    this.renderListChips();
    this.renderListsPage();
  }

  renderListChips() {
    const scroll = document.getElementById('listsScroll');
    const allChip = `<button class="list-chip ${this.activeListId === 'all' ? 'active' : ''}" data-list-id="all">Tümü (${this.getAllContactsCount()})</button>`;

    const listChips = this.contactLists
      .map((l) => {
        const active = this.activeListId === l.id ? 'active' : '';
        return `<button class="list-chip ${active}" data-list-id="${l.id}">${this.escapeHtml(l.name)} (${l.contacts.length})</button>`;
      })
      .join('');

    scroll.innerHTML = allChip + listChips;

    // Chip tıklama eventleri
    scroll.querySelectorAll('.list-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        this.switchToList(chip.dataset.listId);
      });
    });
  }

  getAllContactsCount() {
    let total = 0;
    this.contactLists.forEach((l) => total += l.contacts.length);
    return total;
  }

  switchToList(listId) {
    this.activeListId = listId;
    this.selectedContacts.clear();

    if (listId === 'all') {
      // Tüm listelerden kişileri birleştir
      this.contacts = [];
      this.contactLists.forEach((l) => {
        this.contacts = [...this.contacts, ...l.contacts];
      });
    } else {
      const list = this.contactLists.find((l) => l.id === listId);
      this.contacts = list ? [...list.contacts] : [];
    }

    this.detectColumns();
    this.renderContacts();
    this.renderListChips();
    this.updateSelectedCount();
  }

  async deleteActiveList() {
    if (this.activeListId === 'all') {
      this.showToast('Tümü listesi silinemez', 'error');
      return;
    }

    const list = this.contactLists.find((l) => l.id === this.activeListId);
    if (!list) return;

    if (!confirm(`"${list.name}" listesini silmek istediğinize emin misiniz?`)) return;

    await window.api.deleteContactList(this.activeListId);
    await this.loadContactLists();
    this.switchToList('all');
    this.showToast('Liste silindi', 'info');
  }

  renderListsPage() {
    const grid = document.getElementById('listsPageGrid');

    if (this.contactLists.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <p>Henüz liste yok</p>
          <p class="empty-hint">Excel yükleyerek yeni liste oluşturun</p>
        </div>`;
      return;
    }

    grid.innerHTML = this.contactLists
      .map((l) => {
        const date = new Date(l.createdAt).toLocaleDateString('tr-TR');
        return `
          <div class="list-card">
            <div class="list-card-info">
              <h4>${this.escapeHtml(l.name)}</h4>
              <div class="list-card-meta">
                <span>${l.contacts.length} kişi</span>
                <span>${date}</span>
              </div>
            </div>
            <div class="list-card-actions">
              <button class="btn btn-sm btn-primary btn-open-list" data-id="${l.id}">Aç</button>
              <button class="btn-icon btn-delete-list" data-id="${l.id}" title="Sil">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>`;
      })
      .join('');
  }

  async deleteListById(id) {
    const list = this.contactLists.find((l) => l.id === id);
    if (!list) return;
    if (!confirm(`"${list.name}" listesini silmek istediğinize emin misiniz?`)) return;

    await window.api.deleteContactList(id);
    await this.loadContactLists();
    this.switchToList('all');
    this.showToast('Liste silindi', 'info');
  }

  async saveActiveListContacts() {
    if (this.activeListId === 'all') return;
    const list = this.contactLists.find((l) => l.id === this.activeListId);
    if (list) {
      await window.api.updateContactList(list.id, { contacts: this.contacts });
      // Lokalde de güncelle
      list.contacts = [...this.contacts];
      this.renderListChips();
    }
  }

  // ========================================
  // Çıkış
  // ========================================

  // ========================================
  // Excel → VCF Dönüştürme
  // ========================================

  bindVcfEvents() {
    document.getElementById('btnExcelToVcf').addEventListener('click', () => this.startVcfConvert());
    document.getElementById('btnVcfPreview').addEventListener('click', () => this.previewVcf());
    document.getElementById('btnVcfConvert').addEventListener('click', () => this.executeVcfConvert());
    document.getElementById('btnVcfCancel').addEventListener('click', () => this.closeVcfModal());
    document.querySelector('#vcfModal .modal-overlay').addEventListener('click', () => this.closeVcfModal());
  }

  closeVcfModal() {
    document.getElementById('vcfModal').classList.add('hidden');
    document.getElementById('vcfPreview').classList.add('hidden');
    document.getElementById('btnVcfConvert').classList.add('hidden');
    document.getElementById('btnVcfPreview').classList.remove('hidden');
    this._vcfExcelData = null;
    this._vcfProcessed = null;
  }

  async startVcfConvert() {
    const result = await window.api.importExcel();
    if (!result || result.rows.length === 0) {
      this.showToast('Excel dosyası boş veya seçilmedi', 'error');
      return;
    }
    this._vcfExcelData = result;
    document.getElementById('vcfPreview').classList.add('hidden');
    document.getElementById('btnVcfConvert').classList.add('hidden');
    document.getElementById('btnVcfPreview').classList.remove('hidden');
    document.getElementById('vcfModal').classList.remove('hidden');
  }

  // Tüm ülke kodları (uzundan kısaya — en spesifik eşleşme öncelikli)
  getCountryCodes() {
    return [
      // 4 haneli
      '1784','1767','1758','1721','1684','1670','1664','1649','1473','1441','1345','1284','1268','1264','1246','1242',
      // 3 haneli
      '998','997','996','995','994','993','992','991','977','976','975','974','973','972','971','970','969','968','967','966','965','964','963','962','961','960',
      '899','898','897','896','895','894','893','892','891','890','889','888','887','886','885','884','883','882','881','880',
      '859','858','857','856','855','854','853','852','851','850',
      '699','698','697','696','695','694','693','692','691','690','689','688','687','686','685','684','683','682','681','680',
      '679','678','677','676','675','674','673','672','671','670',
      '599','598','597','596','595','594','593','592','591','590',
      '509','508','507','506','505','504','503','502','501','500',
      '429','428','427','426','425','424','423','422','421','420',
      '389','388','387','386','385','384','383','382','381','380','379','378','377','376','375','374','373','372','371','370',
      '359','358','357','356','355','354','353','352','351','350',
      '299','298','297','296','295','294','293','292','291','290',
      '269','268','267','266','265','264','263','262','261','260','259','258','257','256','255','254','253','252','251','250',
      '249','248','247','246','245','244','243','242','241','240','239','238','237','236','235','234','233','232','231','230',
      '229','228','227','226','225','224','223','222','221','220','219','218','217','216','215','214','213','212','211','210',
      // 2 haneli
      '98','95','94','93','92','91','90','86','84','82','81',
      '66','65','64','63','62','61','60','58','57','56','55','54','53','52','51',
      '49','48','47','46','45','44','43','41','40','39','36','34','33','32','31','30',
      '27','20',
      // 1 haneli
      '7','1'
    ];
  }

  // Telefon numarasından ülke kodunu algıla
  detectCountryCode(phone) {
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

    // +XX ile başlıyorsa
    if (cleaned.startsWith('+')) {
      const digits = cleaned.substring(1);
      for (const code of this.getCountryCodes()) {
        if (digits.startsWith(code)) {
          return { code: '+' + code, national: digits.substring(code.length) };
        }
      }
    }

    // 00XX ile başlıyorsa (uluslararası format)
    if (cleaned.startsWith('00')) {
      const digits = cleaned.substring(2);
      for (const code of this.getCountryCodes()) {
        if (digits.startsWith(code)) {
          return { code: '+' + code, national: digits.substring(code.length) };
        }
      }
    }

    return null; // Ülke kodu algılanamadı
  }

  // Ülke kodu → toplam numara uzunluğu (ülke kodu dahil)
  getExpectedLengths() {
    return {
      '90': [12],       // Türkiye: +90 5XX XXX XXXX = 12
      '1': [11],        // ABD/Kanada: +1 XXX XXX XXXX = 11
      '44': [12, 13],   // İngiltere: 12-13
      '49': [12, 13, 14], // Almanya: 12-14
      '33': [12],       // Fransa
      '39': [12, 13],   // İtalya
      '34': [12],       // İspanya
      '31': [12],       // Hollanda
      '32': [11, 12],   // Belçika
      '41': [12],       // İsviçre
      '43': [12, 13],   // Avusturya
      '46': [12],       // İsveç
      '47': [11],       // Norveç
      '48': [11],       // Polonya
      '7': [11],        // Rusya
      '86': [13],       // Çin
      '91': [12, 13],   // Hindistan
      '81': [12, 13],   // Japonya
      '82': [12, 13],   // Güney Kore
      '61': [11, 12],   // Avustralya
      '55': [12, 13],   // Brezilya
      '971': [12, 13],  // BAE
      '966': [12, 13],  // Suudi Arabistan
      '994': [12],      // Azerbaycan
      '380': [12],      // Ukrayna
      '30': [12],       // Yunanistan
      '20': [12, 13],   // Mısır
      '62': [12, 13, 14], // Endonezya
    };
  }

  // Formatlanmış numaranın geçerliliğini kontrol et
  validateFormattedPhone(formatted) {
    // + ile başlamalı, ardından sadece rakam
    if (!formatted.startsWith('+')) return 'missing_plus';
    const digits = formatted.substring(1);
    if (!/^\d+$/.test(digits)) return 'non_digit';
    if (digits.length < 7) return 'too_short';
    if (digits.length > 15) return 'too_long';

    // Ülke koduna göre uzunluk kontrolü
    const detected = this.detectCountryCode(formatted);
    if (detected) {
      const expected = this.getExpectedLengths()[detected.code.substring(1)];
      if (expected && !expected.includes(digits.length)) {
        return 'wrong_length';
      }
    }

    return 'ok';
  }

  formatPhoneInternational(phone, defaultCountryCode) {
    // Tüm formatlama karakterlerini temizle
    let cleaned = phone.replace(/[\s\-\(\)\.\/\\]/g, '');

    // Zaten ülke kodu varsa
    const detected = this.detectCountryCode(cleaned);
    if (detected) {
      return detected.code + detected.national;
    }

    // Başında 0 varsa kaldır ve varsayılan ülke kodu ekle
    if (cleaned.startsWith('0')) {
      return defaultCountryCode + cleaned.substring(1);
    }

    // Düz numara — varsayılan ülke kodu ekle
    return defaultCountryCode + cleaned;
  }

  // Önizleme göster
  previewVcf() {
    if (!this._vcfExcelData) return;

    const defaultCode = document.getElementById('vcfDefaultCountry').value;
    const contacts = this.normalizeExcelData(this._vcfExcelData.rows, this._vcfExcelData.columns);

    const processed = [];
    let warnCount = 0;

    for (const contact of contacts) {
      const rawPhone = this.getPhoneFromContact(contact);
      if (!rawPhone) continue;

      const formatted = this.formatPhoneInternational(rawPhone, defaultCode);
      const validation = this.validateFormattedPhone(formatted);
      const firstName = contact['İsim'] || contact['isim'] || '';
      const lastName = contact['Soyisim'] || contact['soyisim'] || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || '-';

      if (validation !== 'ok') warnCount++;

      processed.push({ rawPhone, formatted, fullName, firstName, lastName, validation });
    }

    this._vcfProcessed = processed;

    // Tablo oluştur
    const table = document.getElementById('vcfPreviewTable');
    const rows = processed.map((p) => {
      const cls = p.validation === 'ok' ? 'vcf-row-ok' : 'vcf-row-warn';
      const warn = p.validation !== 'ok' ? ' ⚠' : '';
      return `<tr class="${cls}">
        <td>${this.escapeHtml(p.fullName)}</td>
        <td>${this.escapeHtml(p.rawPhone)}</td>
        <td>${this.escapeHtml(p.formatted)}${warn}</td>
      </tr>`;
    }).join('');

    table.innerHTML = `<table>
      <thead><tr><th>İsim</th><th>Orijinal</th><th>Düzenlenmiş</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

    // Bilgi
    document.getElementById('vcfPreviewCount').textContent = `${processed.length} kişi`;
    const warnEl = document.getElementById('vcfPreviewWarn');
    if (warnCount > 0) {
      warnEl.textContent = `⚠ ${warnCount} numara şüpheli uzunlukta`;
      warnEl.classList.remove('hidden');
    } else {
      warnEl.classList.add('hidden');
    }

    document.getElementById('vcfPreview').classList.remove('hidden');
    document.getElementById('btnVcfConvert').classList.remove('hidden');
    document.getElementById('btnVcfPreview').classList.add('hidden');
  }

  async executeVcfConvert() {
    if (!this._vcfProcessed || this._vcfProcessed.length === 0) {
      this.showToast('Önce önizleme yapın', 'error');
      return;
    }

    let vcfContent = '';
    for (const p of this._vcfProcessed) {
      vcfContent += 'BEGIN:VCARD\r\n';
      vcfContent += 'VERSION:3.0\r\n';
      vcfContent += `FN:${p.fullName}\r\n`;
      vcfContent += `N:${p.lastName};${p.firstName};;;\r\n`;
      vcfContent += `TEL;TYPE=CELL:${p.formatted}\r\n`;
      vcfContent += 'END:VCARD\r\n';
    }

    const savedPath = await window.api.saveVcf(vcfContent);

    if (savedPath) {
      this.showToast(`${this._vcfProcessed.length} kişi VCF olarak kaydedildi`, 'success');
      this.closeVcfModal();
    }
  }

  bindLogout() {
    document.getElementById('btnLogout').addEventListener('click', async () => {
      if (confirm('WhatsApp bağlantısını kesip çıkmak istediğinize emin misiniz?')) {
        await window.api.logout();
        this.showToast('Çıkış yapıldı, yeniden QR kod tarayın', 'info');
      }
    });
  }

  // ========================================
  // Emoji Picker
  // ========================================

  bindEmojiPicker() {
    const emojiData = {
      'Yuzler': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','😍','🤩','😘','😗','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','😮','😯','😲','😳','🥺','😢','😭','😤','😠','😡','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'],
      'Eller': ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪'],
      'Kalpler': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟'],
      'Nesneler': ['🎉','🎊','🎈','🎁','🎀','🏆','🥇','📱','💻','📧','📩','📮','📝','📄','📋','📌','📎','🔗','📞','📅','⏰','🔔','🔑','🔒','💡','📢','🚀','⭐','🌟','✨','🔥','💯','✅','❌','⚠️','❓','❗','💬','💭','🗨️'],
    };

    const tabsContainer = document.getElementById('emojiTabs');
    const gridContainer = document.getElementById('emojiGrid');
    const picker = document.getElementById('emojiPicker');
    const toggleBtn = document.getElementById('btnEmojiToggle');
    const textarea = document.getElementById('messageText');

    // Build tabs
    const categories = Object.keys(emojiData);
    tabsContainer.innerHTML = categories
      .map((cat, i) => `<button class="emoji-tab${i === 0 ? ' active' : ''}" data-category="${cat}">${cat}</button>`)
      .join('');

    const showCategory = (cat) => {
      gridContainer.innerHTML = emojiData[cat]
        .map((e) => `<button class="emoji-item" type="button">${e}</button>`)
        .join('');
      tabsContainer.querySelectorAll('.emoji-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.category === cat);
      });
    };

    showCategory(categories[0]);

    tabsContainer.addEventListener('click', (e) => {
      const tab = e.target.closest('.emoji-tab');
      if (tab) showCategory(tab.dataset.category);
    });

    gridContainer.addEventListener('click', (e) => {
      const item = e.target.closest('.emoji-item');
      if (!item) return;
      const emoji = item.textContent;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      textarea.value = text.substring(0, start) + emoji + text.substring(end);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      this.updateMessagePreview();
    });

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      picker.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!picker.classList.contains('hidden') && !picker.contains(e.target) && e.target !== toggleBtn) {
        picker.classList.add('hidden');
      }
    });
  }

  // ========================================
  // Retry Failed Messages
  // ========================================

  async retryFailedMessages(report) {
    const failedDetails = (report.details || []).filter((d) => !d.success);
    if (failedDetails.length === 0) {
      this.showToast('Ba\u015Far\u0131s\u0131z mesaj yok', 'info');
      return;
    }

    const failedPhones = new Set(failedDetails.map((d) => d.phone));
    const contacts = (report.contacts || []).filter((c) => {
      const phone = c._phone || c['Telefon'] || this.getPhoneFromContact(c);
      return failedPhones.has(phone);
    });

    if (contacts.length === 0) {
      this.showToast('Tekrar g\u00F6nderilecek ki\u015Fi bulunamad\u0131', 'error');
      return;
    }

    const message = report.message;
    if (!message) {
      this.showToast('Orijinal mesaj bulunamad\u0131', 'error');
      return;
    }

    const status = await window.api.getWhatsAppStatus();
    if (!status.isReady) {
      this.showToast('WhatsApp ba\u011Flant\u0131s\u0131 yok', 'error');
      return;
    }

    // Switch to message page and show progress
    this.navigateTo('message');
    const progressEl = document.getElementById('sendProgress');
    const progressFill = document.getElementById('progressFill');
    const progressCount = document.getElementById('progressCount');
    const progressLog = document.getElementById('progressLog');

    progressEl.classList.remove('hidden');
    progressLog.innerHTML = '';
    progressCount.textContent = `0/${contacts.length}`;
    progressFill.style.width = '0%';

    // Temporarily set selectedContacts size for progress tracking
    const originalSelected = new Set(this.selectedContacts);
    this.selectedContacts = new Set(contacts.map((_, i) => i));

    const result = await window.api.sendMessage({
      contacts,
      message,
      mediaPath: report.mediaPath || null,
    });

    this.selectedContacts = originalSelected;

    progressCount.textContent = `${contacts.length}/${contacts.length}`;
    progressFill.style.width = '100%';

    this.showToast(
      `Tekrar deneme: ${result.sent} g\u00F6nderildi, ${result.failed} ba\u015Far\u0131s\u0131z`,
      result.failed > 0 ? 'error' : 'success'
    );

    this.loadReports();
  }

  // ========================================
  // Yardımcılar
  // ========================================

  showPrompt(title, placeholder = '') {
    return new Promise((resolve) => {
      const modal = document.getElementById('inputModal');
      const input = document.getElementById('inputModalValue');
      const okBtn = document.getElementById('btnInputModalOk');
      const cancelBtn = document.getElementById('btnInputModalCancel');
      const overlay = modal.querySelector('.modal-overlay');

      document.getElementById('inputModalTitle').textContent = title;
      input.placeholder = placeholder;
      input.value = '';
      modal.classList.remove('hidden');
      input.focus();

      const cleanup = () => {
        modal.classList.add('hidden');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
      };

      const onOk = () => { cleanup(); resolve(input.value.trim() || null); };
      const onCancel = () => { cleanup(); resolve(null); };
      const onKey = (e) => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); };

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Uygulamayı başlat
const app = new App();
