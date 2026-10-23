const item = (label, action, icon) => ({label, action, icon});
const disabled = (label, icon) => ({label, icon, enabled: false});
const header = label => ({type: 'section-header', label});
const separator = {type: 'separator'};

const submenu = (label, icon, children) => ({type: 'submenu', label, icon, children});

export function appMenuItems(focus, desktopName) {
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

export const builtinMenus = desktopName => [
    ['menu-file-enabled', fileMenu(desktopName)],
    ['menu-edit-enabled', EDIT_MENU],
    ['menu-view-enabled', VIEW_MENU],
    ['menu-go-enabled', GO_MENU],
    ['menu-window-enabled', WINDOW_MENU],
    ['menu-help-enabled', HELP_MENU],
];
