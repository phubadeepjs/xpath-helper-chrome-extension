// Toggle panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Check if we can access the tab
    if (!tab.id || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      console.log('Cannot access this page');
      return;
    }

    // Try to send message to content script
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
    } catch (error) {
      // Content script might not be loaded yet, try to inject it
      console.log('Content script not loaded, injecting...');
      
      try {
        // Inject CSS
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css']
        });
        
        // Inject JS
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        
        // Wait a bit for script to load
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
          } catch (e) {
            console.error('Failed to send message after injection:', e);
          }
        }, 100);
      } catch (injectionError) {
        console.error('Failed to inject content script:', injectionError);
      }
    }
  } catch (error) {
    console.error('Error in action click handler:', error);
  }
});

