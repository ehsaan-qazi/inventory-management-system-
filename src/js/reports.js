// Reports page functionality
let currentReportData = [];
let currentFarmerReportData = [];
let currentReportType = 'customer';

document.addEventListener('DOMContentLoaded', async () => {
  // Set default dates to this month
  loadThisMonth();
  await loadCustomerBalances();
  
  // Also initialize farmer report dates
  loadFarmerThisMonth();
  await loadFarmerBalances();
});

// Load today's report
function loadToday() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('startDate').value = today;
  document.getElementById('endDate').value = today;
  loadReportByDateRange();
}

// Load this week's report
function loadThisWeek() {
  const today = new Date();
  const firstDay = new Date(today.setDate(today.getDate() - today.getDay()));
  const lastDay = new Date(today.setDate(today.getDate() - today.getDay() + 6));
  
  document.getElementById('startDate').value = firstDay.toISOString().split('T')[0];
  document.getElementById('endDate').value = lastDay.toISOString().split('T')[0];
  loadReportByDateRange();
}

// Load this month's report
function loadThisMonth() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  document.getElementById('startDate').value = firstDay.toISOString().split('T')[0];
  document.getElementById('endDate').value = lastDay.toISOString().split('T')[0];
  loadReportByDateRange();
}

// Load report by date range
async function loadReportByDateRange() {
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  if (!startDate || !endDate) {
    showAlert('Please select both start and end dates', 'warning');
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    showAlert('Start date cannot be after end date', 'warning');
    return;
  }

  try {
    currentReportData = await window.electronAPI.getReportByDateRange(startDate, endDate);
    displayReport(currentReportData);
    await calculateSummary(currentReportData);
  } catch (error) {
    console.error('Error loading report:', error);
    showAlert('Failed to load report', 'error');
  }
}

// Display report in table
function displayReport(reportData) {
  const tbody = document.getElementById('reportBody');
  
  if (reportData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">No data found for selected date range</td></tr>';
    return;
  }

  tbody.innerHTML = reportData.map(day => {
    const date = new Date(day.date);
    // Show net outstanding change for the day (can be positive or negative)
    const outstandingChange = day.total_outstanding;
    const displayValue = outstandingChange >= 0 
      ? `+Rs.${outstandingChange.toFixed(2)}` 
      : `-Rs.${Math.abs(outstandingChange).toFixed(2)}`;
    
    return `
      <tr>
        <td>${date.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</td>
        <td>Rs.${day.total_sales.toFixed(2)}</td>
        <td>Rs.${day.total_cash_received.toFixed(2)}</td>
        <td>${displayValue}</td>
        <td>${day.transactions_count}</td>
      </tr>
    `;
  }).join('');
}

// Calculate and display summary
async function calculateSummary(reportData) {
  const summary = reportData.reduce((acc, day) => {
    acc.totalSales += day.total_sales;
    acc.cashReceived += day.total_cash_received;
    acc.transactions += day.transactions_count;
    return acc;
  }, { totalSales: 0, cashReceived: 0, transactions: 0 });

  // Get CURRENT outstanding from all customers (not historical)
  const customers = await window.electronAPI.getCustomers();
  const currentOutstanding = customers
    .filter(c => c.balance < 0)
    .reduce((sum, c) => sum + Math.abs(c.balance), 0);

  document.getElementById('totalSales').textContent = `Rs.${summary.totalSales.toFixed(2)}`;
  document.getElementById('cashReceived').textContent = `Rs.${summary.cashReceived.toFixed(2)}`;
  document.getElementById('totalOutstanding').textContent = `Rs.${currentOutstanding.toFixed(2)}`;
  document.getElementById('transactionCount').textContent = summary.transactions;
}

// Load customer balances (outstanding and prepaid)
async function loadCustomerBalances() {
  try {
    const customers = await window.electronAPI.getCustomers();
    
    const outstanding = customers.filter(c => c.balance < 0);
    const prepaid = customers.filter(c => c.balance > 0);
    
    displayOutstandingCustomers(outstanding);
    displayPrepaidCustomers(prepaid);
  } catch (error) {
    console.error('Error loading customer balances:', error);
    showAlert('Failed to load customer balances', 'error');
  }
}

