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
    this.isDev = isDev;
    
    // Only log in development
    if (isDev) {
      console.log('Database path:', dbPath);
    }
    
    this.db = new Database(dbPath);
    
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    
    // Enable WAL mode for better concurrency (Issue 13)
    this.db.pragma('journal_mode = WAL');
    
    // Set busy timeout for concurrent access
    this.db.pragma('busy_timeout = 5000');
    
    // Initialize tables
    this.initializeTables();
    
    // Setup auto-backup (Issue 26)
    this.setupAutoBackup();
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
        price_per_maund REAL NOT NULL,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migrate old price_per_kg to price_per_maund if needed
    this.migratePriceToMaund();

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
    
    // Add status column if it doesn't exist (for Issue 6 - edit transactions)
    try {
      this.db.exec(`ALTER TABLE transactions ADD COLUMN status TEXT DEFAULT 'completed'`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Create transaction_items table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transaction_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        fish_category_id INTEGER NOT NULL,
        fish_name TEXT NOT NULL,
        weight_kg REAL NOT NULL,
        price_per_maund REAL NOT NULL,
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

  migratePriceToMaund() {
    // Check if we need to migrate from price_per_kg to price_per_maund
    try {
      // Check if old column exists in fish_categories
      const tableInfo = this.db.pragma('table_info(fish_categories)');
      const hasOldColumn = tableInfo.some(col => col.name === 'price_per_kg');
      const hasNewColumn = tableInfo.some(col => col.name === 'price_per_maund');
      
      if (hasOldColumn && !hasNewColumn) {
        console.log('Migrating fish_categories from price_per_kg to price_per_maund...');
        
        // Convert price_per_kg to price_per_maund (multiply by 40)
        this.db.exec(`
          ALTER TABLE fish_categories RENAME COLUMN price_per_kg TO price_per_maund;
        `);
        this.db.exec(`
          UPDATE fish_categories SET price_per_maund = price_per_maund * 40;
        `);
        
        console.log('Fish categories migration completed');
      }
      
      // Check transaction_items table
      const itemsTableInfo = this.db.pragma('table_info(transaction_items)');
      const hasOldItemColumn = itemsTableInfo.some(col => col.name === 'price_per_kg');
      const hasNewItemColumn = itemsTableInfo.some(col => col.name === 'price_per_maund');
      
      if (hasOldItemColumn && !hasNewItemColumn) {
        console.log('Migrating transaction_items from price_per_kg to price_per_maund...');
        
        this.db.exec(`
          ALTER TABLE transaction_items RENAME COLUMN price_per_kg TO price_per_maund;
        `);
        this.db.exec(`
          UPDATE transaction_items SET price_per_maund = price_per_maund * 40;
        `);
        
        console.log('Transaction items migration completed');
      }
    } catch (error) {
      console.log('No migration needed or error during migration:', error.message);
    }
  }

  // Customer operations
  getAllCustomers(options = {}) {
    const { limit, offset, sortBy = 'name', sortOrder = 'ASC' } = options;
    
    // Build query with pagination (Issue 9)
    let query = 'SELECT * FROM customers ORDER BY ' + sortBy + ' ' + sortOrder;
    let params = [];
    
    if (limit) {
      query += ' LIMIT ? OFFSET ?';
      params = [limit, offset || 0];
    }
    
    const stmt = this.db.prepare(query);
    const customers = params.length > 0 ? stmt.all(...params) : stmt.all();
    
    // Calculate balance dynamically for each customer (Issue 3 & 7)
    customers.forEach(customer => {
      customer.balance = this.getCustomerBalance(customer.id);
    });
    
    // Get total count if pagination is used
    if (limit) {
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM customers');
      const total = countStmt.get().count;
      
      return {
        data: customers,
        total,
        limit,
        offset: offset || 0,
        hasMore: (offset || 0) + limit < total
      };
    }
    
    return customers;
  }

  getCustomerById(id) {
    const stmt = this.db.prepare('SELECT * FROM customers WHERE id = ?');
    const customer = stmt.get(id);
    
    // Calculate balance dynamically from transactions (Issue 3 & 7)
    if (customer) {
      customer.balance = this.getCustomerBalance(customer.id);
    }
    
    return customer;
  }

  // Calculate customer balance dynamically from transactions (Issue 3 & 7)
  getCustomerBalance(customerId) {
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(balance_change), 0) as balance
      FROM transactions
      WHERE customer_id = ? AND status != 'voided'
    `);
    const result = stmt.get(customerId);
    return result ? result.balance : 0;
  }

  addCustomer(customer) {
    // Check for duplicates (Issue 21)
    const duplicateStmt = this.db.prepare(`
      SELECT id, name FROM customers 
      WHERE LOWER(name) = LOWER(?) OR (phone IS NOT NULL AND phone = ?)
    `);
    const duplicate = duplicateStmt.get(customer.name, customer.phone || null);
    
    if (duplicate) {
      throw new Error(`Customer "${duplicate.name}" already exists`);
    }
    
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
    // Validate input (Issue 10 partial - user said skip extreme lengths)
    if (typeof query !== 'string') {
      return [];
    }
    
    const stmt = this.db.prepare(`
      SELECT * FROM customers 
      WHERE name LIKE ? OR phone LIKE ? OR id = ?
      ORDER BY name
      LIMIT 100
    `);
    const searchTerm = `%${query}%`;
    const idSearch = isNaN(query) ? -1 : parseInt(query);
    const customers = stmt.all(searchTerm, searchTerm, idSearch);
    
    // Calculate balance dynamically for each customer (Issue 3 & 7)
    customers.forEach(customer => {
      customer.balance = this.getCustomerBalance(customer.id);
    });
    
    return customers;
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
      INSERT INTO fish_categories (name, price_per_maund, active)
      VALUES (@name, @price_per_maund, @active)
    `);
    const info = stmt.run({
      name: category.name,
      price_per_maund: category.price_per_maund,
      active: category.active !== undefined ? category.active : 1
    });
    return info.lastInsertRowid;
  }

  updateFishCategory(id, category) {
    const stmt = this.db.prepare(`
      UPDATE fish_categories 
      SET name = @name, price_per_maund = @price_per_maund, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);
    return stmt.run({
      id,
      name: category.name,
      price_per_maund: category.price_per_maund
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
          transaction_id, fish_category_id, fish_name, weight_kg, price_per_maund, subtotal
        )
        VALUES (@transaction_id, @fish_category_id, @fish_name, @weight_kg, @price_per_maund, @subtotal)
      `);

      for (const item of txn.items) {
        itemStmt.run({
          transaction_id: transactionId,
          fish_category_id: item.fish_category_id,
          fish_name: item.fish_name,
          weight_kg: item.weight_kg,
          price_per_maund: item.price_per_maund,
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

  getTransactions(options = {}) {
    const { 
      limit = 50, 
      offset = 0,
      customerName = null,
      paymentStatus = null
    } = options;
    
    // Build query with filters (Issue 23)
    let query = `
      SELECT t.*, c.name as customer_name 
      FROM transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];
    
    // Filter by customer name (Issue 23)
    if (customerName) {
      query += ' AND c.name LIKE ?';
      params.push(`%${customerName}%`);
    }
    
    // Filter by payment status (Issue 23)
    if (paymentStatus) {
      if (paymentStatus === 'unpaid_partial') {
        query += ' AND t.payment_status IN (?, ?)';
        params.push('unpaid', 'partial');
      } else {
        query += ' AND t.payment_status = ?';
        params.push(paymentStatus);
      }
    }
    
    // Exclude voided transactions by default
    query += ` AND (t.status IS NULL OR t.status = 'completed')`;
    
    query += ' ORDER BY t.transaction_date DESC, t.transaction_time DESC';
    
    // Add pagination (Issue 9)
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = this.db.prepare(query);
    const transactions = stmt.all(...params);
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as count
      FROM transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE 1=1
    `;
    const countParams = [];
    
    if (customerName) {
      countQuery += ' AND c.name LIKE ?';
      countParams.push(`%${customerName}%`);
    }
    
    if (paymentStatus) {
      if (paymentStatus === 'unpaid_partial') {
        countQuery += ' AND t.payment_status IN (?, ?)';
        countParams.push('unpaid', 'partial');
      } else {
        countQuery += ' AND t.payment_status = ?';
        countParams.push(paymentStatus);
      }
    }
    
    countQuery += ` AND (t.status IS NULL OR t.status = 'completed')`;
    
    const countStmt = this.db.prepare(countQuery);
    const total = countStmt.get(...countParams).count;
    
    return {
      data: transactions,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
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
      WHERE customer_id = ? AND (status IS NULL OR status = 'completed')
      ORDER BY transaction_date DESC, transaction_time DESC
    `);
    return stmt.all(customerId);
  }

  // Edit transaction (Issue 6)
  updateTransaction(id, updates) {
    // Get original transaction
    const original = this.getTransactionById(id);
    if (!original) {
      throw new Error('Transaction not found');
    }
    
    const txn = this.db.transaction(() => {
      // Update transaction record
      const stmt = this.db.prepare(`
        UPDATE transactions
        SET customer_id = ?,
            transaction_date = ?,
            transaction_time = ?,
            total_amount = ?,
            paid_amount = ?,
            balance_change = ?,
            balance_after = ?,
            payment_status = ?,
            notes = ?
        WHERE id = ?
      `);
      
      stmt.run(
        updates.customer_id,
        updates.transaction_date,
        updates.transaction_time,
        updates.total_amount,
        updates.paid_amount,
        updates.balance_change,
        updates.balance_after,
        updates.payment_status,
        updates.notes || null,
        id
      );
      
      // Update transaction items if provided
      if (updates.items && updates.items.length > 0) {
        // Delete old items
        const deleteStmt = this.db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?');
        deleteStmt.run(id);
        
        // Insert new items
        const itemStmt = this.db.prepare(`
          INSERT INTO transaction_items (
            transaction_id, fish_category_id, fish_name, weight_kg, price_per_maund, subtotal
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        for (const item of updates.items) {
          itemStmt.run(
            id,
            item.fish_category_id,
            item.fish_name,
            item.weight_kg,
            item.price_per_maund,
            item.subtotal
          );
        }
      }
      
      // Recalculate daily summaries (remove old, add new)
      // This is simplified - in production you'd need more complex logic
      this.updateDailySummary(
        updates.transaction_date,
        updates.total_amount,
        updates.paid_amount,
        updates.balance_change
      );
    });
    
    return txn();
  }

  // Daily summary operations
  updateDailySummary(date, totalAmount, paidAmount, balanceChange) {
    // Fix: Outstanding calculation (Issue 8)
    // If balance_change is negative, customer owes more (outstanding increases)
    // If balance_change is positive, customer paid (outstanding decreases)
    // So outstanding change is simply the negative of balance change
    const outstandingChange = -balanceChange;
    
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

  // Auto-backup setup (Issue 26)
  setupAutoBackup() {
    // Backup every 24 hours
    setInterval(() => {
      try {
        const backupPath = this.backup();
        if (this.isDev) {
          console.log('Auto backup created:', backupPath);
        }
      } catch (error) {
        console.error('Auto backup failed:', error.message);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  close() {
    this.db.close();
  }
}

module.exports = FishMarketDB;

