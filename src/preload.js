const { contextBridge, ipcRenderer } = require('electron');

// Event callback'lerini düzgün çalıştırmak için
const createEventHandler = (channel) => {
  return (callback) => {
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  };
};

contextBridge.exposeInMainWorld('api', {
  // Kişiler
  importExcel: () => ipcRenderer.invoke('contacts:import-excel'),
  getContacts: () => ipcRenderer.invoke('contacts:list'),
  saveContacts: (contacts) => ipcRenderer.invoke('contacts:save', contacts),

  // Kişi Listeleri
  getContactLists: () => ipcRenderer.invoke('contactLists:list'),
  saveContactList: (list) => ipcRenderer.invoke('contactLists:save', list),
  updateContactList: (id, updates) => ipcRenderer.invoke('contactLists:update', { id, updates }),
  deleteContactList: (id) => ipcRenderer.invoke('contactLists:delete', id),

  // Mesaj
  sendMessage: (data) => ipcRenderer.invoke('message:send', data),
  scheduleMessage: (data) => ipcRenderer.invoke('message:schedule', data),
  selectMedia: () => ipcRenderer.invoke('media:select-file'),

  // Zamanlanmış mesajlar
  getScheduledMessages: () => ipcRenderer.invoke('scheduled:list'),
  cancelScheduledMessage: (id) => ipcRenderer.invoke('scheduled:cancel', id),

  // Şablonlar
  getTemplates: () => ipcRenderer.invoke('templates:list'),
  saveTemplate: (template) => ipcRenderer.invoke('templates:save', template),
  updateTemplate: (id, updates) => ipcRenderer.invoke('templates:update', { id, updates }),
  deleteTemplate: (id) => ipcRenderer.invoke('templates:delete', id),

  // Raporlar
  getReports: () => ipcRenderer.invoke('reports:list'),
  clearReports: () => ipcRenderer.invoke('reports:clear'),

  // Gönderim kontrolü
  pauseSending: () => ipcRenderer.invoke('sending:pause'),
  resumeSending: () => ipcRenderer.invoke('sending:resume'),
  stopSending: () => ipcRenderer.invoke('sending:stop'),

  // WhatsApp
  pollWhatsApp: () => ipcRenderer.invoke('whatsapp:poll'),
  getWhatsAppStatus: () => ipcRenderer.invoke('whatsapp:status'),
  reconnectWhatsApp: () => ipcRenderer.invoke('whatsapp:reconnect'),
  logout: () => ipcRenderer.invoke('whatsapp:logout'),

  // Event listeners
  onQR: createEventHandler('whatsapp:qr'),
  onReady: createEventHandler('whatsapp:ready'),
  onDisconnected: createEventHandler('whatsapp:disconnected'),
  onMessageStatus: createEventHandler('whatsapp:message-status'),
  onBulkPause: createEventHandler('bulk:pause'),
  onBulkStopped: createEventHandler('bulk:stopped'),
  onScheduledComplete: createEventHandler('scheduled:complete'),
});