// Display outstanding customers
function displayOutstandingCustomers(customers) {
  const tbody = document.getElementById('outstandingCustomers');
  
  if (customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="no-data">No customers with outstanding balance</td></tr>';
    return;
  }

  // Sort by outstanding amount (highest first)
  customers.sort((a, b) => a.balance - b.balance);

  tbody.innerHTML = customers.map(customer => `
    <tr>
      <td>${customer.name}</td>
      <td>${customer.phone || 'N/A'}</td>
      <td class="balance outstanding">Rs.${Math.abs(customer.balance).toFixed(2)}</td>
      <td>
        <button class="btn btn-small" onclick="viewCustomerDetails(${customer.id})">View Details</button>
      </td>
    </tr>
  `).join('');
}

// Display prepaid customers
function displayPrepaidCustomers(customers) {
  const tbody = document.getElementById('prepaidCustomers');
  
  if (customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="no-data">No customers with prepaid balance</td></tr>';
    return;
  }

  // Sort by prepaid amount (highest first)
  customers.sort((a, b) => b.balance - a.balance);

  tbody.innerHTML = customers.map(customer => `
    <tr>
      <td>${customer.name}</td>
      <td>${customer.phone || 'N/A'}</td>
      <td class="balance prepaid">Rs.${customer.balance.toFixed(2)}</td>
      <td>
        <button class="btn btn-small" onclick="viewCustomerDetails(${customer.id})">View Details</button>
      </td>
    </tr>
  `).join('');
}

// View customer details (redirect to customers page)
function viewCustomerDetails(customerId) {
  window.location.href = `customers.html?id=${customerId}`;
}

