// Manual Entries page functionality
// TRANSITIONAL: This page handles manual credit/debit entries via ledger_entries table

let customers = [];
let farmers = [];
let searchTimeout;
let currentEntityType = 'customer';
let selectedEntity = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadCustomers();
    await loadFarmers();
    await loadRecentEntries();
    setupEntitySearch();
    initializeDateField();
});

// Initialize date field to today's date
function initializeDateField() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('entryDate').value = today;
}

// Load customers for search
async function loadCustomers() {
    try {
        customers = await window.electronAPI.getCustomers();
    } catch (error) {
        console.error('Error loading customers:', error);
    }
}

// Load farmers for search
async function loadFarmers() {
    try {
        farmers = await window.electronAPI.getFarmers();
    } catch (error) {
        console.error('Error loading farmers:', error);
    }
}

// Handle entity type change
function onEntityTypeChange() {
    currentEntityType = document.getElementById('entityType').value;
    document.getElementById('entityTypeLabel').textContent =
        currentEntityType === 'customer' ? 'Customer' : 'Farmer';

    // Clear current selection
    clearEntitySelection();
}

// Setup entity search with autocomplete
function setupEntitySearch() {
    const searchInput = document.getElementById('entitySearch');
    const suggestionsDiv = document.getElementById('entitySuggestions');

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();

        if (query.length < 1) {
            suggestionsDiv.style.display = 'none';
            return;
        }

        searchTimeout = setTimeout(() => {
            const results = searchEntities(query);
            displayEntitySuggestions(results, query);
        }, 200);
    });

    searchInput.addEventListener('focus', () => {
        const query = searchInput.value.trim();
        if (query.length >= 1) {
            const results = searchEntities(query);
            displayEntitySuggestions(results, query);
        }
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#entitySearch') && !e.target.closest('#entitySuggestions')) {
            suggestionsDiv.style.display = 'none';
        }
    });
}

// Search entities locally
function searchEntities(query) {
    const entities = currentEntityType === 'customer' ? customers : farmers;
    const lowerQuery = query.toLowerCase();

    return entities.filter(entity =>
        entity.name.toLowerCase().includes(lowerQuery) ||
        (entity.phone && entity.phone.includes(query)) ||
        entity.id.toString() === query
    ).slice(0, 10);
}

// Display entity suggestions
function displayEntitySuggestions(results, query) {
    const suggestionsDiv = document.getElementById('entitySuggestions');

    if (results.length === 0) {
        suggestionsDiv.innerHTML = '<div class="suggestion-item no-results">No results found</div>';
        suggestionsDiv.style.display = 'block';
        return;
    }

    suggestionsDiv.innerHTML = results.map(entity => `
    <div class="suggestion-item" onclick="selectEntity(${entity.id})">
      <div class="suggestion-name">${entity.name}</div>
      <div class="suggestion-details">
        ${entity.phone || 'No phone'} | 
        Balance: <span class="${entity.balance < 0 ? 'text-danger' : entity.balance > 0 ? 'text-success' : ''}">
          Rs.${Math.abs(entity.balance || 0).toLocaleString()}
          ${entity.balance < 0 ? ' (Outstanding)' : entity.balance > 0 ? ' (Prepaid)' : ''}
        </span>
      </div>
    </div>
  `).join('');

    suggestionsDiv.style.display = 'block';
}

// Select entity from suggestions
function selectEntity(entityId) {
    const entities = currentEntityType === 'customer' ? customers : farmers;
    selectedEntity = entities.find(e => e.id === entityId);

    if (selectedEntity) {
        document.getElementById('entitySearch').value = selectedEntity.name;
        document.getElementById('entityId').value = selectedEntity.id;
        document.getElementById('entitySuggestions').style.display = 'none';

        // Show selected entity info
        document.getElementById('selectedEntityInfo').style.display = 'block';
        document.getElementById('selectedEntityName').textContent = selectedEntity.name;
        document.getElementById('selectedEntityPhone').textContent = selectedEntity.phone || '';

        const balanceEl = document.getElementById('selectedEntityBalance');
        const balance = selectedEntity.balance || 0;
        balanceEl.textContent = `Rs.${Math.abs(balance).toLocaleString()}`;
        balanceEl.className = balance < 0 ? 'text-danger' : balance > 0 ? 'text-success' : '';
        if (balance < 0) {
            balanceEl.textContent += ' (Outstanding)';
        } else if (balance > 0) {
            balanceEl.textContent += ' (Prepaid)';
        }
    }
}

