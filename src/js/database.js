const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class FishMarketDB {
  constructor() {
    // Use userData directory for database in production
    // This ensures a writable location even when app is packaged
    const isDev = !app.isPackaged;
    let dbDir;
    
    if (isDev) {
      // Development: use local database folder
      dbDir = path.join(__dirname, '../../database');
    } else {
      // Production: use userData directory (writable location)
      dbDir = path.join(app.getPath('userData'), 'database');
    }
    
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, 'fishmarket.db');
    console.log('Database path:', dbPath); // For debugging
    this.db = new Database(dbPath);
    
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    
    // Initialize tables
    this.initializeTables();
  }

  initializeTables() {
    // Create customers table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create fish_categories table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fish_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        price_per_kg REAL NOT NULL,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create transactions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        transaction_date DATE NOT NULL,
        transaction_time TIME NOT NULL,
        total_amount REAL NOT NULL,
        paid_amount REAL NOT NULL,
        balance_change REAL NOT NULL,
        balance_after REAL NOT NULL,
        payment_status TEXT NOT NULL CHECK(payment_status IN ('paid', 'partial', 'unpaid')),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      )
    `);

    // Create transaction_items table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transaction_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        fish_category_id INTEGER NOT NULL,
        fish_name TEXT NOT NULL,
        weight_kg REAL NOT NULL,
        price_per_kg REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
        FOREIGN KEY (fish_category_id) REFERENCES fish_categories(id)
      )
    `);

    // Create daily_summary table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_summary (
        date DATE PRIMARY KEY,
        total_sales REAL DEFAULT 0,
        total_cash_received REAL DEFAULT 0,
        total_outstanding REAL DEFAULT 0,
        transactions_count INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_customer 
      ON transactions(customer_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_date 
      ON transactions(transaction_date);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction 
      ON transaction_items(transaction_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_customers_name 
      ON customers(name);
    `);

    console.log('Database tables initialized successfully');
  }

  // Customer operations
  getAllCustomers() {
    const stmt = this.db.prepare('SELECT * FROM customers ORDER BY name');
    return stmt.all();
  }

  getCustomerById(id) {
    const stmt = this.db.prepare('SELECT * FROM customers WHERE id = ?');
    return stmt.get(id);
  }

  addCustomer(customer) {
    const stmt = this.db.prepare(`
      INSERT INTO customers (name, phone, address, balance)
      VALUES (@name, @phone, @address, @balance)
    `);
    const info = stmt.run({
      name: customer.name,
      phone: customer.phone || null,
      address: customer.address || null,
      balance: customer.balance || 0
    });
    return info.lastInsertRowid;
  }

  updateCustomer(id, customer) {
    const stmt = this.db.prepare(`
      UPDATE customers 
      SET name = @name, phone = @phone, address = @address, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);
    return stmt.run({
      id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address
    });
  }

  updateCustomerBalance(id, balance) {
    const stmt = this.db.prepare(`
      UPDATE customers 
      SET balance = @balance, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);
    return stmt.run({ id, balance });
  }

  deleteCustomer(id) {
    const stmt = this.db.prepare('DELETE FROM customers WHERE id = ?');
    return stmt.run(id);
  }

  searchCustomers(query) {
    const stmt = this.db.prepare(`
      SELECT * FROM customers 
      WHERE name LIKE ? OR phone LIKE ? OR id = ?
      ORDER BY name
    `);
    const searchTerm = `%${query}%`;
    const idSearch = isNaN(query) ? -1 : parseInt(query);
    return stmt.all(searchTerm, searchTerm, idSearch);
  }

  // Fish category operations
  getAllFishCategories() {
    const stmt = this.db.prepare('SELECT * FROM fish_categories ORDER BY name');
    return stmt.all();
  }

  getActiveFishCategories() {
    const stmt = this.db.prepare('SELECT * FROM fish_categories WHERE active = 1 ORDER BY name');
    return stmt.all();
  }

  getFishCategoryById(id) {
    const stmt = this.db.prepare('SELECT * FROM fish_categories WHERE id = ?');
    return stmt.get(id);
  }

  addFishCategory(category) {
    const stmt = this.db.prepare(`
      INSERT INTO fish_categories (name, price_per_kg, active)
      VALUES (@name, @price_per_kg, @active)
    `);
    const info = stmt.run({
      name: category.name,
      price_per_kg: category.price_per_kg,
      active: category.active !== undefined ? category.active : 1
    });
    return info.lastInsertRowid;
  }

  updateFishCategory(id, category) {
    const stmt = this.db.prepare(`
      UPDATE fish_categories 
      SET name = @name, price_per_kg = @price_per_kg, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);
    return stmt.run({
      id,
      name: category.name,
      price_per_kg: category.price_per_kg
    });
  }

  toggleFishCategory(id, active) {
    const stmt = this.db.prepare(`
      UPDATE fish_categories 
      SET active = @active, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);
    return stmt.run({ id, active: active ? 1 : 0 });
  }

  // Transaction operations
  addTransaction(transaction) {
    const addTxn = this.db.transaction((txn) => {
      // Insert transaction
      const stmt = this.db.prepare(`
        INSERT INTO transactions (
          customer_id, transaction_date, transaction_time, 
          total_amount, paid_amount, balance_change, balance_after, payment_status, notes
        )
        VALUES (
          @customer_id, @transaction_date, @transaction_time,
          @total_amount, @paid_amount, @balance_change, @balance_after, @payment_status, @notes
        )
      `);
      
      const info = stmt.run({
        customer_id: txn.customer_id,
        transaction_date: txn.transaction_date,
        transaction_time: txn.transaction_time,
        total_amount: txn.total_amount,
        paid_amount: txn.paid_amount,
        balance_change: txn.balance_change,
        balance_after: txn.balance_after,
        payment_status: txn.payment_status,
        notes: txn.notes || null
      });
      
      const transactionId = info.lastInsertRowid;

      // Insert transaction items
      const itemStmt = this.db.prepare(`
        INSERT INTO transaction_items (
          transaction_id, fish_category_id, fish_name, weight_kg, price_per_kg, subtotal
        )
        VALUES (@transaction_id, @fish_category_id, @fish_name, @weight_kg, @price_per_kg, @subtotal)
      `);

      for (const item of txn.items) {
        itemStmt.run({
          transaction_id: transactionId,
          fish_category_id: item.fish_category_id,
          fish_name: item.fish_name,
          weight_kg: item.weight_kg,
          price_per_kg: item.price_per_kg,
          subtotal: item.subtotal
        });
      }

      // Update customer balance
      this.updateCustomerBalance(txn.customer_id, txn.balance_after);

      // Update daily summary
      this.updateDailySummary(txn.transaction_date, txn.total_amount, txn.paid_amount, txn.balance_change);

      return transactionId;
    });

    return addTxn(transaction);
  }

  getTransactions(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT t.*, c.name as customer_name 
      FROM transactions t
      JOIN customers c ON t.customer_id = c.id
      ORDER BY t.transaction_date DESC, t.transaction_time DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  getTransactionById(id) {
    const txnStmt = this.db.prepare(`
      SELECT t.*, c.name as customer_name, c.phone as customer_phone
      FROM transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE t.id = ?
    `);
    const transaction = txnStmt.get(id);

    if (transaction) {
      const itemsStmt = this.db.prepare(`
        SELECT * FROM transaction_items WHERE transaction_id = ?
      `);
      transaction.items = itemsStmt.all(id);
    }

    return transaction;
  }

  getTransactionsByCustomer(customerId) {
    const stmt = this.db.prepare(`
      SELECT * FROM transactions 
      WHERE customer_id = ?
      ORDER BY transaction_date DESC, transaction_time DESC
    `);
    return stmt.all(customerId);
  }

  // Daily summary operations
  updateDailySummary(date, totalAmount, paidAmount, balanceChange) {
    // Calculate the net outstanding change for this transaction
    // If balance_change is negative, outstanding increased
    // If balance_change is positive, outstanding decreased (payment made)
    const outstandingChange = balanceChange < 0 ? Math.abs(balanceChange) : -Math.min(0, balanceChange);
    
    const stmt = this.db.prepare(`
      INSERT INTO daily_summary (date, total_sales, total_cash_received, total_outstanding, transactions_count)
      VALUES (@date, @total_sales, @cash_received, @outstanding, 1)
      ON CONFLICT(date) DO UPDATE SET
        total_sales = total_sales + @total_sales,
        total_cash_received = total_cash_received + @cash_received,
        total_outstanding = CASE 
          WHEN (total_outstanding + @outstanding) < 0 THEN 0
          ELSE total_outstanding + @outstanding
        END,
        transactions_count = transactions_count + 1,
        updated_at = CURRENT_TIMESTAMP
    `);
    
    return stmt.run({
      date,
      total_sales: totalAmount,
      cash_received: paidAmount,
      outstanding: outstandingChange
    });
  }

  getDailySummary(date) {
    const stmt = this.db.prepare('SELECT * FROM daily_summary WHERE date = ?');
    return stmt.get(date);
  }

  getReportByDateRange(startDate, endDate) {
    const stmt = this.db.prepare(`
      SELECT * FROM daily_summary 
      WHERE date BETWEEN ? AND ?
      ORDER BY date DESC
    `);
    return stmt.all(startDate, endDate);
  }

  // Dashboard statistics
  getDashboardStats() {
    const today = new Date().toISOString().split('T')[0];
    
    // Today's sales
    const todaySummary = this.getDailySummary(today) || { 
      total_sales: 0, 
      total_cash_received: 0, 
      transactions_count: 0 
    };

    // Pending bills (customers with negative balance)
    const pendingStmt = this.db.prepare(`
      SELECT COUNT(*) as count, SUM(ABS(balance)) as total
      FROM customers WHERE balance < 0
    `);
    const pending = pendingStmt.get();

    // Total customers
    const customerStmt = this.db.prepare('SELECT COUNT(*) as count FROM customers');
    const customerCount = customerStmt.get();

    // Fish categories
    const fishStmt = this.db.prepare('SELECT COUNT(*) as count FROM fish_categories WHERE active = 1');
    const fishCount = fishStmt.get();

    return {
      todaySales: todaySummary.total_sales || 0,
      todayCash: todaySummary.total_cash_received || 0,
      todayTransactions: todaySummary.transactions_count || 0,
      pendingBillsCount: pending.count || 0,
      pendingBillsTotal: pending.total || 0,
      totalCustomers: customerCount.count || 0,
      activeFishCategories: fishCount.count || 0
    };
  }

  // Backup database
  backup() {
    const isDev = !app.isPackaged;
    let dbDir;
    
    if (isDev) {
      dbDir = path.join(__dirname, '../../database');
    } else {
      dbDir = path.join(app.getPath('userData'), 'database');
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(dbDir, `fishmarket_backup_${timestamp}.db`);
    this.db.backup(backupPath);
    return backupPath;
  }

  close() {
    this.db.close();
  }
}

module.exports = FishMarketDB;

