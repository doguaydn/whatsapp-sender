const { EventEmitter } = require('events');

class Scheduler extends EventEmitter {
  constructor(whatsappService) {
    super();
    this.whatsapp = whatsappService;
    this.timers = new Map();
  }

  schedule(scheduledMessage) {
    const { id, sendAt, contacts, message, mediaPath } = scheduledMessage;
    const sendTime = new Date(sendAt).getTime();
    const now = Date.now();
    const delay = sendTime - now;

    if (delay <= 0) {
      this.execute(scheduledMessage);
      return;
    }

    const timer = setTimeout(() => {
      this.execute(scheduledMessage);
      this.timers.delete(id);
    }, delay);

    this.timers.set(id, timer);
  }

  async execute(scheduledMessage) {
    const { contacts, message, mediaPath } = scheduledMessage;
    this.emit('scheduled-start', scheduledMessage);

    const results = await this.whatsapp.sendBulkMessages(contacts, message, mediaPath);

    this.emit('scheduled-complete', {
      ...scheduledMessage,
      results,
      completedAt: new Date().toISOString(),
    });

    return results;
  }

  cancel(id) {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
      return true;
    }
    return false;
  }

  stopAll() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}

module.exports = { Scheduler };
