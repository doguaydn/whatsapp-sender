const ElectronStore = require('electron-store');

class Store {
  constructor() {
    this.store = new ElectronStore({
      name: 'whatsapp-sender-data',
      defaults: {
        templates: [],
        contacts: [],
        contactLists: [],
        reports: [],
        scheduledMessages: [],
      },
    });
  }

  // Şablonlar
  getTemplates() {
    return this.store.get('templates', []);
  }

  saveTemplate(template) {
    const templates = this.getTemplates();
    template.id = Date.now().toString();
    template.createdAt = new Date().toISOString();
    templates.push(template);
    this.store.set('templates', templates);
    return template;
  }

  updateTemplate(id, updates) {
    const templates = this.getTemplates();
    const index = templates.findIndex((t) => t.id === id);
    if (index !== -1) {
      templates[index] = { ...templates[index], ...updates };
      this.store.set('templates', templates);
      return templates[index];
    }
    return null;
  }

  deleteTemplate(id) {
    const templates = this.getTemplates().filter((t) => t.id !== id);
    this.store.set('templates', templates);
  }

  // Kişiler
  getContacts() {
    return this.store.get('contacts', []);
  }

  saveContacts(contacts) {
    this.store.set('contacts', contacts);
  }

  // Kişi Listeleri
  getContactLists() {
    return this.store.get('contactLists', []);
  }

  saveContactList(list) {
    const lists = this.getContactLists();
    list.id = Date.now().toString();
    list.createdAt = new Date().toISOString();
    lists.push(list);
    this.store.set('contactLists', lists);
    return list;
  }

  updateContactList(id, updates) {
    const lists = this.getContactLists();
    const index = lists.findIndex((l) => l.id === id);
    if (index !== -1) {
      lists[index] = { ...lists[index], ...updates };
      this.store.set('contactLists', lists);
      return lists[index];
    }
    return null;
  }

  deleteContactList(id) {
    const lists = this.getContactLists().filter((l) => l.id !== id);
    this.store.set('contactLists', lists);
  }

  // Raporlar
  getReports() {
    return this.store.get('reports', []);
  }

  saveReport(report) {
    const reports = this.getReports();
    report.id = Date.now().toString();
    report.createdAt = new Date().toISOString();
    reports.push(report);
    // Son 50 raporu tut
    if (reports.length > 50) {
      reports.splice(0, reports.length - 50);
    }
    this.store.set('reports', reports);
    return report;
  }

  clearReports() {
    this.store.set('reports', []);
  }

  // Zamanlanmış mesajlar
  getScheduledMessages() {
    return this.store.get('scheduledMessages', []);
  }

  saveScheduledMessage(scheduled) {
    const messages = this.getScheduledMessages();
    scheduled.id = Date.now().toString();
    scheduled.status = 'pending';
    messages.push(scheduled);
    this.store.set('scheduledMessages', messages);
    return scheduled;
  }

  updateScheduledMessage(id, updates) {
    const messages = this.getScheduledMessages();
    const index = messages.findIndex((m) => m.id === id);
    if (index !== -1) {
      messages[index] = { ...messages[index], ...updates };
      this.store.set('scheduledMessages', messages);
      return messages[index];
    }
    return null;
  }

  deleteScheduledMessage(id) {
    const messages = this.getScheduledMessages().filter((m) => m.id !== id);
    this.store.set('scheduledMessages', messages);
  }
}

module.exports = { Store };
