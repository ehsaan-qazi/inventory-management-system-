const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const FishMarketDB = require('./src/js/database');

let mainWindow;
let db;

// Single instance lock (Issue 13)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'src/assets/tuna.ico'),
    show: false
  });

  mainWindow.loadFile('src/index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Initialize database
  db = new FishMarketDB();
  console.log('Database initialized');

  // Set up IPC handlers
  setupIPCHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (db) {
    db.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
function setupIPCHandlers() {
  // Customer operations
  ipcMain.handle('db:getCustomers', async (event, options) => {
    return db.getAllCustomers(options || {});
  });

  ipcMain.handle('db:getCustomerById', async (event, id) => {
    return db.getCustomerById(id);
  });

  ipcMain.handle('db:addCustomer', async (event, customer) => {
    return db.addCustomer(customer);
  });

  ipcMain.handle('db:updateCustomer', async (event, id, customer) => {
    return db.updateCustomer(id, customer);
  });

  ipcMain.handle('db:deleteCustomer', async (event, id) => {
    return db.deleteCustomer(id);
  });

  ipcMain.handle('db:searchCustomers', async (event, query) => {
    return db.searchCustomers(query);
  });

  // Fish category operations
  ipcMain.handle('db:getFishCategories', async () => {
    return db.getAllFishCategories();
  });

  ipcMain.handle('db:getFishCategoryById', async (event, id) => {
    return db.getFishCategoryById(id);
  });

  ipcMain.handle('db:addFishCategory', async (event, category) => {
    return db.addFishCategory(category);
  });

  ipcMain.handle('db:updateFishCategory', async (event, id, category) => {
    return db.updateFishCategory(id, category);
  });

  ipcMain.handle('db:toggleFishCategory', async (event, id, active) => {
    return db.toggleFishCategory(id, active);
  });

  // Transaction operations
  ipcMain.handle('db:getTransactions', async (event, options) => {
    return db.getTransactions(options || {});
  });

  ipcMain.handle('db:getTransactionById', async (event, id) => {
    return db.getTransactionById(id);
  });

  ipcMain.handle('db:getTransactionsByCustomer', async (event, customerId) => {
    return db.getTransactionsByCustomer(customerId);
  });

  ipcMain.handle('db:addTransaction', async (event, transaction) => {
    return db.addTransaction(transaction);
  });

  ipcMain.handle('db:updateTransaction', async (event, id, updates) => {
    return db.updateTransaction(id, updates);
  });

  // Report operations
  ipcMain.handle('db:getDailySummary', async (event, date) => {
    return db.getDailySummary(date);
  });

  ipcMain.handle('db:getReportByDateRange', async (event, startDate, endDate) => {
    return db.getReportByDateRange(startDate, endDate);
  });

  ipcMain.handle('db:getDashboardStats', async () => {
    return db.getDashboardStats();
  });

  // Utility operations
  ipcMain.handle('db:backup', async () => {
    return db.backup();
  });
}

