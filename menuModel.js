const item = (label, action, icon) => ({label, action, icon});
const key = (label, accelerator, icon) => item(label, `custom-shortcut:${accelerator}`, icon);
const disabled = (label, icon) => ({label, icon, enabled: false});
const header = label => ({type: 'section-header', label});
const separator = {type: 'separator'};

const submenu = (label, icon, children) => ({type: 'submenu', label, icon, children});

const filesAppMenu = desktopName => [
    disabled(`About ${desktopName}`, 'dialog-information-symbolic'),
    separator,
    key('Preferences...', '<Control>comma', 'preferences-system-symbolic'),
    item('Settings', 'open-settings', 'preferences-system-symbolic'),
    separator,
    item('Empty Bin...', 'empty-bin', 'user-trash-full-symbolic'),
    separator,
    key(`Quit ${desktopName}`, '<Control>q', 'application-exit-symbolic'),
];

export function appMenuItems(focus, desktopName, inFiles = false) {
    if (!focus && inFiles)
        return filesAppMenu(desktopName);

    if (!focus) {
        return [
            disabled(`About ${desktopName}`, 'dialog-information-symbolic'),
            separator,
            item(`Open ${desktopName}`, 'open-file-manager', 'folder-symbolic'),
            item('Settings', 'open-settings', 'preferences-system-symbolic'),
            separator,
            item('Empty Bin...', 'empty-bin', 'user-trash-full-symbolic'),
        ];
    }

    const items = [];
    const windows = focus.app?.get_windows() ?? [];
    if (windows.length > 0) {
        items.push(header('Open Windows'));
        for (const win of windows)
            items.push(item(win.get_title() || focus.name, `activate-window:${win.get_id()}`, 'window-symbolic'));
        items.push(separator);
    }

    items.push(
        item('New Window', 'new-app-window', 'window-new-symbolic'),
        separator,
        item('App Details', `app-details:${focus.desktopId}`, 'dialog-information-symbolic'),
        separator,
        item(`Quit ${focus.name}`, 'close', 'application-exit-symbolic'),
    );
    return items;
}

const fileMenu = desktopName => submenu('File', 'folder-symbolic', [
    item(`New ${desktopName} Window`, 'new-file-manager-win', 'window-new-symbolic'),
    item('New Folder', 'new-folder', 'folder-new-symbolic'),
    item('New Tab', 'new-tab', 'tab-new-symbolic'),
    item('Open', 'virtual-open', 'document-open-symbolic'),
    item('Open With', 'native-open-with', 'document-open-symbolic'),
    item('Print', 'print', 'document-print-symbolic'),
    separator,
    item('Get Info', 'properties', 'dialog-information-symbolic'),
    disabled('Compress', 'package-x-generic-symbolic'),
    disabled('Duplicate', 'edit-copy-symbolic'),
    separator,
    item('Move to Trash', 'delete-item', 'user-trash-symbolic'),
    separator,
    item('Close Window', 'close', 'window-close-symbolic'),
]);

const EDIT_MENU = submenu('Edit', 'document-edit-symbolic', [
    item('Undo', 'undo', 'edit-undo-symbolic'),
    item('Redo', 'redo', 'edit-redo-symbolic'),
    separator,
    item('Cut', 'cut', 'edit-cut-symbolic'),
    item('Copy', 'copy', 'edit-copy-symbolic'),
    item('Paste', 'paste', 'edit-paste-symbolic'),
    item('Delete', 'delete-item', 'edit-delete-symbolic'),
    item('Select All', 'select-all', 'edit-select-all-symbolic'),
]);

const VIEW_MENU = submenu('View', 'view-grid-symbolic', [
    disabled('as Icons', 'view-grid-symbolic'),
    disabled('as List', 'view-list-symbolic'),
    separator,
    item('Enter Full Screen', 'toggle-fullscreen', 'view-fullscreen-symbolic'),
]);

const GO_MENU = submenu('Go', 'compass-symbolic', [
    item('Back', 'go-back', 'go-previous-symbolic'),
    item('Forward', 'go-forward', 'go-next-symbolic'),
    separator,
    item('Recents', 'go-recents', 'document-open-recent-symbolic'),
    item('Documents', 'go-documents', 'folder-documents-symbolic'),
    item('Desktop', 'go-desktop', 'user-desktop-symbolic'),
    item('Downloads', 'go-downloads', 'folder-download-symbolic'),
    item('Home', 'go-home', 'go-home-symbolic'),
]);

const WINDOW_MENU = submenu('Window', 'preferences-system-windows-symbolic', [
    item('Minimize', 'minimize', 'window-minimize-symbolic'),
    item('Maximize', 'maximize', 'window-maximize-symbolic'),
    separator,
    item('Close', 'close', 'window-close-symbolic'),
]);

const HELP_MENU = submenu('Help', 'help-about-symbolic', [
    item('GNOME Help', 'open-system-help', 'help-browser-symbolic'),
]);

