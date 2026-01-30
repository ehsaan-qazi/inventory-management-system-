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

    // PRODUCTION HARDENING: Verify database integrity on startup
    this.verifyDatabaseIntegrity();

    // Setup auto-backup (Issue 26)
    this.setupAutoBackup();
  }

  // ============================================================================
  // OPERATIONAL LOGGING (Production Observability)
  // Structured logging for audit and debugging - no sensitive data
  // ============================================================================

  /**
   * Log structured operational event
   * @param {string} eventType - Type of event (LEDGER_INSERT, REVERSAL, VOID, etc.)
   * @param {object} data - Event data (entity_type, entity_id, entry_id, etc.)
   */
  logOperationalEvent(eventType, data) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event: eventType,
      ...data
    };

    // Log in development, structured format in production
    if (this.isDev) {
      console.log(`[AUDIT] ${eventType}:`, JSON.stringify(logEntry));
    } else {
      // In production, write to a dedicated audit log file could be added here
      console.log(JSON.stringify(logEntry));
    }
  }

  // ============================================================================
  // DATABASE INTEGRITY CHECKS (Backup/Recovery Readiness)
  // Fail fast on corruption - no silent data loss
  // ============================================================================

  /**
   * Verify database integrity on startup
   * Checks for missing tables and index corruption
   * Fails fast with clear error if problems detected
   */
  verifyDatabaseIntegrity() {
    const requiredTables = [
      'customers', 'farmers', 'fish_categories',
      'transactions', 'transaction_items',
      'farmer_transactions', 'farmer_transaction_items',
      'ledger_entries', 'daily_summary'
    ];

    // Check required tables exist
    const tablesStmt = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `);
    const existingTables = tablesStmt.all().map(t => t.name);

    const missingTables = requiredTables.filter(t => !existingTables.includes(t));
    if (missingTables.length > 0) {
      const error = `DATABASE INTEGRITY ERROR: Missing tables: ${missingTables.join(', ')}`;
      console.error(error);
      // Don't throw in dev mode to allow fresh databases
      if (!this.isDev && existingTables.length > 0) {
        throw new Error(error);
      }
    }

    // Run SQLite integrity check
    try {
      const integrityResult = this.db.pragma('integrity_check');
      if (integrityResult[0].integrity_check !== 'ok') {
        const error = `DATABASE INTEGRITY ERROR: SQLite integrity check failed: ${JSON.stringify(integrityResult)}`;
        console.error(error);
        throw new Error(error);
      }
    } catch (e) {
      if (e.message.includes('DATABASE INTEGRITY ERROR')) {
        throw e;
      }
      console.warn('Integrity check warning:', e.message);
    }

    // Log successful startup
    if (this.isDev) {
      console.log('Database integrity check passed');
    }
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

    // Create farmers table (similar to customers)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS farmers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create farmer_transactions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS farmer_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        farmer_id INTEGER NOT NULL,
        transaction_date DATE NOT NULL,
        transaction_time TIME NOT NULL,
        fish_category_id INTEGER NOT NULL,
        fish_name TEXT NOT NULL,
        weight_maund INTEGER DEFAULT 0,
        weight_kg REAL DEFAULT 0,
        total_weight_kg REAL NOT NULL,
        price_per_maund REAL NOT NULL,
        customer_markup_percentage REAL NOT NULL,
        final_price_per_maund REAL NOT NULL,
        total_fish_value REAL NOT NULL,
        commission_percentage REAL NOT NULL,
        commission_amount REAL NOT NULL,
        munshi_nama REAL DEFAULT 0,
        baraf_price REAL DEFAULT 0,
        labour_charges REAL DEFAULT 0,
        extra_charges REAL DEFAULT 0,
        total_amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        balance_change REAL NOT NULL,
        balance_after REAL NOT NULL,
        notes TEXT,
        status TEXT DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE,
        FOREIGN KEY (fish_category_id) REFERENCES fish_categories(id)
      )
    `);

    // Add paid_amount column if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE farmer_transactions ADD COLUMN paid_amount REAL DEFAULT 0`);
    } catch (e) {
      // Column already exists, ignore
    }

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

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_farmers_name 
      ON farmers(name);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_farmer_transactions_farmer 
      ON farmer_transactions(farmer_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_farmer_transactions_date 
      ON farmer_transactions(transaction_date);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_farmer_transactions_farmer 
      ON farmer_transactions(farmer_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_farmer_transactions_date 
      ON farmer_transactions(transaction_date);
    `);

    // Add initial_balance column to customers table for persisting initial balance
    try {
      this.db.exec(`ALTER TABLE customers ADD COLUMN initial_balance REAL DEFAULT 0`);
      // Migrate existing balance values to initial_balance for existing customers
      this.db.exec(`UPDATE customers SET initial_balance = balance WHERE initial_balance = 0 AND balance != 0`);
      console.log('Added initial_balance column to customers table');
    } catch (e) {
      // Column already exists, ignore
    }

    // Add initial_balance column to farmers table for consistency
    try {
      this.db.exec(`ALTER TABLE farmers ADD COLUMN initial_balance REAL DEFAULT 0`);
      this.db.exec(`UPDATE farmers SET initial_balance = balance WHERE initial_balance = 0 AND balance != 0`);
      console.log('Added initial_balance column to farmers table');
    } catch (e) {
      // Column already exists, ignore
    }

    // Add extra_charges column to transactions table for customer extra charges feature
    try {
      this.db.exec(`ALTER TABLE transactions ADD COLUMN extra_charges REAL DEFAULT 0`);
      console.log('Added extra_charges column to transactions table');
    } catch (e) {
      // Column already exists, ignore
    }

    // Add labour_rate_per_kg column to farmer_transactions for rate-based labour calculation
    try {
      this.db.exec(`ALTER TABLE farmer_transactions ADD COLUMN labour_rate_per_kg REAL DEFAULT 0`);
      console.log('Added labour_rate_per_kg column to farmer_transactions table');
    } catch (e) {
      // Column already exists, ignore
    }

    // Create farmer_transaction_items table for multi-item farmer transactions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS farmer_transaction_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        fish_category_id INTEGER,
        fish_name TEXT NOT NULL,
        weight_kg REAL NOT NULL,
        price_per_maund REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES farmer_transactions(id) ON DELETE CASCADE
      )
    `);

    // Migrate old single-item farmer transaction columns to nullable
    // Since we now use farmer_transaction_items table, these columns are legacy
    // SQLite doesn't support ALTER COLUMN, so we need to check if columns exist and handle accordingly
    try {
      const tableInfo = this.db.pragma('table_info(farmer_transactions)');
      const fishCategoryIdCol = tableInfo.find(col => col.name === 'fish_category_id');

      // If fish_category_id is NOT NULL (notnull = 1), we need to recreate the table
      if (fishCategoryIdCol && fishCategoryIdCol.notnull === 1) {
        console.log('Migrating farmer_transactions schema for multi-item support...');

        // Create temporary table with nullable old columns
        this.db.exec(`
          CREATE TABLE farmer_transactions_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            farmer_id INTEGER NOT NULL,
            transaction_date DATE NOT NULL,
            transaction_time TIME NOT NULL,
            fish_category_id INTEGER,
            fish_name TEXT,
            weight_maund INTEGER,
            weight_kg REAL,
            total_weight_kg REAL NOT NULL,
            price_per_maund REAL,
            customer_markup_percentage REAL NOT NULL,
            final_price_per_maund REAL,
            total_fish_value REAL NOT NULL,
            commission_percentage REAL NOT NULL,
            commission_amount REAL NOT NULL,
            munshi_nama REAL DEFAULT 0,
            baraf_price REAL DEFAULT 0,
            labour_rate_per_kg REAL DEFAULT 0,
            labour_charges REAL DEFAULT 0,
            extra_charges REAL DEFAULT 0,
            total_amount REAL NOT NULL,
            paid_amount REAL DEFAULT 0,
            balance_change REAL NOT NULL,
            balance_after REAL NOT NULL,
            notes TEXT,
            status TEXT DEFAULT 'completed',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE
          );
        `);

        // Copy existing data
        this.db.exec(`
          INSERT INTO farmer_transactions_new 
          SELECT * FROM farmer_transactions;
        `);

        // Drop old table
        this.db.exec(`DROP TABLE farmer_transactions;`);

        // Rename new table
        this.db.exec(`ALTER TABLE farmer_transactions_new RENAME TO farmer_transactions;`);

        console.log('Farmer transactions schema migrated successfully');
      }
    } catch (e) {
      console.error('Error during farmer_transactions migration:', e);
    }

    // TRANSITIONAL: Create ledger_entries table for append-only balance tracking
    // This table records all balance changes (sales, purchases, manual entries)
    // Used in parallel with legacy balance calculation during transition
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('customer', 'farmer')),
        entity_id INTEGER NOT NULL,
        entry_type TEXT NOT NULL CHECK(entry_type IN ('CREDIT', 'DEBIT')),
        amount REAL NOT NULL,
        reference_type TEXT CHECK(reference_type IN ('sale', 'purchase', 'manual', NULL)),
        reference_id INTEGER,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // TRANSITIONAL: Indexes for ledger_entries performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ledger_entity 
      ON ledger_entries(entity_type, entity_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ledger_created 
      ON ledger_entries(created_at);
    `);

    // Add entry_date column to ledger_entries for user-selected dates
    // Separate from created_at which remains the audit timestamp
    try {
      this.db.exec(`ALTER TABLE ledger_entries ADD COLUMN entry_date DATE`);
      console.log('Added entry_date column to ledger_entries table');
    } catch (e) {
      // Column already exists, ignore
    }

    // Index for entry_date to support chronological ordering
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ledger_entry_date 
      ON ledger_entries(entry_date);
    `);

    // Add is_reversed flag for voided manual entries (accounting-safe deletion)
    try {
      this.db.exec(`ALTER TABLE ledger_entries ADD COLUMN is_reversed INTEGER DEFAULT 0`);
      console.log('Added is_reversed column to ledger_entries table');
    } catch (e) {
      // Column already exists, ignore
    }

    // Add reversal_of_id to track which entry a reversal compensates
    try {
      this.db.exec(`ALTER TABLE ledger_entries ADD COLUMN reversal_of_id INTEGER REFERENCES ledger_entries(id)`);
      console.log('Added reversal_of_id column to ledger_entries table');
    } catch (e) {
      // Column already exists, ignore
    }

    // Index for reversal lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ledger_reversal 
      ON ledger_entries(reversal_of_id);
    `);

    // Add affects_balance flag for non-financial manual entries
    // When affects_balance = 0, entry appears in history but doesn't affect balance
    try {
      this.db.exec(`ALTER TABLE ledger_entries ADD COLUMN affects_balance INTEGER DEFAULT 1`);
      console.log('Added affects_balance column to ledger_entries table');
    } catch (e) {
      // Column already exists, ignore
    }

    // ==== OPTIMIZED INDEXES FOR BALANCE COMPUTATION (Architecture Contract v1.0) ====
    // Composite index for computeAccountBalance() queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ledger_balance_lookup 
      ON ledger_entries(entity_type, entity_id, affects_balance, entry_type);
    `);

    // Index for affects_balance filtering
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ledger_affects_balance 
      ON ledger_entries(affects_balance);
    `);

    // ==== SCHEMA EVOLUTION v1.1 (Architecture Contract Enforcement) ====

    // Add is_void column - marks entries whose originating transaction was voided
    // This is a UI visibility flag, NOT a balance calculation flag
    try {
      this.db.exec(`ALTER TABLE ledger_entries ADD COLUMN is_void INTEGER NOT NULL DEFAULT 0`);
      console.log('Added is_void column to ledger_entries table');
    } catch (e) {
      // Column already exists, ignore
    }

    // Add entry_time column - stores time component for transaction ordering
    try {
      this.db.exec(`ALTER TABLE ledger_entries ADD COLUMN entry_time TIME`);
      console.log('Added entry_time column to ledger_entries table');
    } catch (e) {
      // Column already exists, ignore
    }

    // ==== ADDITIONAL INDEXES FOR 100-500 TX/DAY SCALE ====

    // Index for is_void filtering in UI queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ledger_is_void 
      ON ledger_entries(is_void);
    `);

    // Index for reference lookups (find ledger entries by transaction)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ledger_reference 
      ON ledger_entries(reference_type, reference_id);
    `);

    // Index for is_reversed filtering in UI queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ledger_is_reversed 
      ON ledger_entries(is_reversed);
    `);

    // ==== SAFE BACKFILL MIGRATION (Idempotent) ====
    // Set affects_balance = 1 for any legacy rows where it's NULL
    // This ensures all existing entries participate in balance calculation
    try {
      const backfillResult = this.db.prepare(`
        UPDATE ledger_entries 
        SET affects_balance = 1 
        WHERE affects_balance IS NULL
      `).run();
      if (backfillResult.changes > 0) {
        console.log(`Backfilled ${backfillResult.changes} ledger entries with affects_balance = 1`);
      }
    } catch (e) {
      console.log('Backfill skipped or already complete');
    }

    // Set is_void = 0 for any legacy rows where it was added as NULL
    try {
      const voidBackfillResult = this.db.prepare(`
        UPDATE ledger_entries 
        SET is_void = 0 
        WHERE is_void IS NULL
      `).run();
      if (voidBackfillResult.changes > 0) {
        console.log(`Backfilled ${voidBackfillResult.changes} ledger entries with is_void = 0`);
      }
    } catch (e) {
      console.log('is_void backfill skipped or already complete');
    }

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

  // Calculate customer balance using centralized ledger computation
  // Architecture Contract v1.0: Ledger is the SINGLE source of truth
  getCustomerBalance(customerId) {
    return this.computeAccountBalance('customer', customerId);
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
      INSERT INTO customers (name, phone, address, balance, initial_balance)
      VALUES (@name, @phone, @address, @balance, @initial_balance)
    `);
    const info = stmt.run({
      name: customer.name,
      phone: customer.phone || null,
      address: customer.address || null,
      balance: customer.balance || 0,
      initial_balance: customer.balance || 0  // Persist initial balance
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

  // DEPRECATED: Direct balance updates are not allowed per Architecture Contract v1.0
  // Balance is computed from ledger entries only.
  // This function is kept for backward compatibility but logs a warning.
  updateCustomerBalance(id, balance) {
    if (this.isDev) {
      console.warn(`DEPRECATED: updateCustomerBalance() called for customer ${id}. Balance should be computed from ledger.`);
    }
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

  // Get farmer transaction by ID with items
  getFarmerTransactionById(id) {
    // Get main transaction with farmer details
    const txn = this.db.prepare(`
      SELECT ft.*, f.name as farmer_name, f.phone as farmer_phone
      FROM farmer_transactions ft
      JOIN farmers f ON ft.farmer_id = f.id
      WHERE ft.id = ?
    `).get(id);

    if (!txn) return null;

    // Get transaction items
    const items = this.db.prepare(`
      SELECT * FROM farmer_transaction_items
      WHERE transaction_id = ?
      ORDER BY id
    `).all(id);

    // Attach items to transaction
    txn.items = items;

    return txn;
  }

  // Farmer operations (similar to customers)
  getAllFarmers(options = {}) {
    const { limit, offset, sortBy = 'name', sortOrder = 'ASC' } = options;

    let query = 'SELECT * FROM farmers ORDER BY ' + sortBy + ' ' + sortOrder;
    let params = [];

    if (limit) {
      query += ' LIMIT ? OFFSET ?';
      params = [limit, offset || 0];
    }

    const stmt = this.db.prepare(query);
    const farmers = params.length > 0 ? stmt.all(...params) : stmt.all();

    // Calculate balance dynamically for each farmer
    farmers.forEach(farmer => {
      farmer.balance = this.getFarmerBalance(farmer.id);
    });

    if (limit) {
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM farmers');
      const total = countStmt.get().count;

      return {
        data: farmers,
        total,
        limit,
        offset: offset || 0,
        hasMore: (offset || 0) + limit < total
      };
    }

    return farmers;
  }

  getFarmerById(id) {
    const stmt = this.db.prepare('SELECT * FROM farmers WHERE id = ?');
    const farmer = stmt.get(id);

    if (farmer) {
      farmer.balance = this.getFarmerBalance(farmer.id);
    }

    return farmer;
  }

  // Calculate farmer balance using centralized ledger computation
  // Architecture Contract v1.0: Ledger is the SINGLE source of truth
  getFarmerBalance(farmerId) {
    return this.computeAccountBalance('farmer', farmerId);
  }

  addFarmer(farmer) {
    // Check for duplicates
    const duplicateStmt = this.db.prepare(`
      SELECT id, name FROM farmers 
      WHERE LOWER(name) = LOWER(?) OR (phone IS NOT NULL AND phone = ?)
    `);
    const duplicate = duplicateStmt.get(farmer.name, farmer.phone || null);

    if (duplicate) {
      throw new Error(`Farmer "${duplicate.name}" already exists`);
    }

    const stmt = this.db.prepare(`
      INSERT INTO farmers (name, phone, address, balance, initial_balance)
      VALUES (@name, @phone, @address, @balance, @initial_balance)
    `);
    const info = stmt.run({
      name: farmer.name,
      phone: farmer.phone || null,
      address: farmer.address || null,
      balance: farmer.balance || 0,
      initial_balance: farmer.balance || 0  // Persist initial balance
    });
    return info.lastInsertRowid;
  }

  updateFarmer(id, farmer) {
    const stmt = this.db.prepare(`
      UPDATE farmers 
      SET name = @name, phone = @phone, address = @address, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);
    return stmt.run({
      id,
      name: farmer.name,
      phone: farmer.phone,
      address: farmer.address
    });
  }

  // DEPRECATED: Direct balance updates are not allowed per Architecture Contract v1.0
  // Balance is computed from ledger entries only.
  // This function is kept for backward compatibility but logs a warning.
  updateFarmerBalance(id, balance) {
    if (this.isDev) {
      console.warn(`DEPRECATED: updateFarmerBalance() called for farmer ${id}. Balance should be computed from ledger.`);
    }
    const stmt = this.db.prepare(`
      UPDATE farmers 
      SET balance = @balance, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);
    return stmt.run({ id, balance });
  }

  deleteFarmer(id) {
    const stmt = this.db.prepare('DELETE FROM farmers WHERE id = ?');
    return stmt.run(id);
  }

  searchFarmers(query) {
    if (typeof query !== 'string') {
      return [];
    }

    const stmt = this.db.prepare(`
      SELECT * FROM farmers 
      WHERE name LIKE ? OR phone LIKE ? OR id = ?
      ORDER BY name
      LIMIT 100
    `);
    const searchTerm = `%${query}%`;
    const idSearch = isNaN(query) ? -1 : parseInt(query);
    const farmers = stmt.all(searchTerm, searchTerm, idSearch);

    farmers.forEach(farmer => {
      farmer.balance = this.getFarmerBalance(farmer.id);
    });

    return farmers;
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

  // Check if fish category is referenced by any transactions
  isFishCategoryReferenced(id) {
    // Check transaction_items table
    const customerTxnStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM transaction_items WHERE fish_category_id = ?
    `);
    const customerTxnCount = customerTxnStmt.get(id).count;

    // Check farmer_transactions table
    const farmerTxnStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM farmer_transactions WHERE fish_category_id = ?
    `);
    const farmerTxnCount = farmerTxnStmt.get(id).count;

    const totalCount = customerTxnCount + farmerTxnCount;

    return {
      isReferenced: totalCount > 0,
      customerTransactionCount: customerTxnCount,
      farmerTransactionCount: farmerTxnCount,
      totalCount: totalCount
    };
  }

  // Delete fish category (only if not referenced)
  deleteFishCategory(id) {
    // Check for references first
    const refs = this.isFishCategoryReferenced(id);

    if (refs.isReferenced) {
      throw new Error(
        `Cannot delete: category is used in ${refs.totalCount} transaction(s) ` +
        `(${refs.customerTransactionCount} customer, ${refs.farmerTransactionCount} farmer). ` +
        `Deactivate instead to preserve history.`
      );
    }

    const stmt = this.db.prepare('DELETE FROM fish_categories WHERE id = ?');
    return stmt.run(id);
  }

  // Transaction operations
  addTransaction(transaction) {
    const addTxn = this.db.transaction((txn) => {
      // Insert transaction
      const stmt = this.db.prepare(`
        INSERT INTO transactions (
          customer_id, transaction_date, transaction_time, 
          total_amount, paid_amount, balance_change, balance_after, payment_status, notes, extra_charges
        )
        VALUES (
          @customer_id, @transaction_date, @transaction_time,
          @total_amount, @paid_amount, @balance_change, @balance_after, @payment_status, @notes, @extra_charges
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
        notes: txn.notes || null,
        extra_charges: txn.extra_charges || 0
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

      // Architecture Contract v1.0: Balance is computed from ledger ONLY
      // DO NOT call updateCustomerBalance here - removed per contract

      // Update daily summary
      this.updateDailySummary(txn.transaction_date, txn.total_amount, txn.paid_amount, txn.balance_change);

      // Insert ledger entry for sale (CREDIT to customer account)
      // balance_change is negative when customer owes money (outstanding)
      // We record the absolute value as a CREDIT entry
      // Architecture Contract: Every sale creates exactly ONE ledger entry
      const ledgerStmt = this.db.prepare(`
        INSERT INTO ledger_entries (entity_type, entity_id, entry_type, amount, reference_type, reference_id, description, entry_date, affects_balance)
        VALUES ('customer', ?, ?, ?, 'sale', ?, 'Sale transaction', ?, 1)
      `);
      // If balance_change is negative (customer owes), it's a CREDIT
      // If balance_change is positive (customer overpaid/prepaid), it's a DEBIT
      // If balance_change is 0, still create entry with 0 amount for audit trail
      const entryType = txn.balance_change <= 0 ? 'CREDIT' : 'DEBIT';
      ledgerStmt.run(txn.customer_id, entryType, Math.abs(txn.balance_change), transactionId, txn.transaction_date);

      // WRITE-TIME ATOMICITY: Sync balance cache inside the same transaction
      // If this fails, the entire transaction rolls back (no partial writes)
      this.syncBalanceCache('customer', txn.customer_id);

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

  // Farmer transaction operations
  addFarmerTransaction(transaction) {
    const addTxn = this.db.transaction((txn) => {
      // Insert farmer transaction (no longer includes single fish details)
      const stmt = this.db.prepare(`
        INSERT INTO farmer_transactions (
          farmer_id, transaction_date, transaction_time,
          total_weight_kg, customer_markup_percentage,
          total_fish_value, commission_percentage, commission_amount,
          munshi_nama, baraf_price, labour_rate_per_kg, labour_charges, extra_charges,
          total_amount, paid_amount, balance_change, balance_after, notes, status
        )
        VALUES (
          @farmer_id, @transaction_date, @transaction_time,
          @total_weight_kg, @customer_markup_percentage,
          @total_fish_value, @commission_percentage, @commission_amount,
          @munshi_nama, @baraf_price, @labour_rate_per_kg, @labour_charges, @extra_charges,
          @total_amount, @paid_amount, @balance_change, @balance_after, @notes, @status
        )
      `);

      const info = stmt.run({
        farmer_id: txn.farmer_id,
        transaction_date: txn.transaction_date,
        transaction_time: txn.transaction_time,
        total_weight_kg: txn.total_weight_kg,
        customer_markup_percentage: txn.customer_markup_percentage,
        total_fish_value: txn.total_fish_value,
        commission_percentage: txn.commission_percentage,
        commission_amount: txn.commission_amount,
        munshi_nama: txn.munshi_nama || 0,
        baraf_price: txn.baraf_price || 0,
        labour_rate_per_kg: txn.labour_rate_per_kg || 0,
        labour_charges: txn.labour_charges || 0,
        extra_charges: txn.extra_charges || 0,
        total_amount: txn.total_amount,
        paid_amount: txn.paid_amount || 0,
        balance_change: txn.balance_change,
        balance_after: txn.balance_after,
        notes: txn.notes || null,
        status: txn.status || 'completed'
      });

      const transactionId = info.lastInsertRowid;

      // Insert farmer transaction items
      if (txn.items && txn.items.length > 0) {
        const itemStmt = this.db.prepare(`
          INSERT INTO farmer_transaction_items (
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
      }

      // Architecture Contract v1.0: Balance is computed from ledger ONLY
      // DO NOT call updateFarmerBalance here - removed per contract

      // Insert ledger entry for farmer purchase
      // balance_change is positive when we owe the farmer (DEBIT to our account)
      // balance_change is negative if farmer was overpaid (CREDIT)
      // Architecture Contract: Every purchase creates exactly ONE ledger entry
      const ledgerStmt = this.db.prepare(`
        INSERT INTO ledger_entries (entity_type, entity_id, entry_type, amount, reference_type, reference_id, description, entry_date, affects_balance)
        VALUES ('farmer', ?, ?, ?, 'purchase', ?, 'Farmer purchase transaction', ?, 1)
      `);
      // If balance_change is positive (we owe farmer), it's a DEBIT
      // If balance_change is negative (farmer was overpaid), it's a CREDIT
      // If balance_change is 0, still create entry for audit trail
      const entryType = txn.balance_change >= 0 ? 'DEBIT' : 'CREDIT';
      ledgerStmt.run(txn.farmer_id, entryType, Math.abs(txn.balance_change), transactionId, txn.transaction_date);

      // WRITE-TIME ATOMICITY: Sync balance cache inside the same transaction
      // If this fails, the entire transaction rolls back (no partial writes)
      this.syncBalanceCache('farmer', txn.farmer_id);

      return transactionId;
    });

    return addTxn(transaction);
  }

  getFarmerTransactions(options = {}) {
    const {
      limit = 50,
      offset = 0,
      farmerName = null
    } = options;

    let query = `
      SELECT ft.*, f.name as farmer_name 
      FROM farmer_transactions ft
      JOIN farmers f ON ft.farmer_id = f.id
      WHERE 1=1
    `;
    const params = [];

    if (farmerName) {
      query += ' AND f.name LIKE ?';
      params.push(`%${farmerName}%`);
    }

    query += ` AND (ft.status IS NULL OR ft.status = 'completed')`;
    query += ' ORDER BY ft.transaction_date DESC, ft.transaction_time DESC';
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const transactions = stmt.all(...params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as count
      FROM farmer_transactions ft
      JOIN farmers f ON ft.farmer_id = f.id
      WHERE 1=1
    `;
    const countParams = [];

    if (farmerName) {
      countQuery += ' AND f.name LIKE ?';
      countParams.push(`%${farmerName}%`);
    }

    countQuery += ` AND (ft.status IS NULL OR ft.status = 'completed')`;

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

  getTransactionsByFarmer(farmerId) {
    // Query farmer transactions with aggregated fish names from items table
    const stmt = this.db.prepare(`
      SELECT ft.*, 
        COALESCE(
          (SELECT GROUP_CONCAT(fti.fish_name, ', ') 
           FROM farmer_transaction_items fti 
           WHERE fti.transaction_id = ft.id),
          ft.fish_name,
          'N/A'
        ) as fish_name
      FROM farmer_transactions ft
      WHERE ft.farmer_id = ? AND (ft.status IS NULL OR ft.status = 'completed')
      ORDER BY ft.transaction_date DESC, ft.transaction_time DESC
    `);
    return stmt.all(farmerId);
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

  // ============================================================================
  // LEDGER-BASED BALANCE COMPUTATION (Architecture Contract v1.0)
  // The ledger is the SINGLE source of truth for account balances.
  // Balance = initial_balance + SUM(ledger_entries WHERE affects_balance = 1)
  // ============================================================================

  /**
   * CENTRAL BALANCE COMPUTATION - Single Source of Truth
   * 
   * Computes account balance using ONLY the ledger entries.
   * This function implements the Architecture Contract v1.0:
   * - Balance = initial_balance + SUM(DEBIT) - SUM(CREDIT) from ledger
   * - No reference to transactions tables (those are for history only)
   * - Reversals naturally cancel originals (no status filtering)
   * - Only entries with affects_balance = 1 participate in calculation
   *
   * @param {string} entityType - 'customer' or 'farmer'
   * @param {number} entityId - The entity's primary key
   * @returns {number} The computed balance
   */
  computeAccountBalance(entityType, entityId) {
    // Get initial_balance from the entity table
    const tableName = entityType === 'customer' ? 'customers' : 'farmers';
    const initialStmt = this.db.prepare(`
      SELECT COALESCE(initial_balance, 0) as initial_balance 
      FROM ${tableName} WHERE id = ?
    `);
    const initialResult = initialStmt.get(entityId);
    const initialBalance = initialResult ? initialResult.initial_balance : 0;

    // Compute balance from ALL ledger entries where affects_balance = 1
    // DEBIT = payment received (increases balance for customer, decreases for farmer debt)
    // CREDIT = amount owed (decreases balance for customer, increases for farmer debt)
    // 
    // For CUSTOMERS: positive balance = credit available, negative = owes money
    //   DEBIT entries (payments) ADD to balance
    //   CREDIT entries (charges) SUBTRACT from balance
    //
    // For FARMERS: positive balance = we owe them, negative = they owe us
    //   DEBIT entries (purchases) ADD to balance (we owe more)
    //   CREDIT entries (payments) SUBTRACT from balance (we paid them)
    const balanceStmt = this.db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits,
        COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits
      FROM ledger_entries 
      WHERE entity_type = ? 
        AND entity_id = ? 
        AND (affects_balance IS NULL OR affects_balance = 1)
    `);
    const result = balanceStmt.get(entityType, entityId);

    // Balance = initial + debits - credits
    return initialBalance + (result.total_debits - result.total_credits);
  }

  /**
   * Verify that computed balance matches cached balance (safety check)
   * Logs error if mismatch detected - does NOT auto-fix per contract
   * 
   * @param {string} entityType - 'customer' or 'farmer'
   * @param {number} entityId - The entity's primary key
   */
  verifyBalanceIntegrity(entityType, entityId) {
    const tableName = entityType === 'customer' ? 'customers' : 'farmers';

    // Get cached balance
    const cachedStmt = this.db.prepare(`SELECT balance FROM ${tableName} WHERE id = ?`);
    const cachedResult = cachedStmt.get(entityId);
    const cachedBalance = cachedResult ? cachedResult.balance : 0;

    // Compute actual balance
    const computedBalance = this.computeAccountBalance(entityType, entityId);

    // Check for mismatch (allow small floating point tolerance)
    const tolerance = 0.01;
    if (Math.abs(cachedBalance - computedBalance) > tolerance) {
      console.error(`BALANCE INTEGRITY ERROR: ${entityType} ${entityId}`);
      console.error(`  Cached: ${cachedBalance}, Computed: ${computedBalance}`);
      console.error(`  Difference: ${cachedBalance - computedBalance}`);
      // DO NOT auto-fix per Architecture Contract - only log
    }

    return { cached: cachedBalance, computed: computedBalance, match: Math.abs(cachedBalance - computedBalance) <= tolerance };
  }

  /**
   * SINGLE BALANCE MUTATION GATEWAY
   * 
   * This is the ONLY function that may update balance cache columns.
   * All write paths that affect balance must call this function.
   * 
   * Architecture Contract v1.0: Balance cache is optional and may be stale.
   * The ledger is the source of truth; this just keeps cache synchronized.
   * 
   * @param {string} entityType - 'customer' or 'farmer'
   * @param {number} entityId - The entity's primary key
   * @param {number} deltaAmount - Signed amount (+ or -) to apply
   */
  applyBalanceDelta(entityType, entityId, deltaAmount) {
    // Guard: Only apply if delta is non-zero
    if (deltaAmount === 0 || deltaAmount === null || deltaAmount === undefined) {
      return;
    }

    const tableName = entityType === 'customer' ? 'customers' : 'farmers';

    // Update balance cache atomically
    const stmt = this.db.prepare(`
      UPDATE ${tableName} 
      SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(deltaAmount, entityId);

    // Verify integrity after update (development only)
    if (this.isDev) {
      this.verifyBalanceIntegrity(entityType, entityId);
    }
  }

  /**
   * Sync balance cache from ledger (recompute and store)
   * Use when cache may be out of sync with ledger.
   * 
   * @param {string} entityType - 'customer' or 'farmer'
   * @param {number} entityId - The entity's primary key
   */
  syncBalanceCache(entityType, entityId) {
    const computedBalance = this.computeAccountBalance(entityType, entityId);
    const tableName = entityType === 'customer' ? 'customers' : 'farmers';

    const stmt = this.db.prepare(`
      UPDATE ${tableName} 
      SET balance = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(computedBalance, entityId);

    return computedBalance;
  }

  // Feature flag - DEPRECATED, kept for backward compatibility
  // Balance is now always computed from ledger
  get useLedgerBalance() {
    return true; // Always use ledger
  }

  set useLedgerBalance(value) {
    // No-op - ledger is always the source of truth now
    if (!value && this.isDev) {
      console.warn('useLedgerBalance setter is deprecated. Ledger is always the source of truth.');
    }
  }

  // Add manual ledger entry (CREDIT or DEBIT)
  // 
  // MODE A: Financial Entry (affects_balance = 1)
  //   - amount IS NOT NULL and > 0
  //   - Participates in balance calculation
  //   - Requires reversal for deletion
  //
  // MODE B: Informational Entry (affects_balance = 0)
  //   - amount IS NULL (stored as NULL, not 0)
  //   - Does NOT affect balance
  //   - Can be soft-deleted without reversal
  //
  // Architecture Contract v1.0: Validates invariants before insert
  addLedgerEntry(entry) {
    // Determine if this is a financial or informational entry
    const isFinancial = entry.affects_balance !== 0;

    // ==== APPLICATION-LEVEL VALIDATION (Architecture Contract Invariants) ====

    // GUARD 1: Financial entries require a valid amount
    if (isFinancial && (entry.amount === undefined || entry.amount === null)) {
      throw new Error('LEDGER INVARIANT VIOLATION: financial entries (affects_balance=1) require an amount');
    }

    // GUARD 2: Financial entries must have amount > 0 (reject zero-amount)
    if (isFinancial && entry.amount <= 0) {
      throw new Error('LEDGER INVARIANT VIOLATION: amount must be > 0 for financial entries');
    }

    // GUARD 3: Informational entries MUST NOT have a non-null amount
    // This prevents accidentally treating 0 as informational
    if (!isFinancial && entry.amount !== undefined && entry.amount !== null && entry.amount !== 0) {
      console.warn(`LEDGER WARNING: Informational entry has amount=${entry.amount}. Setting to NULL.`);
    }

    // GUARD 4: entry_type must be CREDIT or DEBIT
    if (!['CREDIT', 'DEBIT'].includes(entry.entry_type)) {
      throw new Error('LEDGER INVARIANT VIOLATION: entry_type must be CREDIT or DEBIT');
    }

    // WRITE-TIME ATOMICITY: Wrap insert + balance sync in transaction
    const insertEntry = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO ledger_entries (
          entity_type, entity_id, entry_type, amount, reference_type, 
          description, entry_date, entry_time, affects_balance, is_void
        )
        VALUES (
          @entity_type, @entity_id, @entry_type, @amount, 'manual', 
          @description, @entry_date, @entry_time, @affects_balance, 0
        )
      `);

      // For informational entries, store NULL for amount (not 0)
      // This makes the financial/informational distinction unambiguous
      const amountToStore = isFinancial ? entry.amount : null;

      const info = stmt.run({
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        entry_type: entry.entry_type, // 'CREDIT' or 'DEBIT'
        amount: amountToStore,
        description: entry.description || null,
        entry_date: entry.entry_date || null,
        entry_time: entry.entry_time || null,
        affects_balance: isFinancial ? 1 : 0
      });

      // Sync balance cache only for financial entries
      if (isFinancial) {
        this.syncBalanceCache(entry.entity_type, entry.entity_id);
      }

      // OPERATIONAL LOGGING: Audit trail for ledger insert
      this.logOperationalEvent('LEDGER_INSERT', {
        entry_id: info.lastInsertRowid,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        entry_type: entry.entry_type,
        affects_balance: isFinancial ? 1 : 0,
        reference_type: 'manual'
      });

      return info.lastInsertRowid;
    });

    return insertEntry();
  }

  // TRANSITIONAL: Get ledger entries for an entity
  getLedgerEntries(entityType, entityId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    const stmt = this.db.prepare(`
      SELECT * FROM ledger_entries 
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(entityType, entityId, limit, offset);
  }

  // TRANSITIONAL: Get all ledger entries (for reports)
  getAllLedgerEntries(options = {}) {
    const { limit = 100, offset = 0, entityType = null } = options;

    let query = 'SELECT * FROM ledger_entries';
    const params = [];

    if (entityType) {
      query += ' WHERE entity_type = ?';
      params.push(entityType);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  // Get single ledger entry by ID (for receipt view)
  getLedgerEntryById(id) {
    const stmt = this.db.prepare(`
      SELECT le.*, 
        CASE le.entity_type 
          WHEN 'customer' THEN (SELECT name FROM customers WHERE id = le.entity_id)
          WHEN 'farmer' THEN (SELECT name FROM farmers WHERE id = le.entity_id)
        END as entity_name
      FROM ledger_entries le
      WHERE le.id = ?
    `);
    return stmt.get(id);
  }

  // Get unified account history for customer (fish transactions + manual entries)
  // DEFAULT VIEW: Only shows active (non-voided, non-reversed) entries
  // 
  // READ-PATH OPTIMIZED: Paginated, deterministic ordering, no balance calculation
  //
  // @param {number} customerId - Customer ID
  // @param {object} options - Pagination options
  // @param {number} options.limit - Max records to return (default: 50, max: 200)
  // @param {number} options.offset - Records to skip (default: 0)
  // @returns {object} - { data: array, total: number, hasMore: boolean }
  getCustomerAccountHistory(customerId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    const safeLimit = Math.min(limit, 200); // Hard cap at 200

    // PERFORMANCE GUARD: Check if account has excessive records
    const countStmt = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM transactions WHERE customer_id = ? AND (status IS NULL OR status = 'completed')) +
        (SELECT COUNT(*) FROM ledger_entries WHERE entity_type = 'customer' AND entity_id = ? AND reference_type = 'manual' AND (is_reversed IS NULL OR is_reversed = 0)) 
      AS total
    `);
    const total = countStmt.get(customerId, customerId).total;

    if (total > 10000 && this.isDev) {
      console.warn(`PERFORMANCE WARNING: Customer ${customerId} has ${total} records. Consider archiving.`);
    }

    const stmt = this.db.prepare(`
      SELECT * FROM (
        SELECT 
          'sale' as record_type,
          id,
          transaction_date as entry_date,
          transaction_time as entry_time,
          total_amount as amount,
          paid_amount,
          balance_change,
          payment_status,
          NULL as description,
          NULL as entry_type,
          created_at,
          NULL as audit_status,
          1 as affects_balance
        FROM transactions
        WHERE customer_id = ? AND (status IS NULL OR status = 'completed')

        UNION ALL

        SELECT 
          'manual_' || LOWER(entry_type) as record_type,
          id,
          COALESCE(entry_date, DATE(created_at)) as entry_date,
          TIME(created_at) as entry_time,
          amount,
          NULL as paid_amount,
          CASE entry_type
            WHEN 'CREDIT' THEN -amount
            WHEN 'DEBIT' THEN amount
          END as balance_change,
          NULL as payment_status,
          description,
          entry_type,
          created_at,
          NULL as audit_status,
          COALESCE(affects_balance, 1) as affects_balance
        FROM ledger_entries
        WHERE entity_type = 'customer' 
          AND entity_id = ? 
          AND reference_type = 'manual'
          AND (is_reversed IS NULL OR is_reversed = 0)
      )
      ORDER BY entry_date DESC, created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `);

    const data = stmt.all(customerId, customerId, safeLimit, offset);

    return {
      data,
      total,
      limit: safeLimit,
      offset,
      hasMore: offset + data.length < total
    };
  }

  // AUDIT VIEW: Shows ALL entries including voided/reversed with status labels
  // READ-PATH SAFE: Paginated to prevent unbounded queries
  //
  // @param {number} customerId - Customer ID
  // @param {object} options - Pagination options (limit, offset)
  // @returns {object} - { data: array, total: number, hasMore: boolean }
  getCustomerAccountAuditHistory(customerId, options = {}) {
    const { limit = 100, offset = 0 } = options;
    const safeLimit = Math.min(limit, 500); // Hard cap at 500 for audit

    // Get total count for pagination
    const countStmt = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM transactions WHERE customer_id = ?) +
        (SELECT COUNT(*) FROM ledger_entries WHERE entity_type = 'customer' AND entity_id = ? AND (reference_type = 'manual' OR reference_type = 'void')) 
      AS total
    `);
    const total = countStmt.get(customerId, customerId).total;

    const stmt = this.db.prepare(`
      SELECT * FROM (
        SELECT 
          'sale' as record_type,
          id,
          transaction_date as entry_date,
          transaction_time as entry_time,
          total_amount as amount,
          paid_amount,
          balance_change,
          payment_status,
          NULL as description,
          NULL as entry_type,
          created_at,
          CASE WHEN status = 'voided' THEN 'VOIDED' ELSE NULL END as audit_status
        FROM transactions
        WHERE customer_id = ?

        UNION ALL

        SELECT 
          'manual_' || LOWER(entry_type) as record_type,
          id,
          COALESCE(entry_date, DATE(created_at)) as entry_date,
          TIME(created_at) as entry_time,
          amount,
          NULL as paid_amount,
          CASE entry_type
            WHEN 'CREDIT' THEN -amount
            WHEN 'DEBIT' THEN amount
          END as balance_change,
          NULL as payment_status,
          description,
          entry_type,
          created_at,
          CASE 
            WHEN is_reversed = 1 THEN 'REVERSED'
            WHEN reference_type = 'void' THEN 'REVERSAL_ENTRY'
            ELSE NULL 
          END as audit_status
        FROM ledger_entries
        WHERE entity_type = 'customer' 
          AND entity_id = ? 
          AND (reference_type = 'manual' OR reference_type = 'void')
      )
      ORDER BY entry_date DESC, entry_time DESC
      LIMIT ? OFFSET ?
    `);

    const data = stmt.all(customerId, customerId, safeLimit, offset);

    return {
      data,
      total,
      limit: safeLimit,
      offset,
      hasMore: offset + data.length < total
    };
  }

  // Get unified account history for farmer (fish transactions + manual entries)
  // DEFAULT VIEW: Only shows active (non-voided, non-reversed) entries
  // 
  // READ-PATH OPTIMIZED: Paginated, deterministic ordering, no balance calculation
  //
  // @param {number} farmerId - Farmer ID
  // @param {object} options - Pagination options
  // @param {number} options.limit - Max records to return (default: 50, max: 200)
  // @param {number} options.offset - Records to skip (default: 0)
  // @returns {object} - { data: array, total: number, hasMore: boolean }
  getFarmerAccountHistory(farmerId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    const safeLimit = Math.min(limit, 200); // Hard cap at 200

    // PERFORMANCE GUARD: Check if account has excessive records
    const countStmt = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM farmer_transactions WHERE farmer_id = ? AND (status IS NULL OR status = 'completed')) +
        (SELECT COUNT(*) FROM ledger_entries WHERE entity_type = 'farmer' AND entity_id = ? AND reference_type = 'manual' AND (is_reversed IS NULL OR is_reversed = 0)) 
      AS total
    `);
    const total = countStmt.get(farmerId, farmerId).total;

    if (total > 10000 && this.isDev) {
      console.warn(`PERFORMANCE WARNING: Farmer ${farmerId} has ${total} records. Consider archiving.`);
    }

    const stmt = this.db.prepare(`
      SELECT * FROM (
        SELECT 
          'purchase' as record_type,
          ft.id,
          ft.transaction_date as entry_date,
          ft.transaction_time as entry_time,
          ft.total_amount as amount,
          ft.paid_amount,
          ft.balance_change,
          NULL as payment_status,
          NULL as description,
          NULL as entry_type,
          ft.created_at,
          COALESCE(
            (SELECT GROUP_CONCAT(fti.fish_name, ', ') 
             FROM farmer_transaction_items fti 
             WHERE fti.transaction_id = ft.id),
            ft.fish_name,
            'N/A'
          ) as fish_name,
          ft.commission_amount,
          NULL as audit_status,
          1 as affects_balance
        FROM farmer_transactions ft
        WHERE ft.farmer_id = ? AND (ft.status IS NULL OR ft.status = 'completed')

        UNION ALL

        SELECT 
          'manual_' || LOWER(entry_type) as record_type,
          id,
          COALESCE(entry_date, DATE(created_at)) as entry_date,
          TIME(created_at) as entry_time,
          amount,
          NULL as paid_amount,
          CASE entry_type
            WHEN 'DEBIT' THEN amount
            WHEN 'CREDIT' THEN -amount
          END as balance_change,
          NULL as payment_status,
          description,
          entry_type,
          created_at,
          NULL as fish_name,
          NULL as commission_amount,
          NULL as audit_status,
          COALESCE(affects_balance, 1) as affects_balance
        FROM ledger_entries
        WHERE entity_type = 'farmer' 
          AND entity_id = ? 
          AND reference_type = 'manual'
          AND (is_reversed IS NULL OR is_reversed = 0)
      )
      ORDER BY entry_date DESC, created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `);

    const data = stmt.all(farmerId, farmerId, safeLimit, offset);

    return {
      data,
      total,
      limit: safeLimit,
      offset,
      hasMore: offset + data.length < total
    };
  }

  // AUDIT VIEW: Shows ALL entries including voided/reversed with status labels
  // READ-PATH SAFE: Paginated to prevent unbounded queries
  //
  // @param {number} farmerId - Farmer ID
  // @param {object} options - Pagination options (limit, offset)
  // @returns {object} - { data: array, total: number, hasMore: boolean }
  getFarmerAccountAuditHistory(farmerId, options = {}) {
    const { limit = 100, offset = 0 } = options;
    const safeLimit = Math.min(limit, 500); // Hard cap at 500 for audit

    // Get total count for pagination
    const countStmt = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM farmer_transactions WHERE farmer_id = ?) +
        (SELECT COUNT(*) FROM ledger_entries WHERE entity_type = 'farmer' AND entity_id = ? AND (reference_type = 'manual' OR reference_type = 'void')) 
      AS total
    `);
    const total = countStmt.get(farmerId, farmerId).total;

    const stmt = this.db.prepare(`
      SELECT * FROM (
        SELECT 
          'purchase' as record_type,
          ft.id,
          ft.transaction_date as entry_date,
          ft.transaction_time as entry_time,
          ft.total_amount as amount,
          ft.paid_amount,
          ft.balance_change,
          NULL as payment_status,
          NULL as description,
          NULL as entry_type,
          ft.created_at,
          COALESCE(
            (SELECT GROUP_CONCAT(fti.fish_name, ', ') 
             FROM farmer_transaction_items fti 
             WHERE fti.transaction_id = ft.id),
            ft.fish_name,
            'N/A'
          ) as fish_name,
          ft.commission_amount,
          CASE WHEN ft.status = 'voided' THEN 'VOIDED' ELSE NULL END as audit_status
        FROM farmer_transactions ft
        WHERE ft.farmer_id = ?

        UNION ALL

        SELECT 
          'manual_' || LOWER(entry_type) as record_type,
          id,
          COALESCE(entry_date, DATE(created_at)) as entry_date,
          TIME(created_at) as entry_time,
          amount,
          NULL as paid_amount,
          CASE entry_type
            WHEN 'DEBIT' THEN amount
            WHEN 'CREDIT' THEN -amount
          END as balance_change,
          NULL as payment_status,
          description,
          entry_type,
          created_at,
          NULL as fish_name,
          NULL as commission_amount,
          CASE 
            WHEN is_reversed = 1 THEN 'REVERSED'
            WHEN reference_type = 'void' THEN 'REVERSAL_ENTRY'
            ELSE NULL 
          END as audit_status
        FROM ledger_entries
        WHERE entity_type = 'farmer' 
          AND entity_id = ? 
          AND (reference_type = 'manual' OR reference_type = 'void')
      )
      ORDER BY entry_date DESC, entry_time DESC
      LIMIT ? OFFSET ?
    `);

    const data = stmt.all(farmerId, farmerId, safeLimit, offset);

    return {
      data,
      total,
      limit: safeLimit,
      offset,
      hasMore: offset + data.length < total
    };
  }

  // Calculate customer balance from legacy transactions + manual ledger entries
  // ACCOUNTING INVARIANT: Each entry affects balance through exactly ONE mechanism:
  // - Original entries are INCLUDED in balance (never excluded)
  // - Reversal entries naturally cancel original entries
  // - affects_balance flag controls whether entry participates in balance math
  // DEPRECATED: This function now delegates to computeAccountBalance()
  getCustomerBalanceFromLedger(customerId) {
    // Architecture Contract v1.0: Use centralized balance computation
    return this.computeAccountBalance('customer', customerId);
  }

  // Calculate farmer balance - delegates to centralized computation
  // DEPRECATED: This function now delegates to computeAccountBalance()
  getFarmerBalanceFromLedger(farmerId) {
    // Architecture Contract v1.0: Use centralized balance computation
    return this.computeAccountBalance('farmer', farmerId);
  }

  // Void a customer fish transaction (accounting-safe deletion)
  // Status is marked 'voided' for UI visibility ONLY (to hide from account history)
  // Balance correction happens via reversing ledger entry (not by excluding the original)
  voidCustomerTransaction(transactionId) {
    const txn = this.getTransactionById(transactionId);
    if (!txn) {
      throw new Error('Transaction not found');
    }
    if (txn.status === 'voided') {
      throw new Error('Transaction is already voided');
    }

    // Use transaction for atomicity
    const voidTxn = this.db.transaction(() => {
      // Mark transaction as voided (for UI visibility only, NOT for balance)
      const updateStmt = this.db.prepare(`
        UPDATE transactions SET status = 'voided' WHERE id = ?
      `);
      updateStmt.run(transactionId);

      // Create reversing ledger entry to cancel the original balance effect
      // Original sale: negative balance_change = CREDIT effect
      // Reversal: if balance_change was negative, we DEBIT to cancel; if positive, we CREDIT
      const reverseType = txn.balance_change < 0 ? 'DEBIT' : 'CREDIT';
      const reverseAmount = Math.abs(txn.balance_change);

      const insertStmt = this.db.prepare(`
        INSERT INTO ledger_entries (
          entity_type, entity_id, entry_type, amount, 
          reference_type, reference_id, description, entry_date, affects_balance
        ) VALUES (
          'customer', ?, ?, ?, 
          'void', ?, ?, DATE('now'), 1
        )
      `);
      insertStmt.run(
        txn.customer_id,
        reverseType,
        reverseAmount,
        transactionId,
        `Voided transaction #${transactionId}`
      );

      // WRITE-TIME ATOMICITY: Sync balance cache inside the same transaction
      this.syncBalanceCache('customer', txn.customer_id);
    });

    voidTxn();
    return { success: true, transactionId };
  }

  // Void a farmer fish transaction (accounting-safe deletion)
  // Status is marked 'voided' for UI visibility ONLY
  voidFarmerTransaction(transactionId) {
    const txn = this.getFarmerTransactionById(transactionId);
    if (!txn) {
      throw new Error('Farmer transaction not found');
    }
    if (txn.status === 'voided') {
      throw new Error('Transaction is already voided');
    }

    const voidTxn = this.db.transaction(() => {
      // Mark transaction as voided (for UI visibility only)
      const updateStmt = this.db.prepare(`
        UPDATE farmer_transactions SET status = 'voided' WHERE id = ?
      `);
      updateStmt.run(transactionId);

      // Create reversing ledger entry to cancel the original balance effect
      // Farmer purchase: positive balance_change = DEBIT effect
      // Reversal: opposite direction
      const reverseType = txn.balance_change > 0 ? 'CREDIT' : 'DEBIT';
      const reverseAmount = Math.abs(txn.balance_change);

      const insertStmt = this.db.prepare(`
        INSERT INTO ledger_entries (
          entity_type, entity_id, entry_type, amount, 
          reference_type, reference_id, description, entry_date, affects_balance
        ) VALUES (
          'farmer', ?, ?, ?, 
          'void', ?, ?, DATE('now'), 1
        )
      `);
      insertStmt.run(
        txn.farmer_id,
        reverseType,
        reverseAmount,
        transactionId,
        `Voided farmer transaction #${transactionId}`
      );

      // WRITE-TIME ATOMICITY: Sync balance cache inside the same transaction
      this.syncBalanceCache('farmer', txn.farmer_id);
    });

    voidTxn();
    return { success: true, transactionId };
  }

  // Reverse a manual ledger entry (accounting-safe deletion)
  // For financial entries (affects_balance=1): creates compensating entry
  // For non-financial entries (affects_balance=0): soft delete without reversal
  reverseLedgerEntry(entryId) {
    const entry = this.getLedgerEntryById(entryId);
    if (!entry) {
      throw new Error('Ledger entry not found');
    }
    if (entry.is_reversed === 1) {
      throw new Error('Entry is already reversed');
    }
    if (entry.reference_type !== 'manual') {
      throw new Error('Only manual entries can be reversed');
    }

    const reverseTxn = this.db.transaction(() => {
      // Mark original entry as reversed (for UI visibility only, not balance)
      const updateStmt = this.db.prepare(`
        UPDATE ledger_entries SET is_reversed = 1 WHERE id = ?
      `);
      updateStmt.run(entryId);

      // Only create compensating entry for financial entries
      // Non-financial entries (affects_balance=0) don't need reversal math
      if (entry.affects_balance !== 0) {
        // Create compensating entry with opposite direction
        const reverseType = entry.entry_type === 'CREDIT' ? 'DEBIT' : 'CREDIT';

        const insertStmt = this.db.prepare(`
          INSERT INTO ledger_entries (
            entity_type, entity_id, entry_type, amount, 
            reference_type, reversal_of_id, description, entry_date, affects_balance
          ) VALUES (
            ?, ?, ?, ?, 
            'void', ?, ?, DATE('now'), 1
          )
        `);
        insertStmt.run(
          entry.entity_type,
          entry.entity_id,
          reverseType,
          entry.amount,
          entryId,
          `Reversal of entry #${entryId}: ${entry.description || 'Manual entry'}`
        );
      }
    });

    reverseTxn();
    return { success: true, entryId };
  }

  close() {
    this.db.close();
  }
}

module.exports = FishMarketDB;


