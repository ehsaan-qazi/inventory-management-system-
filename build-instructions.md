# Build Instructions for Fish Market Inventory System

## Prerequisites

1. Node.js and npm installed
2. All dependencies installed (`npm install`)
3. Application tested and working (`npm start`)

## Building the Application

### For Windows Installer and Portable Executable

Run the following command:

```bash
npm run build:win
```

This will create:
- **NSIS Installer** (.exe) - Full installer with installation wizard
- **Portable Executable** (.exe) - Standalone application that doesn't require installation

### Build Output

The built applications will be located in the `dist/` folder:
- `Fish Market Inventory Setup X.X.X.exe` - Installer
- `Fish Market Inventory X.X.X.exe` - Portable version

## Distribution

### Installer Version
- Users can install the application like any standard Windows software
- Installation location can be customized
- Creates desktop shortcuts and start menu entries
- Includes uninstaller

### Portable Version
- No installation required
- Can be run from any location (USB drive, network folder, etc.)
- Database file is created in the same directory
- Perfect for distributing to multiple PCs

## Database Location

The SQLite database file (`fishmarket.db`) is created in:
- **Installed version**: `<installation-directory>/database/`
- **Portable version**: `./database/` (relative to the executable)

## Transferring to Other PCs

1. **Using Installer**: 
   - Copy the installer .exe to target PC
   - Run the installer
   - Application will be installed with all dependencies

2. **Using Portable**:
   - Copy the portable .exe to target PC
   - Run directly - no installation needed
   - Database will be created on first run

3. **Transferring with existing data**:
   - Copy the entire application folder including the `database/` directory
   - All customer data, fish categories, and transactions will be preserved

## Backup

The application includes a backup feature accessible through the database operations. Regular backups are recommended and can be found in the `database/` folder with timestamps.

## System Requirements

- Windows 7 or later
- 100 MB free disk space
- No internet connection required (fully offline)

## Troubleshooting Build Issues

If build fails:

1. **Clean and rebuild**:
   ```bash
   rm -rf dist node_modules
   npm install
   npm run build:win
   ```

2. **Rebuild native modules**:
   ```bash
   npm run postinstall
   ```

3. **Check Node.js version**: Ensure you're using Node.js 16+ 

## Notes

- The first build may take several minutes as it downloads build dependencies
- Subsequent builds will be faster
- The application is self-contained and includes all necessary dependencies
- No additional software needs to be installed on target PCs

