import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { MenuManager } from './menuManager.js';

export default class GlobalMenuExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._menuManager = null;
        this._settings = null;
    }

    enable() {
        console.log(`[globalmenu@ShiroOSL.github.io] Enabling extension.`);
        
        // Pass the GNOME-mandated base schema ID string
        this._settings = this.getSettings('org.gnome.shell.extensions.globalmenu');
        
        // Pass the extension instance context down to the manager
        this._menuManager = new MenuManager(this);
    }

    disable() {
        console.log(`[globalmenu@ShiroOSL.github.io] Disabling extension.`);
        if (this._menuManager) {
            this._menuManager.destroy();
            this._menuManager = null;
        }
        
        if (this._settings) {
            this._settings = null;
        }
    }
}