// Clear entity selection
function clearEntitySelection() {
    selectedEntity = null;
    document.getElementById('entitySearch').value = '';
    document.getElementById('entityId').value = '';
    document.getElementById('selectedEntityInfo').style.display = 'none';
    document.getElementById('entitySuggestions').style.display = 'none';
}

// Save manual ledger entry
async function saveManualEntry() {
    const entityType = document.getElementById('entityType').value;
    const entityId = parseInt(document.getElementById('entityId').value);
    const entryType = document.getElementById('entryType').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value.trim();
    const entryDate = document.getElementById('entryDate').value;

    // Validation
    if (!entityId) {
        showAlert('Please select a ' + (entityType === 'customer' ? 'customer' : 'farmer'), 'error');
        return;
    }

    if (!amount || amount <= 0) {
        showAlert('Please enter a valid amount greater than 0', 'error');
        return;
    }

    if (!description) {
        showAlert('Please enter a reason/description for this entry', 'error');
        return;
    }

    if (!entryDate) {
        showAlert('Please select an entry date', 'error');
        return;
    }

    try {
        const entryId = await window.electronAPI.addLedgerEntry({
            entity_type: entityType,
            entity_id: entityId,
            entry_type: entryType,
            amount: amount,
            description: description,
            entry_date: entryDate
        });

        showAlert(`Manual ${entryType.toLowerCase()} entry saved successfully (ID: ${entryId})`, 'success');
        clearForm();
        await loadRecentEntries();

        // Refresh entity lists to get updated balances
        if (entityType === 'customer') {
            await loadCustomers();
        } else {
            await loadFarmers();
        }
    } catch (error) {
        console.error('Error saving entry:', error);
        showAlert('Error saving entry: ' + error.message, 'error');
    }
}

// Clear form
function clearForm() {
    clearEntitySelection();
    document.getElementById('amount').value = '';
    document.getElementById('description').value = '';
    document.getElementById('entryType').value = 'CREDIT';
    initializeDateField(); // Reset date to today
}

// Load recent manual entries
async function loadRecentEntries() {
    try {
        const entries = await window.electronAPI.getAllLedgerEntries({ limit: 50 });

        // Filter to show only manual entries
        const manualEntries = entries.filter(e => e.reference_type === 'manual');

        renderRecentEntries(manualEntries);
    } catch (error) {
        console.error('Error loading entries:', error);
        document.getElementById('recentEntriesTable').innerHTML =
            '<tr><td colspan="6" class="no-data">Error loading entries</td></tr>';
    }
}

// Render recent entries table
function renderRecentEntries(entries) {
    const tbody = document.getElementById('recentEntriesTable');

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="no-data">No manual entries yet</td></tr>';
        return;
    }

    tbody.innerHTML = entries.map(entry => {
        // Use entry_date if available, otherwise fall back to created_at
        const dateVal = entry.entry_date || entry.created_at;
        const date = new Date(dateVal).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });

        return `
      <tr>
        <td>${entry.id}</td>
        <td>${date}</td>
        <td>
          <span class="badge ${entry.entity_type === 'customer' ? 'badge-info' : 'badge-warning'}">
            ${entry.entity_type}
          </span>
          #${entry.entity_id}
        </td>
        <td>
          <span class="status-badge ${entry.entry_type === 'CREDIT' ? 'partial' : 'paid'}">
            ${entry.entry_type}
          </span>
        </td>
        <td>Rs.${entry.amount.toLocaleString()}</td>
        <td>${entry.description || '-'}</td>
      </tr>
    `;
    }).join('');
}

// Show alert message
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    const alertClass = type === 'error' ? 'alert-danger' :
        type === 'success' ? 'alert-success' : 'alert-info';

    alertContainer.innerHTML = `
    <div class="alert ${alertClass}" style="padding: 12px 20px; border-radius: 8px; margin-bottom: 20px;">
      ${message}
    </div>
  `;

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alertContainer.innerHTML = '';
    }, 5000);
}
