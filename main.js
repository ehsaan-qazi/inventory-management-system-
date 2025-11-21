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

  // Handle focus events to ensure input fields work properly (Issue: input fields stop working)
  mainWindow.on('focus', () => {
    // Force the renderer to restore focus state
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-focus-restored');
      // Ensure webContents is focused
      if (!mainWindow.webContents.isFocused()) {
        mainWindow.webContents.focus();
      }
    }
  });

  mainWindow.on('blur', () => {
    // Track when window loses focus
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-focus-lost');
    }
  });

  // Additional handler for when app becomes active
  app.on('browser-window-focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-focus-restored');
      if (!mainWindow.webContents.isFocused()) {
        mainWindow.webContents.focus();
      }
    }
  });

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

  // Farmer operations
  ipcMain.handle('db:getFarmers', async (event, options) => {
    return db.getAllFarmers(options || {});
  });

  ipcMain.handle('db:getFarmerById', async (event, id) => {
    return db.getFarmerById(id);
  });

  ipcMain.handle('db:addFarmer', async (event, farmer) => {
    return db.addFarmer(farmer);
  });

  ipcMain.handle('db:updateFarmer', async (event, id, farmer) => {
    return db.updateFarmer(id, farmer);
  });

  ipcMain.handle('db:deleteFarmer', async (event, id) => {
    return db.deleteFarmer(id);
  });

  ipcMain.handle('db:searchFarmers', async (event, query) => {
    return db.searchFarmers(query);
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

  // Farmer transaction operations
  ipcMain.handle('db:addFarmerTransaction', async (event, transaction) => {
    return db.addFarmerTransaction(transaction);
  });

  ipcMain.handle('db:getFarmerTransactions', async (event, options) => {
    return db.getFarmerTransactions(options || {});
  });

  ipcMain.handle('db:getFarmerTransactionById', async (event, id) => {
    return db.getFarmerTransactionById(id);
  });

  ipcMain.handle('db:getTransactionsByFarmer', async (event, farmerId) => {
    return db.getTransactionsByFarmer(farmerId);
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

