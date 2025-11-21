// Farmers page functionality
(function() {
  'use strict';
  
  let allFarmers = [];
  let currentEditingId = null;
  let searchTimeout;
  let suggestionsDiv;
  
  // Pagination state
  let currentPage = 1;
  let pageSize = 50;
  let totalPages = 1;
  let totalFarmers = 0;

  document.addEventListener('DOMContentLoaded', async () => {
    await loadFarmers();
    checkURLParameters();
    setupLiveSearch();
  });
  
  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
  });

// Load all farmers with pagination
async function loadFarmers() {
  try {
    const offset = (currentPage - 1) * pageSize;
    const result = await window.electronAPI.getFarmers({
      limit: pageSize,
      offset: offset
    });
    
    // Handle paginated response
    if (result.data) {
      allFarmers = result.data;
      totalFarmers = result.total;
      totalPages = Math.ceil(result.total / pageSize);
    } else {
      // Fallback for non-paginated response
      allFarmers = result;
      totalFarmers = result.length;
      totalPages = 1;
    }
    
    displayFarmers(allFarmers);
    updatePaginationUI();
  } catch (error) {
    console.error('Error loading farmers:', error);
    showAlert('Failed to load farmers', 'error');
  }
}

// Update pagination UI
function updatePaginationUI() {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const pageInfo = document.getElementById('pageInfo');
  
  if (prevBtn && nextBtn && pageInfo) {
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage >= totalPages;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalFarmers} farmers)`;
  }
}

// Pagination controls
function nextPage() {
  if (currentPage < totalPages) {
    currentPage++;
    loadFarmers();
  }
}

function previousPage() {
  if (currentPage > 1) {
    currentPage--;
    loadFarmers();
  }
}

function changePageSize() {
  pageSize = parseInt(document.getElementById('pageSize').value);
  currentPage = 1; // Reset to first page
  loadFarmers();
}

// Display farmers in table
function displayFarmers(farmers) {
  const tbody = document.getElementById('farmersTable');
  
  if (farmers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="no-data">No farmers found. Add your first farmer!</td></tr>';
    return;
  }

  tbody.innerHTML = farmers.map(farmer => {
    const balance = parseFloat(farmer.balance);
    let balanceClass = 'zero';
    let statusText = 'Balanced';
    let statusClass = 'active';

    if (balance < 0) {
      // Negative balance = we owe the farmer
      balanceClass = 'outstanding';
      statusText = 'We Owe';
      statusClass = 'unpaid';
    } else if (balance > 0) {
      // Positive balance = farmer has credit/prepaid
      balanceClass = 'prepaid';
      statusText = 'Credit';
      statusClass = 'paid';
    }

    return `
      <tr>
        <td>#${farmer.id}</td>
        <td>${farmer.name}</td>
        <td>${farmer.phone || '-'}</td>
        <td>${farmer.address || '-'}</td>
        <td class="balance ${balanceClass}">Rs.${Math.abs(balance).toFixed(2)}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td class="action-buttons">
          <button class="action-btn view" onclick="viewFarmer(${farmer.id})" title="View Details">👁️</button>
          <button class="action-btn edit" onclick="editFarmer(${farmer.id})" title="Edit"><img src="../assets/edit.png" alt="Edit" style="width: 16px; height: 16px;"></button>
          <button class="action-btn delete" onclick="deleteFarmer(${farmer.id})" title="Delete"><img src="../assets/delete.png" alt="Delete" style="width: 16px; height: 16px;"></button>
        </td>
      </tr>
    `;
  }).join('');
}

// Setup live search with autocomplete
function setupLiveSearch() {
  const searchInput = document.getElementById('searchInput');
  const searchBar = searchInput.closest('.search-bar');
  
  // Create suggestions dropdown
  suggestionsDiv = document.createElement('div');
  suggestionsDiv.className = 'search-suggestions';
  searchBar.appendChild(suggestionsDiv);
  
  // Live search on input
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    
    if (!query) {
      suggestionsDiv.style.display = 'none';
      displayFarmers(allFarmers);
      return;
    }
    
    // Debounce - wait 300ms after user stops typing
    searchTimeout = setTimeout(async () => {
      await performLiveSearch(query);
    }, 300);
  });
  
  // Hide suggestions when clicking outside (use capture phase to avoid conflicts)
  document.addEventListener('click', (e) => {
    if (!searchBar.contains(e.target) && !suggestionsDiv.contains(e.target)) {
      suggestionsDiv.style.display = 'none';
    }
  }, true); // Use capture phase
}

// Perform live search and show suggestions
async function performLiveSearch(query) {
  try {
    const results = await window.electronAPI.searchFarmers(query);
    displayFarmers(results);
    displaySuggestions(results, query);
  } catch (error) {
    console.error('Error searching farmers:', error);
    showAlert('Error searching farmers', 'error');
  }
}

// Display search suggestions
function displaySuggestions(results, query) {
  if (results.length === 0) {
    suggestionsDiv.style.display = 'none';
    return;
  }
  
  const queryLower = query.toLowerCase();
  
  suggestionsDiv.innerHTML = results.slice(0, 5).map(farmer => {
    const balance = parseFloat(farmer.balance);
    let balanceColor = '#666';
    let balanceText = 'Balanced';
    
    if (balance < 0) {
      balanceColor = '#d32f2f';
      balanceText = `We Owe: Rs.${Math.abs(balance).toFixed(2)}`;
    } else if (balance > 0) {
      balanceColor = '#388e3c';
      balanceText = `Credit: Rs.${balance.toFixed(2)}`;
    } else {
      balanceText = 'Balance: Rs.0.00';
    }
    
    // Highlight matching text
    const highlightText = (text, query) => {
      if (!text) return '';
      const index = text.toLowerCase().indexOf(queryLower);
      if (index === -1) return text;
      const before = text.substring(0, index);
      const match = text.substring(index, index + query.length);
      const after = text.substring(index + query.length);
      return `${before}<span class="suggestion-highlight">${match}</span>${after}`;
    };
    
    return `
      <div class="suggestion-item" onclick="selectFarmerFromSuggestion(${farmer.id})">
        <div class="suggestion-name">${highlightText(farmer.name, query)}</div>
        <div class="suggestion-details">
          <span><img src="../assets/mobile.png" alt="Phone" style="width: 14px; height: 14px; vertical-align: middle;"> ${highlightText(farmer.phone || 'No phone', query)}</span>
          <span style="color: ${balanceColor};">${balanceText}</span>
        </div>
      </div>
    `;
  }).join('');
  
  suggestionsDiv.style.display = 'block';
}

// Select farmer from suggestion
function selectFarmerFromSuggestion(farmerId) {
  suggestionsDiv.style.display = 'none';
  viewFarmer(farmerId);
}

// Search farmers (legacy - for button click)
async function searchFarmers() {
  const searchInput = document.getElementById('searchInput');
  const query = searchInput.value.trim();
  
  if (!query) {
    displayFarmers(allFarmers);
    suggestionsDiv.style.display = 'none';
    return;
  }

  await performLiveSearch(query);
}

// Check URL parameters for search or specific farmer
function checkURLParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  const searchQuery = urlParams.get('search');
  const farmerId = urlParams.get('id');
  const filter = urlParams.get('filter');

  if (searchQuery) {
    document.getElementById('searchInput').value = searchQuery;
    searchFarmers();
  } else if (farmerId) {
    viewFarmer(parseInt(farmerId));
  } else if (filter === 'outstanding') {
    // Filter to show only farmers we owe money to
    const outstandingFarmers = allFarmers.filter(f => f.balance < 0);
    displayFarmers(outstandingFarmers);
  }
}

// Open add farmer modal
function openAddFarmerModal() {
  currentEditingId = null;
  document.getElementById('modalTitle').textContent = 'Add Farmer';
  document.getElementById('farmerForm').reset();
  document.getElementById('farmerId').value = '';
  document.getElementById('farmerBalance').value = '0';
  document.getElementById('farmerModal').classList.add('active');
}

// Open edit farmer modal
async function editFarmer(id) {
  try {
    const farmer = await window.electronAPI.getFarmerById(id);
    if (!farmer) {
      showAlert('Farmer not found', 'error');
      return;
    }

    currentEditingId = id;
    document.getElementById('modalTitle').textContent = 'Edit Farmer';
    document.getElementById('farmerId').value = farmer.id;
    document.getElementById('farmerName').value = farmer.name;
    document.getElementById('farmerPhone').value = farmer.phone || '';
    document.getElementById('farmerAddress').value = farmer.address || '';
    document.getElementById('farmerBalance').value = farmer.balance;
    document.getElementById('farmerBalance').disabled = true; // Can't edit balance directly
    
    document.getElementById('farmerModal').classList.add('active');
  } catch (error) {
    console.error('Error loading farmer:', error);
    showAlert('Failed to load farmer details', 'error');
  }
}

// Close farmer modal
function closeFarmerModal() {
  document.getElementById('farmerModal').classList.remove('active');
  document.getElementById('farmerForm').reset();
  document.getElementById('farmerBalance').disabled = false;
  currentEditingId = null;
}

// Save farmer (add or update)
async function saveFarmer(event) {
  // Get button for loading state
  const saveBtn = event ? event.target : document.querySelector('.btn-primary');
  setButtonLoading(saveBtn, true);
  
  try {
    const name = document.getElementById('farmerName').value.trim();
    const phone = document.getElementById('farmerPhone').value.trim();
    const address = document.getElementById('farmerAddress').value.trim();
    const balance = parseFloat(document.getElementById('farmerBalance').value) || 0;

    // Validate farmer name
    const nameValidation = Validators.customerName(name); // Reuse customer name validator
    if (!nameValidation.valid) {
      showAlert(nameValidation.error, 'warning');
      return;
    }

    // Validate phone number
    const phoneValidation = Validators.phoneNumber(phone);
    if (!phoneValidation.valid) {
      showAlert(phoneValidation.error, 'warning');
      return;
    }

    // Validate address
    const addressValidation = Validators.address(address);
    if (!addressValidation.valid) {
      showAlert(addressValidation.error, 'warning');
      return;
    }

    const farmerData = { 
      name: nameValidation.value, 
      phone: phoneValidation.value, 
      address: addressValidation.value 
    };

    if (currentEditingId) {
      // Update existing farmer
      await window.electronAPI.updateFarmer(currentEditingId, farmerData);
      showAlert('Farmer updated successfully', 'success');
    } else {
      // Add new farmer
      farmerData.balance = roundMoney(balance);
      await window.electronAPI.addFarmer(farmerData);
      showAlert('Farmer added successfully', 'success');
    }

    closeFarmerModal();
    await loadFarmers();
  } catch (error) {
    // Better error messages
    let errorMessage = 'Failed to save farmer';
    if (error.message) {
      if (error.message.includes('already exists')) {
        errorMessage = error.message;
      } else if (error.message.includes('UNIQUE constraint')) {
        errorMessage = 'A farmer with this name or phone already exists';
      } else {
        errorMessage = `Error: ${error.message}`;
      }
    }
    showAlert(errorMessage, 'error');
  } finally {
    setButtonLoading(saveBtn, false);
  }
}

// Make function available globally for onclick
window.saveFarmer = saveFarmer;

// Delete farmer
async function deleteFarmer(id) {
  const farmer = allFarmers.find(f => f.id === id);
  if (!farmer) return;

  const confirmDelete = confirm(
    `Are you sure you want to delete "${farmer.name}"?\n\nThis will also delete all associated transactions. This action cannot be undone.`
  );

  if (!confirmDelete) return;

  try {
    await window.electronAPI.deleteFarmer(id);
    showAlert('Farmer deleted successfully', 'success');
    await loadFarmers();
  } catch (error) {
    console.error('Error deleting farmer:', error);
    showAlert('Failed to delete farmer', 'error');
  }
}

// View farmer details
async function viewFarmer(id) {
  try {
    const farmer = await window.electronAPI.getFarmerById(id);
    if (!farmer) {
      showAlert('Farmer not found', 'error');
      return;
    }

    // Populate farmer details
    document.getElementById('viewFarmerName').textContent = farmer.name;
    document.getElementById('viewFarmerPhone').textContent = farmer.phone || 'N/A';
    document.getElementById('viewFarmerAddress').textContent = farmer.address || 'N/A';
    
    const balance = parseFloat(farmer.balance);
    let balanceText = `Rs.${Math.abs(balance).toFixed(2)}`;
    let balanceClass = 'zero';
    
    if (balance < 0) {
      balanceClass = 'outstanding';
      balanceText += ' (We Owe)';
    } else if (balance > 0) {
      balanceClass = 'prepaid';
      balanceText += ' (Credit)';
    } else {
      balanceText += ' (Balanced)';
    }
    
    const balanceSpan = document.getElementById('viewFarmerBalance');
    balanceSpan.textContent = balanceText;
    balanceSpan.className = `balance ${balanceClass}`;
    
    const createdDate = new Date(farmer.created_at);
    document.getElementById('viewFarmerDate').textContent = createdDate.toLocaleDateString('en-IN');

    // Load transaction history
    const transactions = await window.electronAPI.getTransactionsByFarmer(id);
    const transactionsBody = document.getElementById('farmerTransactions');
    
    if (transactions.length === 0) {
      transactionsBody.innerHTML = '<tr><td colspan="5" class="no-data">No transactions yet</td></tr>';
    } else {
      transactionsBody.innerHTML = transactions.map(txn => {
        const date = new Date(txn.transaction_date);
        return `
          <tr class="transaction-row-clickable" onclick="viewFarmerTransactionReceipt(${txn.id})">
            <td>${date.toLocaleDateString('en-IN')}</td>
            <td>${txn.fish_name}</td>
            <td>Rs.${txn.total_amount.toFixed(2)}</td>
            <td>Rs.${txn.commission_amount.toFixed(2)}</td>
            <td class="action-buttons">
              <button class="action-btn edit" onclick="event.stopPropagation(); editFarmerTransactionFromFarmer(${txn.id})" title="Edit">
                <img src="../assets/edit.png" alt="Edit" style="width: 16px; height: 16px;">
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    document.getElementById('viewFarmerModal').classList.add('active');
  } catch (error) {
    console.error('Error viewing farmer:', error);
    showAlert('Failed to load farmer details', 'error');
  }
}

