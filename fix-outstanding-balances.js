// Script to recalculate outstanding balances in daily_summary table
// 
// NOTE: This script needs to be run through Electron, not regular Node.js
// because better-sqlite3 is compiled for Electron's Node.js version.
// 
// To use this, you can either:
// 1. Delete the database/fishmarket.db file to start fresh with the new logic
// 2. The outstanding will self-correct as new transactions are added
// 3. Or add a "Fix Balances" button in the UI that calls this logic

const FishMarketDB = require('./src/js/database');

console.log('Fixing outstanding balances in daily_summary...\n');

const db = new FishMarketDB();

try {
  // Get all daily summaries
  const summaries = db.db.prepare('SELECT * FROM daily_summary ORDER BY date').all();
  
  console.log(`Found ${summaries.length} daily summary records`);
  
  // Clear outstanding amounts (we'll recalculate)
  db.db.prepare('UPDATE daily_summary SET total_outstanding = 0').run();
  
  // Get all transactions ordered by date
  const transactions = db.db.prepare(`
    SELECT transaction_date, balance_change 
    FROM transactions 
    ORDER BY transaction_date, transaction_time
  `).all();
  
  console.log(`Processing ${transactions.length} transactions...\n`);
  
  // Recalculate outstanding per day based on balance changes
  const dailyOutstanding = {};
  
  transactions.forEach(txn => {
    const date = txn.transaction_date;
    if (!dailyOutstanding[date]) {
      dailyOutstanding[date] = 0;
    }
    
    // If balance_change is negative, outstanding increased
    if (txn.balance_change < 0) {
      dailyOutstanding[date] += Math.abs(txn.balance_change);
    }
  });
  
  // Update each daily summary with recalculated outstanding
  const updateStmt = db.db.prepare(`
    UPDATE daily_summary 
    SET total_outstanding = @outstanding
    WHERE date = @date
  `);
  
  Object.keys(dailyOutstanding).forEach(date => {
    updateStmt.run({
      date,
      outstanding: dailyOutstanding[date]
    });
    console.log(`${date}: Rs.${dailyOutstanding[date].toFixed(2)} outstanding`);
  });
  
  console.log('\n✓ Outstanding balances recalculated successfully!');
  console.log('\nNote: This shows the outstanding amount ADDED per day, not the current total outstanding.');
  console.log('Current total outstanding is based on customer balances, not daily summaries.');
  
} catch (error) {
  console.error('Error fixing outstanding balances:', error);
} finally {
  db.close();
}

