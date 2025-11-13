const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Customer operations
  getCustomers: (options) => ipcRenderer.invoke('db:getCustomers', options),
  getCustomerById: (id) => ipcRenderer.invoke('db:getCustomerById', id),
  addCustomer: (customer) => ipcRenderer.invoke('db:addCustomer', customer),
  updateCustomer: (id, customer) => ipcRenderer.invoke('db:updateCustomer', id, customer),
  deleteCustomer: (id) => ipcRenderer.invoke('db:deleteCustomer', id),
  
  // Fish category operations
  getFishCategories: () => ipcRenderer.invoke('db:getFishCategories'),
  getFishCategoryById: (id) => ipcRenderer.invoke('db:getFishCategoryById', id),
  addFishCategory: (category) => ipcRenderer.invoke('db:addFishCategory', category),
  updateFishCategory: (id, category) => ipcRenderer.invoke('db:updateFishCategory', id, category),
  toggleFishCategory: (id, active) => ipcRenderer.invoke('db:toggleFishCategory', id, active),
  
  // Transaction operations
  getTransactions: (options) => ipcRenderer.invoke('db:getTransactions', options),
  getTransactionById: (id) => ipcRenderer.invoke('db:getTransactionById', id),
  getTransactionsByCustomer: (customerId) => ipcRenderer.invoke('db:getTransactionsByCustomer', customerId),
  addTransaction: (transaction) => ipcRenderer.invoke('db:addTransaction', transaction),
  updateTransaction: (id, updates) => ipcRenderer.invoke('db:updateTransaction', id, updates),
  
  // Report operations
  getDailySummary: (date) => ipcRenderer.invoke('db:getDailySummary', date),
  getReportByDateRange: (startDate, endDate) => ipcRenderer.invoke('db:getReportByDateRange', startDate, endDate),
  getDashboardStats: () => ipcRenderer.invoke('db:getDashboardStats'),
  
  // Utility operations
  searchCustomers: (query) => ipcRenderer.invoke('db:searchCustomers', query),
  backupDatabase: () => ipcRenderer.invoke('db:backup'),
});