// Close view farmer modal
function closeViewFarmerModal() {
  document.getElementById('viewFarmerModal').classList.remove('active');
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

// Edit farmer transaction from farmer modal
let editingFarmerTransactionId = null;
let editingFarmerId = null;

async function editFarmerTransactionFromFarmer(txnId) {
  try {
    const txn = await window.electronAPI.getFarmerTransactionById(txnId);
    if (!txn) {
      showAlert('Transaction not found', 'error');
      return;
    }
    
    editingFarmerTransactionId = txnId;
    editingFarmerId = txn.farmer_id;
    
    // Populate modal
    document.getElementById('editFarmerTxnId').textContent = txn.id;
    document.getElementById('editFarmerTxnName').value = txn.farmer_name;
    document.getElementById('editFarmerNetAmount').value = formatMoney(txn.total_amount);
    document.getElementById('editFarmerPaidAmount').value = txn.paid_amount.toFixed(2);
    document.getElementById('editFarmerNotes').value = txn.notes || '';
    
    // Show modal
    document.getElementById('editFarmerTransactionModal').classList.add('active');
  } catch (error) {
    console.error('Error loading farmer transaction:', error);
    showAlert('Failed to load transaction details', 'error');
  }
}

function closeEditFarmerTransactionModal() {
  document.getElementById('editFarmerTransactionModal').classList.remove('active');
  editingFarmerTransactionId = null;
  editingFarmerId = null;
}

async function saveEditedFarmerTransaction() {
  if (!editingFarmerTransactionId) return;
  
  try {
    const paidAmount = parseFloat(document.getElementById('editFarmerPaidAmount').value) || 0;
    const notes = document.getElementById('editFarmerNotes').value.trim();
    
    await window.electronAPI.updateTransaction(editingFarmerTransactionId, {
      paid_amount: paidAmount,
      notes: notes
    });
    
    showAlert('Transaction updated successfully', 'success');
    closeEditFarmerTransactionModal();
    
    // Refresh farmer view
    if (editingFarmerId) {
      await viewFarmer(editingFarmerId);
    }
  } catch (error) {
    console.error('Error updating transaction:', error);
    showAlert('Failed to update transaction', 'error');
  }
}

// View farmer transaction receipt
async function viewFarmerTransactionReceipt(txnId) {
  try {
    const txn = await window.electronAPI.getFarmerTransactionById(txnId);
    if (!txn) {
      showAlert('Transaction not found', 'error');
      return;
    }
    
    const date = new Date(txn.transaction_date);
    const receiptContent = document.getElementById('farmerReceiptContent');
    
    receiptContent.innerHTML = `
      <div style="font-family: monospace; padding: 20px; background: white;">
        <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px;">
          <h2 style="margin: 0;">FishMarket</h2>
          <p style="margin: 5px 0;">Farmer Transaction Receipt</p>
        </div>
        
        <div style="margin-bottom: 20px;">
          <p><strong>Receipt #:</strong> ${txn.id}</p>
          <p><strong>Date:</strong> ${date.toLocaleDateString('en-IN')} ${txn.transaction_time}</p>
          <p><strong>Farmer:</strong> ${txn.farmer_name}</p>
          <p><strong>Phone:</strong> ${txn.farmer_phone || 'N/A'}</p>
        </div>

        <div style="margin-bottom: 20px; padding: 15px; background: #f0f8ff; border-radius: 8px;">
          <h3 style="margin-top: 0;">Fish Details</h3>
          <p><strong>Fish:</strong> ${txn.fish_name}</p>
          <p><strong>Weight:</strong> ${formatWeight(txn.total_weight_kg)}</p>
          <p><strong>Price per Maund:</strong> Rs.${txn.price_per_maund.toFixed(2)}</p>
          <p style="font-size: 18px; margin: 10px 0;"><strong>Total Fish Value: Rs.${txn.total_fish_value.toFixed(2)}</strong></p>
        </div>

        <div style="margin-bottom: 20px;">
          <h3>Deductions</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 8px;">Commission (${txn.commission_percentage}%)</td>
              <td style="text-align: right; padding: 8px; color: #d32f2f;">- Rs.${txn.commission_amount.toFixed(2)}</td>
            </tr>
            ${txn.munshi_nama > 0 ? `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 8px;">Munshi Nama</td>
              <td style="text-align: right; padding: 8px; color: #d32f2f;">- Rs.${txn.munshi_nama.toFixed(2)}</td>
            </tr>
            ` : ''}
            ${txn.baraf_price > 0 ? `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 8px;">Baraf Price</td>
              <td style="text-align: right; padding: 8px; color: #d32f2f;">- Rs.${txn.baraf_price.toFixed(2)}</td>
            </tr>
            ` : ''}
            ${txn.labour_charges > 0 ? `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 8px;">Labour Charges</td>
              <td style="text-align: right; padding: 8px; color: #d32f2f;">- Rs.${txn.labour_charges.toFixed(2)}</td>
            </tr>
            ` : ''}
            ${txn.extra_charges > 0 ? `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 8px;">Extra Charges</td>
              <td style="text-align: right; padding: 8px; color: #d32f2f;">- Rs.${txn.extra_charges.toFixed(2)}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #ffc107;">
          <p style="font-size: 20px; margin: 0; font-weight: bold; color: #2e7d32;">
            Net Amount to Farmer: Rs.${txn.total_amount.toFixed(2)}
          </p>
          <p style="margin: 10px 0 0 0;">Paid: Rs.${txn.paid_amount.toFixed(2)}</p>
          <p style="margin: 5px 0 0 0; font-weight: bold;">
            Balance: Rs.${Math.abs(txn.balance_after).toFixed(2)} 
            ${txn.balance_after < 0 ? '(We Owe)' : txn.balance_after > 0 ? '(Credit)' : '(Balanced)'}
          </p>
        </div>

        ${txn.notes ? `<div style="margin-top: 20px; padding: 10px; background: #f5f5f5;"><strong>Notes:</strong> ${txn.notes}</div>` : ''}

        <div style="margin-top: 30px; text-align: center; border-top: 2px solid #000; padding-top: 10px;">
          <p style="margin: 0;">Thank you for your business!</p>
        </div>
      </div>
    `;
    
    document.getElementById('viewFarmerReceiptModal').classList.add('active');
  } catch (error) {
    console.error('Error viewing farmer transaction:', error);
    showAlert('Failed to load transaction receipt', 'error');
  }
}

function closeViewFarmerReceiptModal() {
  document.getElementById('viewFarmerReceiptModal').classList.remove('active');
}

function printFarmerReceipt() {
  const receiptContent = document.getElementById('farmerReceiptContent').innerHTML;
  const printWindow = window.open('', '', 'height=600,width=800');
  
  printWindow.document.write('<html><head><title>Print Receipt</title>');
  printWindow.document.write('</head><body>');
  printWindow.document.write(receiptContent);
  printWindow.document.write('</body></html>');
  
  printWindow.document.close();
  printWindow.print();
}

// Helper function to format weight
function formatWeight(totalKg) {
  const KG_PER_MAUND = 40;
  if (totalKg < KG_PER_MAUND) {
    return `${totalKg.toFixed(2)} KG`;
  }
  const maunds = Math.floor(totalKg / KG_PER_MAUND);
  const kg = totalKg % KG_PER_MAUND;
  if (kg === 0) {
    return `${maunds} Maund`;
  }
  return `${maunds} Maund ${kg.toFixed(2)} KG`;
}

// Close modal when clicking outside
window.onclick = function(event) {
  const farmerModal = document.getElementById('farmerModal');
  const viewModal = document.getElementById('viewFarmerModal');
  const editModal = document.getElementById('editFarmerTransactionModal');
  const receiptModal = document.getElementById('viewFarmerReceiptModal');
  
  if (event.target === farmerModal) {
    closeFarmerModal();
  }
  if (event.target === viewModal) {
    closeViewFarmerModal();
  }
  if (event.target === editModal) {
    closeEditFarmerTransactionModal();
  }
  if (event.target === receiptModal) {
    closeViewFarmerReceiptModal();
  }
};

// Expose functions needed by HTML onclick handlers
window.openAddFarmerModal = openAddFarmerModal;
window.editFarmer = editFarmer;
window.deleteFarmer = deleteFarmer;
window.viewFarmer = viewFarmer;
window.closeFarmerModal = closeFarmerModal;
window.closeViewFarmerModal = closeViewFarmerModal;
window.searchFarmers = searchFarmers;
window.selectFarmerFromSuggestion = selectFarmerFromSuggestion;
window.nextPage = nextPage;
window.previousPage = previousPage;
window.changePageSize = changePageSize;
window.editFarmerTransactionFromFarmer = editFarmerTransactionFromFarmer;
window.closeEditFarmerTransactionModal = closeEditFarmerTransactionModal;
window.saveEditedFarmerTransaction = saveEditedFarmerTransaction;
window.viewFarmerTransactionReceipt = viewFarmerTransactionReceipt;
window.closeViewFarmerReceiptModal = closeViewFarmerReceiptModal;
window.printFarmerReceipt = printFarmerReceipt;

})(); // End of IIFE

