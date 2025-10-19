import Dexie from 'dexie';

const db = new Dexie('JustP2P');

db.version(1).stores({
  messages: '++id, chatId, from, to, timestamp',
  contacts: 'username, peerId, lastSeen',
  settings: 'key'
});

export const initDB = async () => {
  try {
    await db.open();
    console.log('Database initialized');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
};

export const saveMessage = async (message) => {
  try {
    await db.messages.add(message);
  } catch (error) {
    console.error('Failed to save message:', error);
  }
};

export const getMessages = async (chatId) => {
  try {
    return await db.messages
      .where('chatId')
      .equals(chatId)
      .sortBy('timestamp');
  } catch (error) {
    console.error('Failed to get messages:', error);
    return [];
  }
};

export const saveContact = async (contact) => {
  try {
    await db.contacts.put(contact);
  } catch (error) {
    console.error('Failed to save contact:', error);
  }
};

export const getContacts = async () => {
  try {
    return await db.contacts.toArray();
  } catch (error) {
    console.error('Failed to get contacts:', error);
    return [];
  }
};

export const exportDatabase = async () => {
  try {
    const messages = await db.messages.toArray();
    const contacts = await db.contacts.toArray();
    const settings = await db.settings.toArray();
    
    return {
      messages,
      contacts,
      settings,
      exportDate: new Date().toISOString()
    };
  } catch (error) {
    console.error('Failed to export database:', error);
    throw error;
  }
};

export const importDatabase = async (data) => {
  try {
    // Clear existing data
    await db.messages.clear();
    await db.contacts.clear();
    await db.settings.clear();
    
    // Import new data
    if (data.messages && data.messages.length > 0) {
      await db.messages.bulkAdd(data.messages);
    }
    if (data.contacts && data.contacts.length > 0) {
      await db.contacts.bulkPut(data.contacts);
    }
    if (data.settings && data.settings.length > 0) {
      await db.settings.bulkPut(data.settings);
    }
  } catch (error) {
    console.error('Failed to import database:', error);
    throw error;
  }
};

export const clearAllData = async () => {
  try {
    await db.messages.clear();
    await db.contacts.clear();
    await db.settings.clear();
  } catch (error) {
    console.error('Failed to clear data:', error);
    throw error;
  }
};

export default db;