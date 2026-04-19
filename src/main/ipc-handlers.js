const { dialog } = require('electron');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

function registerIpcHandlers(ipcMain, mainWindow, whatsapp, store, scheduler) {
  // Excel dosyası yükleme
  ipcMain.handle('contacts:import-excel', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Excel Dosyası Seç',
      filters: [
        { name: 'Excel Dosyaları', extensions: ['xlsx', 'xls', 'csv'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length === 0) return { columns: [], rows: [] };

    const columns = Object.keys(data[0]);
    return { columns, rows: data };
  });

  // VCF kaydetme
  ipcMain.handle('vcf:save', async (event, vcfContent) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'VCF Dosyasını Kaydet',
      defaultPath: 'rehber.vcf',
      filters: [{ name: 'vCard', extensions: ['vcf'] }],
    });

    if (result.canceled || !result.filePath) return null;

    fs.writeFileSync(result.filePath, vcfContent, 'utf-8');
    return result.filePath;
  });

  // Dosya seçme (medya)
  ipcMain.handle('media:select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Dosya Seç',
      filters: [
        { name: 'Medya', extensions: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'pdf', 'doc', 'docx'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    return { path: filePath, name: fileName };
  });

  // Mesaj gönderme
  ipcMain.handle('message:send', async (event, { contacts, message, mediaPath }) => {
    const results = await whatsapp.sendBulkMessages(contacts, message, mediaPath);

    const report = {
      totalContacts: contacts.length,
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      details: results,
      message,
      contacts,
      mediaPath: mediaPath || null,
    };

    store.saveReport(report);
    return report;
  });

  // Zamanlanmış mesaj
  ipcMain.handle('message:schedule', async (event, { contacts, message, mediaPath, sendAt }) => {
    const scheduled = store.saveScheduledMessage({
      contacts,
      message,
      mediaPath,
      sendAt,
    });

    scheduler.schedule(scheduled);

    scheduler.once('scheduled-complete', (result) => {
      store.updateScheduledMessage(scheduled.id, {
        status: 'completed',
        results: result.results,
      });
      mainWindow.webContents.send('scheduled:complete', result);
    });

    return scheduled;
  });

  ipcMain.handle('scheduled:list', () => store.getScheduledMessages());

  ipcMain.handle('scheduled:cancel', (event, id) => {
    scheduler.cancel(id);
    store.deleteScheduledMessage(id);
    return true;
  });

  // Şablonlar
  ipcMain.handle('templates:list', () => store.getTemplates());
  ipcMain.handle('templates:save', (event, template) => store.saveTemplate(template));
  ipcMain.handle('templates:update', (event, { id, updates }) => store.updateTemplate(id, updates));
  ipcMain.handle('templates:delete', (event, id) => store.deleteTemplate(id));

  // Kişiler
  ipcMain.handle('contacts:list', () => store.getContacts());
  ipcMain.handle('contacts:save', (event, contacts) => {
    store.saveContacts(contacts);
    return true;
  });

  // Kişi Listeleri
  ipcMain.handle('contactLists:list', () => store.getContactLists());
  ipcMain.handle('contactLists:save', (event, list) => store.saveContactList(list));
  ipcMain.handle('contactLists:update', (event, { id, updates }) => store.updateContactList(id, updates));
  ipcMain.handle('contactLists:delete', (event, id) => {
    store.deleteContactList(id);
    return true;
  });

  // Raporlar
  ipcMain.handle('reports:list', () => store.getReports());
  ipcMain.handle('reports:clear', () => {
    store.clearReports();
    return true;
  });

  // WhatsApp durumu
  ipcMain.handle('whatsapp:status', () => ({
    isReady: whatsapp.isReady,
  }));

  ipcMain.handle('whatsapp:reconnect', async () => {
    await whatsapp.destroy();
    whatsapp.initialize();
    return true;
  });

  ipcMain.handle('whatsapp:logout', async () => {
    await whatsapp.logout();
    return true;
  });

  // Gönderim kontrolü
  ipcMain.handle('sending:pause', () => { whatsapp.pauseSending(); return true; });
  ipcMain.handle('sending:resume', () => { whatsapp.resumeSending(); return true; });
  ipcMain.handle('sending:stop', () => { whatsapp.stopSending(); return true; });
}

module.exports = { registerIpcHandlers };
