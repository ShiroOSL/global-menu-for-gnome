import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { MenuManager } from './menuManager.js';

export default class GlobalMenuExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._menuManager = null;
    }

    enable() {
        console.log(`[globalmenu@ShiroOSL.github.io] Enabling extension.`);
        // Pass the extension instance context down to the manager
        this._menuManager = new MenuManager(this);
    }

    disable() {
        console.log(`[globalmenu@ShiroOSL.github.io] Disabling extension.`);
        if (this._menuManager) {
            this._menuManager.destroy();
            this._menuManager = null;
        }
    }
}