// Export report to CSV
async function exportToCSV() {
  if (currentReportData.length === 0) {
    showAlert('No data to export. Please generate a report first.', 'warning');
    return;
  }

  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  // Create CSV content
  let csv = 'Date,Total Sales,Cash Received,Outstanding Change,Transactions\n';
  
  currentReportData.forEach(day => {
    const date = new Date(day.date).toLocaleDateString('en-IN');
    csv += `${date},${day.total_sales.toFixed(2)},${day.total_cash_received.toFixed(2)},${day.total_outstanding.toFixed(2)},${day.transactions_count}\n`;
  });

  // Add summary row
  const summary = currentReportData.reduce((acc, day) => {
    acc.totalSales += day.total_sales;
    acc.cashReceived += day.total_cash_received;
    acc.transactions += day.transactions_count;
    return acc;
  }, { totalSales: 0, cashReceived: 0, transactions: 0 });

  // Get current outstanding for CSV
  const customers = await window.electronAPI.getCustomers();
  const currentOutstanding = customers
    .filter(c => c.balance < 0)
    .reduce((sum, c) => sum + Math.abs(c.balance), 0);

  csv += `\nSummary,${summary.totalSales.toFixed(2)},${summary.cashReceived.toFixed(2)},Current: ${currentOutstanding.toFixed(2)},${summary.transactions}\n`;

  // Create download link
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `sales_report_${startDate}_to_${endDate}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showAlert('Report exported successfully!', 'success');
}

// Show alert message
function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alertContainer');
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  
  alertContainer.appendChild(alert);
  
  setTimeout(() => {
    alert.remove();
  }, 5000);
}

// =====================================================
// FARMER REPORTS FUNCTIONALITY
// =====================================================

// Switch between customer and farmer reports (exposed globally for HTML onclick)
window.switchReportType = function(type) {
  currentReportType = type;
  
  const customerTab = document.getElementById('customerReportTab');
  const farmerTab = document.getElementById('farmerReportTab');
  const customerSection = document.getElementById('customerReportsSection');
  const farmerSection = document.getElementById('farmerReportsSection');
  
  if (type === 'customer') {
    customerTab.classList.add('active');
    farmerTab.classList.remove('active');
    customerTab.style.color = 'var(--primary-color)';
    customerTab.style.borderBottomColor = 'var(--primary-color)';
    farmerTab.style.color = 'var(--text-secondary)';
    farmerTab.style.borderBottomColor = 'transparent';
    customerSection.style.display = 'block';
    farmerSection.style.display = 'none';
  } else {
    farmerTab.classList.add('active');
    customerTab.classList.remove('active');
    farmerTab.style.color = 'var(--primary-color)';
    farmerTab.style.borderBottomColor = 'var(--primary-color)';
    customerTab.style.color = 'var(--text-secondary)';
    customerTab.style.borderBottomColor = 'transparent';
    customerSection.style.display = 'none';
    farmerSection.style.display = 'block';
  }
};

// Farmer date presets (exposed globally for HTML onclick)
window.loadFarmerToday = function() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('farmerStartDate').value = today;
  document.getElementById('farmerEndDate').value = today;
  loadFarmerReportByDateRange();
};

window.loadFarmerThisWeek = function() {
  const today = new Date();
  const firstDay = new Date(today.setDate(today.getDate() - today.getDay()));
  const lastDay = new Date(today.setDate(today.getDate() - today.getDay() + 6));
  
  document.getElementById('farmerStartDate').value = firstDay.toISOString().split('T')[0];
  document.getElementById('farmerEndDate').value = lastDay.toISOString().split('T')[0];
  loadFarmerReportByDateRange();
};

window.loadFarmerThisMonth = function() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  document.getElementById('farmerStartDate').value = firstDay.toISOString().split('T')[0];
  document.getElementById('farmerEndDate').value = lastDay.toISOString().split('T')[0];
  loadFarmerReportByDateRange();
};

// Load farmer report by date range (exposed globally for HTML onclick)
window.loadFarmerReportByDateRange = async function() {
  const startDate = document.getElementById('farmerStartDate').value;
  const endDate = document.getElementById('farmerEndDate').value;

  if (!startDate || !endDate) {
    showAlert('Please select both start and end dates', 'warning');
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    showAlert('Start date cannot be after end date', 'warning');
    return;
  }

  try {
    // Get farmer transactions within date range
    const allFarmerTransactions = await window.electronAPI.getFarmerTransactions({});
    const transactions = (allFarmerTransactions.data || allFarmerTransactions).filter(txn => {
      const txnDate = new Date(txn.transaction_date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return txnDate >= start && txnDate <= end;
    });
    
    // Group by date
    const dailyData = {};
    transactions.forEach(txn => {
      const date = txn.transaction_date;
      if (!dailyData[date]) {
        dailyData[date] = {
          date: date,
          total_purchases: 0,
          total_cash_paid: 0,
          balance_change: 0,
          transactions_count: 0
        };
      }
      
      dailyData[date].total_purchases += txn.total_fish_value;
      dailyData[date].total_cash_paid += txn.paid_amount;
      dailyData[date].balance_change += txn.balance_change;
      dailyData[date].transactions_count++;
    });
    
    currentFarmerReportData = Object.values(dailyData).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
    displayFarmerReport(currentFarmerReportData);
    await calculateFarmerSummary(currentFarmerReportData);
  } catch (error) {
    console.error('Error loading farmer report:', error);
    showAlert('Failed to load farmer report', 'error');
  }
};

// Display farmer report in table
function displayFarmerReport(reportData) {
  const tbody = document.getElementById('farmerReportBody');
  
  if (reportData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">No data found for selected date range</td></tr>';
    return;
  }

  tbody.innerHTML = reportData.map(day => {
    const date = new Date(day.date);
    const balanceChange = day.balance_change;
    const displayValue = balanceChange >= 0 
      ? `+Rs.${balanceChange.toFixed(2)}` 
      : `-Rs.${Math.abs(balanceChange).toFixed(2)}`;
    
    return `
      <tr>
        <td>${date.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</td>
        <td>Rs.${day.total_purchases.toFixed(2)}</td>
        <td>Rs.${day.total_cash_paid.toFixed(2)}</td>
        <td>${displayValue}</td>
        <td>${day.transactions_count}</td>
      </tr>
    `;
  }).join('');
}

// Calculate and display farmer summary
async function calculateFarmerSummary(reportData) {
  const summary = reportData.reduce((acc, day) => {
    acc.totalPurchases += day.total_purchases;
    acc.cashPaid += day.total_cash_paid;
    acc.transactions += day.transactions_count;
    return acc;
  }, { totalPurchases: 0, cashPaid: 0, transactions: 0 });

  // Get CURRENT amount we owe to farmers
  const farmers = await window.electronAPI.getFarmers({});
  const allFarmers = farmers.data || farmers;
  const weOwe = allFarmers
    .filter(f => f.balance < 0)
    .reduce((sum, f) => sum + Math.abs(f.balance), 0);

  document.getElementById('farmerTotalPurchases').textContent = `Rs.${summary.totalPurchases.toFixed(2)}`;
  document.getElementById('farmerCashPaid').textContent = `Rs.${summary.cashPaid.toFixed(2)}`;
  document.getElementById('farmerWeOwe').textContent = `Rs.${weOwe.toFixed(2)}`;
  document.getElementById('farmerTransactionCount').textContent = summary.transactions;
}

// Load farmer balances (we owe and credit)
async function loadFarmerBalances() {
  try {
    const farmers = await window.electronAPI.getFarmers({});
    const allFarmers = farmers.data || farmers;
    
    const weOwe = allFarmers.filter(f => f.balance < 0);
    const credit = allFarmers.filter(f => f.balance > 0);
    
    displayFarmersWeOwe(weOwe);
    displayFarmersCredit(credit);
  } catch (error) {
    console.error('Error loading farmer balances:', error);
    showAlert('Failed to load farmer balances', 'error');
  }
}

// Display farmers we owe
function displayFarmersWeOwe(farmers) {
  const tbody = document.getElementById('farmersWeOwe');
  
  if (farmers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="no-data">No farmers we owe money to</td></tr>';
    return;
  }

  // Sort by amount we owe (highest first)
  farmers.sort((a, b) => a.balance - b.balance);

  tbody.innerHTML = farmers.map(farmer => `
    <tr>
      <td>${farmer.name}</td>
      <td>${farmer.phone || 'N/A'}</td>
      <td class="balance outstanding">Rs.${Math.abs(farmer.balance).toFixed(2)}</td>
      <td>
        <button class="btn btn-small" onclick="viewFarmerDetails(${farmer.id})">View Details</button>
      </td>
    </tr>
  `).join('');
}

// Display farmers with credit
function displayFarmersCredit(farmers) {
  const tbody = document.getElementById('farmerCredit');
  
  if (farmers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="no-data">No farmers with credit balance</td></tr>';
    return;
  }

  // Sort by credit amount (highest first)
  farmers.sort((a, b) => b.balance - a.balance);

  tbody.innerHTML = farmers.map(farmer => `
    <tr>
      <td>${farmer.name}</td>
      <td>${farmer.phone || 'N/A'}</td>
      <td class="balance prepaid">Rs.${farmer.balance.toFixed(2)}</td>
      <td>
        <button class="btn btn-small" onclick="viewFarmerDetails(${farmer.id})">View Details</button>
      </td>
    </tr>
  `).join('');
}

// View farmer details (redirect to farmers page)
function viewFarmerDetails(farmerId) {
  window.location.href = `farmers.html?id=${farmerId}`;
}

// Export farmer report to CSV (exposed globally for HTML onclick)
window.exportFarmerToCSV = async function() {
  if (currentFarmerReportData.length === 0) {
    showAlert('No data to export. Please generate a report first.', 'warning');
    return;
  }

  const startDate = document.getElementById('farmerStartDate').value;
  const endDate = document.getElementById('farmerEndDate').value;

  // Create CSV content
  let csv = 'Date,Total Purchases,Cash Paid,Balance Change,Transactions\n';
  
  currentFarmerReportData.forEach(day => {
    const date = new Date(day.date).toLocaleDateString('en-IN');
    csv += `${date},${day.total_purchases.toFixed(2)},${day.total_cash_paid.toFixed(2)},${day.balance_change.toFixed(2)},${day.transactions_count}\n`;
  });

  // Add summary row
  const summary = currentFarmerReportData.reduce((acc, day) => {
    acc.totalPurchases += day.total_purchases;
    acc.cashPaid += day.total_cash_paid;
    acc.transactions += day.transactions_count;
    return acc;
  }, { totalPurchases: 0, cashPaid: 0, transactions: 0 });

  // Get current we owe for CSV
  const farmers = await window.electronAPI.getFarmers({});
  const allFarmers = farmers.data || farmers;
  const weOwe = allFarmers
    .filter(f => f.balance < 0)
    .reduce((sum, f) => sum + Math.abs(f.balance), 0);

  csv += `\nSummary,${summary.totalPurchases.toFixed(2)},${summary.cashPaid.toFixed(2)},Current We Owe: ${weOwe.toFixed(2)},${summary.transactions}\n`;

  // Create download link
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `farmer_report_${startDate}_to_${endDate}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showAlert('Farmer report exported successfully!', 'success');
};

