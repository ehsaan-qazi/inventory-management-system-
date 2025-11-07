# Fish Market Inventory Management System

A desktop application built with Electron for managing fish market inventory, customers, and transactions.

## Features

- Customer account management with balance tracking (outstanding/prepaid)
- Fish category management with pricing
- Transaction/billing system with multi-item support
- Daily sales reports and summaries
- SQLite database for reliable data storage
- Portable across Windows PCs

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
- **fish_categories**: Fish types and pricing
- **transactions**: Transaction headers
- **transaction_items**: Transaction line items
- **daily_summary**: Daily sales summaries

## Usage

1. **Add Customers**: Go to Customers page to add customer details
2. **Manage Fish**: Set up fish categories and prices
3. **Create Transaction**: Select customer, add fish items, calculate bill
4. **Track Balances**: System automatically tracks outstanding/prepaid amounts
5. **View Reports**: Check daily summaries and sales reports

## License

MIT

