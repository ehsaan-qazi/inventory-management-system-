const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window focus management
  onWindowFocusRestored: (callback) => ipcRenderer.on('window-focus-restored', callback),
  onWindowFocusLost: (callback) => ipcRenderer.on('window-focus-lost', callback),


  // Customer operations
  getCustomers: (options) => ipcRenderer.invoke('db:getCustomers', options),
  getCustomerById: (id) => ipcRenderer.invoke('db:getCustomerById', id),
  addCustomer: (customer) => ipcRenderer.invoke('db:addCustomer', customer),
  updateCustomer: (id, customer) => ipcRenderer.invoke('db:updateCustomer', id, customer),
  deleteCustomer: (id) => ipcRenderer.invoke('db:deleteCustomer', id),

  // Farmer operations
  getFarmers: (options) => ipcRenderer.invoke('db:getFarmers', options),
  getFarmerById: (id) => ipcRenderer.invoke('db:getFarmerById', id),
  addFarmer: (farmer) => ipcRenderer.invoke('db:addFarmer', farmer),
  updateFarmer: (id, farmer) => ipcRenderer.invoke('db:updateFarmer', id, farmer),
  deleteFarmer: (id) => ipcRenderer.invoke('db:deleteFarmer', id),
  searchFarmers: (query) => ipcRenderer.invoke('db:searchFarmers', query),

  // Fish category operations
  getFishCategories: () => ipcRenderer.invoke('db:getFishCategories'),
  getFishCategoryById: (id) => ipcRenderer.invoke('db:getFishCategoryById', id),
  addFishCategory: (category) => ipcRenderer.invoke('db:addFishCategory', category),
  updateFishCategory: (id, category) => ipcRenderer.invoke('db:updateFishCategory', id, category),
  toggleFishCategory: (id, active) => ipcRenderer.invoke('db:toggleFishCategory', id, active),
  deleteFishCategory: (id) => ipcRenderer.invoke('db:deleteFishCategory', id),
  isFishCategoryReferenced: (id) => ipcRenderer.invoke('db:isFishCategoryReferenced', id),

  // Transaction operations
  getTransactions: (options) => ipcRenderer.invoke('db:getTransactions', options),
  getTransactionById: (id) => ipcRenderer.invoke('db:getTransactionById', id),
  getTransactionsByCustomer: (customerId) => ipcRenderer.invoke('db:getTransactionsByCustomer', customerId),
  addTransaction: (transaction) => ipcRenderer.invoke('db:addTransaction', transaction),
  updateTransaction: (id, updates) => ipcRenderer.invoke('db:updateTransaction', id, updates),

  // Farmer transaction operations
  addFarmerTransaction: (transaction) => ipcRenderer.invoke('db:addFarmerTransaction', transaction),
  getFarmerTransactions: (options) => ipcRenderer.invoke('db:getFarmerTransactions', options),
  getFarmerTransactionById: (id) => ipcRenderer.invoke('db:getFarmerTransactionById', id),
  getTransactionsByFarmer: (farmerId) => ipcRenderer.invoke('db:getTransactionsByFarmer', farmerId),

  // Report operations
  getDailySummary: (date) => ipcRenderer.invoke('db:getDailySummary', date),
  getReportByDateRange: (startDate, endDate) => ipcRenderer.invoke('db:getReportByDateRange', startDate, endDate),
  getDashboardStats: () => ipcRenderer.invoke('db:getDashboardStats'),

  // Utility operations
  searchCustomers: (query) => ipcRenderer.invoke('db:searchCustomers', query),
  backupDatabase: () => ipcRenderer.invoke('db:backup'),

  // TRANSITIONAL: Ledger operations
  addLedgerEntry: (entry) => ipcRenderer.invoke('db:addLedgerEntry', entry),
  getLedgerEntries: (entityType, entityId, options) => ipcRenderer.invoke('db:getLedgerEntries', entityType, entityId, options),
  getAllLedgerEntries: (options) => ipcRenderer.invoke('db:getAllLedgerEntries', options),
  getLedgerEntryById: (id) => ipcRenderer.invoke('db:getLedgerEntryById', id),

  // Account History (unified view with manual entries)
  getCustomerAccountHistory: (customerId) => ipcRenderer.invoke('db:getCustomerAccountHistory', customerId),
  getFarmerAccountHistory: (farmerId) => ipcRenderer.invoke('db:getFarmerAccountHistory', farmerId),

  // Audit History (shows voided/reversed entries with status labels)
  getCustomerAccountAuditHistory: (customerId) => ipcRenderer.invoke('db:getCustomerAccountAuditHistory', customerId),
  getFarmerAccountAuditHistory: (farmerId) => ipcRenderer.invoke('db:getFarmerAccountAuditHistory', farmerId),

  // Void/Reversal operations (accounting-safe deletion)
  voidCustomerTransaction: (id) => ipcRenderer.invoke('db:voidCustomerTransaction', id),
  voidFarmerTransaction: (id) => ipcRenderer.invoke('db:voidFarmerTransaction', id),
  reverseLedgerEntry: (id) => ipcRenderer.invoke('db:reverseLedgerEntry', id),

  // PDF operations
  savePDF: (data) => ipcRenderer.invoke('print:savePDF', data),
});

