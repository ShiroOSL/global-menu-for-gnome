import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { MenuManager } from './menuManager.js';

export default class GlobalMenuExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._menuManager = null;
        this._settings = null;
        this._focusNotifyId = 0;
    }

    enable() {
        console.log(`[globalmenu@ShiroOSL.github.io] Enabling extension.`);
        
        this._settings = this.getSettings('org.gnome.shell.extensions.globalmenu');
        
        // Correctly pass the string UUID from metadata
        const uuid = this.metadata.uuid || 'globalmenu@ShiroOSL.github.io';
        this._menuManager = new MenuManager(uuid);

        // Track active window adjustments dynamically
        let initialWindow = global.display.get_focus_window();
        this._menuManager.updateMenuForWindow(initialWindow);

        this._focusNotifyId = global.display.connect('notify::focus-window', () => {
            let activeWindow = global.display.get_focus_window();
            this._menuManager.updateMenuForWindow(activeWindow);
        });
    }

    disable() {
        console.log(`[globalmenu@ShiroOSL.github.io] Disabling extension.`);
        
        if (this._focusNotifyId > 0) {
            global.display.disconnect(this._focusNotifyId);
            this._focusNotifyId = 0;
        }

        if (this._menuManager) {
            this._menuManager.destroy();
            this._menuManager = null;
        }
        
        if (this._settings) {
            this._settings = null;
        }
    }
}
