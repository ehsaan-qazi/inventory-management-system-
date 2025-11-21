# Fish Market Inventory Management System

A comprehensive desktop application built with Electron for managing fish market operations, including both customer sales and farmer purchases.

## Version 3.0 - New Features 🎉

### Major Enhancements
- **Farmer Management System**: Complete farmer account management with balance tracking
- **Farmer Transaction Processing**: Record fish purchases from farmers with commission and deduction tracking
- **Dual Report System**: Separate customer and farmer reports with comprehensive analytics
- **Enhanced Transaction Management**: Edit transactions directly from customer/farmer account views
- **Interactive Transaction History**: Click any transaction to view detailed receipts
- **Input Focus Reliability**: Fixed input field focus issues for smoother data entry

### Report System Improvements
- **Customer Reports Tab**: Track sales, cash received, outstanding balances
- **Farmer Reports Tab**: Monitor purchases, payments to farmers, amounts owed
- **CSV Export**: Export both customer and farmer reports for external analysis
- **Balance Tables**: Quick overview of outstanding customers and farmers

### User Experience Enhancements
- **Clickable Transactions**: View full receipts with one click from account details
- **Editable Transactions**: Update paid amounts and notes from customer/farmer views
- **Modal Stacking**: Seamless multi-level modal interactions
- **Improved Focus Management**: Reliable input field behavior across the application

## Features

### Customer Management
- Customer account creation and management
- Balance tracking (outstanding/prepaid)
- Transaction history with detailed receipts
- Search and filter capabilities
- Pagination for large customer lists

### Farmer Management
- Farmer account creation and management
- Track fish purchases from farmers
- Commission and deduction calculations
- Balance tracking (amounts we owe/farmer credits)
- Complete transaction history

### Transaction Processing
- **Customer Transactions**: Multi-item billing with weight-based pricing
- **Farmer Transactions**: Fish purchase recording with automatic calculations
  - Commission percentage tracking
  - Multiple deduction types (Munshi Nama, Baraf, Labour, Extra Charges)
  - Customer markup for resale pricing
- Real-time balance updates
- Receipt generation and printing
- Transaction editing capabilities

### Reporting & Analytics
- **Customer Reports**: Daily sales summaries, cash flow, outstanding tracking
- **Farmer Reports**: Purchase summaries, payments made, outstanding amounts
- Date range filtering
- Multiple quick filters (Today, This Week, This Month)
- CSV export functionality
- Visual metric cards for quick insights

### Technical Features
- SQLite database for reliable data storage
- Electron-based desktop application
- Single instance lock (prevents multiple app instances)
- Automatic database backups
- Portable across Windows PCs
- Professional receipt formatting

## Screenshots

### Dashboard
![Dashboard](.github/images/Dashboard.png)

### Customer Management
![Customer Management](.github/images/customers.png)

### Transaction/Billing
![Transactions](.github/images/transactions.png)

### Fish Categories
![Fish_Categories](.github/images/fishes.png)

### Reports
![Reports](.github/images/report.png)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Run the application:
```bash
npm start
```

## Building for Distribution

Create installer and portable executable:
```bash
npm run build:win
```

The built application will be in the `dist/` folder.

For detailed build instructions, see [build-instructions.md](build-instructions.md).

## Project Structure

```
Fish-Project/
├── main.js              # Electron main process
├── preload.js          # Electron preload script (IPC bridge)
├── package.json        # Dependencies and scripts
├── src/
│   ├── index.html      # Dashboard page
│   ├── pages/          # Other pages
│   ├── css/            # Stylesheets
│   ├── js/             # JavaScript modules
│   └── assets/         # Images and icons
└── database/           # SQLite database files
```

## Database Schema

- **customers**: Customer information and balance
- **farmers**: Farmer information and balance tracking
- **fish_categories**: Fish types and pricing
- **transactions**: Customer transaction headers
- **transaction_items**: Customer transaction line items
- **farmer_transactions**: Farmer purchase records with all deductions
- **daily_summary**: Daily sales summaries

## Usage

### Getting Started

1. **Add Customers**: Go to Customers page to add customer details
2. **Add Farmers**: Go to Farmers page to add farmer/supplier details
3. **Manage Fish**: Set up fish categories and prices in Fish Categories page
4. **Create Transactions**: 
   - Customer sales: Select customer, add fish items, calculate bill
   - Farmer purchases: Select farmer, record fish details, add deductions

### Customer Transactions

1. Navigate to Transactions page
2. Click "Customer Transaction" tab
3. Search and select customer
4. Add fish items with weight and pricing
5. Enter paid amount (partial payment supported)
6. Save transaction - receipt is automatically generated

### Farmer Transactions

1. Navigate to Transactions page
2. Click "Farmer Transaction" tab
3. Search and select farmer
4. Select or add new fish type
5. Enter weight and farmer's price per maund
6. Set customer markup percentage (for resale)
7. Add deductions:
   - Commission percentage (required)
   - Munshi Nama, Baraf Price, Labour Charges, Extra Charges (optional)
8. Enter amount paid to farmer
9. Save transaction

### Viewing and Editing Transactions

- **From Transaction History**: Edit or view any transaction
- **From Customer/Farmer Accounts**: 
  - Click any transaction row to view full receipt
  - Click edit button to modify paid amount and notes
  - Changes automatically update balances

### Dashboard Navigation

Click on any metric card to navigate to the relevant page:
- **Today's Sales** → Reports page
- **Pending Bills** → Customers with outstanding balances
- **Total Customers** → All customers
- **Fish Categories** → Fish management

### Reports

**Customer Reports**:
- View sales summaries by date range
- Track cash received and outstanding amounts
- Export to CSV for accounting
- See all customers with outstanding or prepaid balances

**Farmer Reports**:
- View purchase summaries by date range
- Track payments made to farmers
- Monitor outstanding amounts owed to farmers
- Export to CSV for record keeping

### Balance Tracking

The system automatically tracks:
- **Customer Balances**: Negative = outstanding debt, Positive = prepaid credit
- **Farmer Balances**: Negative = we owe farmer, Positive = farmer has credit
- All balances update in real-time with each transaction
- Historical balance tracking maintained

## What's New in Version 3.0

### For Businesses Dealing with Farmers
- Complete farmer management system
- Track all fish purchases from suppliers
- Automatic commission and deduction calculations
- Separate farmer reports and analytics

### Enhanced Usability
- Edit transactions without deleting and recreating
- View receipts instantly by clicking transactions
- Improved input field reliability
- Better modal interactions

### Better Reporting
- Dual report system (customers and farmers)
- More detailed analytics
- CSV export for both report types
- Visual balance tracking tables

## License

APACHE 2.0

