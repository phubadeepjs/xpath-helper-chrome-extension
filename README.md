# 🎯 XPath Helper - Chrome Extension

A powerful Chrome extension for finding and testing XPath queries on web pages.

## 📦 Installation

1. Download or clone this repository
2. Icons are already included in the `icons/` folder
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" in the top right corner
5. Click "Load unpacked" and select the project folder
6. The extension is now ready to use!

## 🚀 Usage

### Opening/Closing the Panel

- **Click** the extension icon in the toolbar, or
- Press `Ctrl+Shift+X` (Mac: `Cmd+Shift+X`)
- Press `Esc` to close the panel
- Drag the header to reposition the panel

### Searching with XPath (Auto Search)

1. Type your XPath query in the "XPath Query" field
2. **Automatic search** triggers after 0.5 seconds
3. View real-time results below
4. **Text content** from matched elements appears in green boxes
5. Matched elements are highlighted on the page with blue outline
6. Click any result item to scroll to that element

### Element Picker

1. Click the 🖱️ button in the panel header
2. Hover over elements (they'll highlight in blue)
3. Click an element to generate its XPath
4. The XPath is automatically inserted and evaluated
5. Press `Esc` to stop picking, or `Esc` again to close the panel

## 🛠️ Technologies Used

- **Manifest V3**: Latest Chrome Extension API
- **Vanilla JavaScript**: No framework dependencies
- **CSS3**: Modern styling with dark mode design
- **DOM XPath API**: Native XPath query processing

## ⌨️ Keyboard Shortcuts

| Shortcut                            | Action                    |
| ----------------------------------- | ------------------------- |
| `Ctrl+Shift+X` (Mac: `Cmd+Shift+X`) | Toggle panel              |
| `Esc`                               | Stop picker / Close panel |