const FILES_FILE_MENU = submenu('File', 'folder-symbolic', [
    key('New Window', '<Control>n', 'window-new-symbolic'),
    key('New Tab', '<Control>t', 'tab-new-symbolic'),
    item('New Folder', 'new-folder', 'folder-new-symbolic'),
    separator,
    item('Open', 'virtual-open', 'document-open-symbolic'),
    key('Open in New Tab', '<Control>Return', 'tab-new-symbolic'),
    key('Open in New Window', '<Shift>Return', 'window-new-symbolic'),
    item('Open With', 'native-open-with', 'document-open-symbolic'),
    key('Open Item Location', '<Control><Alt>o', 'folder-open-symbolic'),
    key('Open in Terminal', '<Control>period', 'utilities-terminal-symbolic'),
    separator,
    key('Rename', 'F2', 'document-edit-symbolic'),
    item('Get Info', 'properties', 'dialog-information-symbolic'),
    key('Add Bookmark', '<Control>d', 'user-bookmarks-symbolic'),
    separator,
    key('Create Link to Copied Item', '<Control>m', 'insert-link-symbolic'),
    key('Create Link to Selected Item', '<Control><Shift>m', 'insert-link-symbolic'),
    separator,
    item('Move to Trash', 'delete-item', 'user-trash-symbolic'),
    key('Delete Permanently', '<Shift>Delete', 'edit-delete-symbolic'),
    separator,
    key('Close Tab or Window', '<Control>w', 'window-close-symbolic'),
]);

const FILES_EDIT_MENU = submenu('Edit', 'document-edit-symbolic', [
    item('Undo', 'undo', 'edit-undo-symbolic'),
    item('Redo', 'redo', 'edit-redo-symbolic'),
    separator,
    item('Cut', 'cut', 'edit-cut-symbolic'),
    item('Copy', 'copy', 'edit-copy-symbolic'),
    item('Paste', 'paste', 'edit-paste-symbolic'),
    separator,
    item('Select All', 'select-all', 'edit-select-all-symbolic'),
    key('Invert Selection', '<Control><Shift>i', 'edit-select-all-symbolic'),
    key('Select Items Matching...', '<Control>s', 'edit-select-all-symbolic'),
    separator,
    key('Search Current Folder', '<Control>f', 'edit-find-symbolic'),
    key('Search Everywhere', '<Control><Shift>f', 'system-search-symbolic'),
]);

const FILES_VIEW_MENU = submenu('View', 'view-grid-symbolic', [
    key('as Icons', '<Control>2', 'view-grid-symbolic'),
    key('as List', '<Control>1', 'view-list-symbolic'),
    separator,
    key('Zoom In', '<Control>plus', 'zoom-in-symbolic'),
    key('Zoom Out', '<Control>minus', 'zoom-out-symbolic'),
    key('Actual Size', '<Control>0', 'zoom-original-symbolic'),
    separator,
    key('Show Hidden Files', '<Control>h', 'view-reveal-symbolic'),
    key('Show Sidebar', 'F9', 'sidebar-show-symbolic'),
    key('Refresh', 'F5', 'view-refresh-symbolic'),
    separator,
    item('Enter Full Screen', 'toggle-fullscreen', 'view-fullscreen-symbolic'),
]);

const FILES_GO_MENU = submenu('Go', 'compass-symbolic', [
    item('Back', 'go-back', 'go-previous-symbolic'),
    item('Forward', 'go-forward', 'go-next-symbolic'),
    key('Enclosing Folder', '<Alt>Up', 'go-up-symbolic'),
    separator,
    key('Enter Location...', '<Control>l', 'folder-open-symbolic'),
    separator,
    item('Recents', 'go-recents', 'document-open-recent-symbolic'),
    item('Documents', 'go-documents', 'folder-documents-symbolic'),
    item('Desktop', 'go-desktop', 'user-desktop-symbolic'),
    item('Downloads', 'go-downloads', 'folder-download-symbolic'),
    key('Home', '<Alt>Home', 'go-home-symbolic'),
]);

const FILES_WINDOW_MENU = submenu('Window', 'preferences-system-windows-symbolic', [
    item('Minimize', 'minimize', 'window-minimize-symbolic'),
    item('Maximize', 'maximize', 'window-maximize-symbolic'),
    separator,
    key('Previous Tab', '<Control>Page_Up', 'go-previous-symbolic'),
    key('Next Tab', '<Control>Page_Down', 'go-next-symbolic'),
    key('Move Tab Left', '<Control><Shift>Page_Up', 'go-previous-symbolic'),
    key('Move Tab Right', '<Control><Shift>Page_Down', 'go-next-symbolic'),
    key('Reopen Closed Tab', '<Control><Shift>t', 'tab-new-symbolic'),
    separator,
    item('Close', 'close', 'window-close-symbolic'),
]);

const FILES_HELP_MENU = submenu('Help', 'help-about-symbolic', [
    key('Files Help', 'F1', 'help-browser-symbolic'),
    key('Keyboard Shortcuts', '<Control>question', 'input-keyboard-symbolic'),
    item('GNOME Help', 'open-system-help', 'help-browser-symbolic'),
]);

export const builtinMenus = (desktopName, inFiles = false) => (inFiles
    ? [
        ['menu-file-enabled', FILES_FILE_MENU],
        ['menu-edit-enabled', FILES_EDIT_MENU],
        ['menu-view-enabled', FILES_VIEW_MENU],
        ['menu-go-enabled', FILES_GO_MENU],
        ['menu-window-enabled', FILES_WINDOW_MENU],
        ['menu-help-enabled', FILES_HELP_MENU],
    ]
    : [
        ['menu-file-enabled', fileMenu(desktopName)],
        ['menu-edit-enabled', EDIT_MENU],
        ['menu-view-enabled', VIEW_MENU],
        ['menu-go-enabled', GO_MENU],
        ['menu-window-enabled', WINDOW_MENU],
        ['menu-help-enabled', HELP_MENU],
    ]);
