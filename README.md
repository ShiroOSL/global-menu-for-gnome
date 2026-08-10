# Global Menu for GNOME

> [!IMPORTANT]
> **Notice regarding v9 Settings Issue**
>
> If you are using **Version 9** from the GNOME Extensions website and the settings button is not working, please be aware that this is a known issue. **This happens because Version 9 does not have a preferences panel yet (the `prefs.js` file had not been created in that version).**
>
> **Versions 10 and 11 were rejected during review**, and I am currently waiting for **Version 12** (which includes the new preferences panel) to be approved. 
>
> **Please do not open new issues about this specific problem.** If you need the settings functionality immediately, please install the extension from the source code here on GitHub.

Global Menu for GNOME brings a clean, streamlined desktop layout to your system by adding a dedicated application menu directly into the GNOME top panel. Inspired by the sleek aesthetic of macOS, this extension places essential window actions, navigation controls, a System Menu, and quick-access options into a single unified top-bar component.

## 🚀 Installation

### Recommended: Install from GNOME Extensions

The easiest and safest way to install is directly from the official extensions website:

👉 [Get it on GNOME Extensions](https://extensions.gnome.org/extension/10288/global-menu-for-gnome/)

Just click **Install**, no terminal required. Updates are delivered automatically through the Extensions app.

### Alternative: Install from Source (for developers/contributors)

If you want to run a development build or contribute, you can install from source instead:

```bash
git clone https://github.com/ShiroOSL/global-menu-for-gnome.git
cd global-menu-for-gnome
bash install.sh
```

🔄 **Apply changes:**
- On Wayland: log out of your desktop session and log back in.
- On X11: press `Alt + F2`, type `r`, and hit Enter to reeload GNOME Shell.

Then enable **Global Menu for GNOME** using the Extensions app or Extension Manager.

## ❌ Uninstallation

If you installed from GNOME Extensions, just remove it from the Extensions app.

If you installed from source:

```bash
cd global-menu-for-gnome
bash uninstall.sh
```

## Features

- Global top-bar menu (App, File, Edit, View, Go, Window, Help) with per-menu toggles
- System Menu (Apple-menu-style button) with configurable icon, App Grid, Software Center, System Monitor, Terminal, Extensions, Force Quit, power options, and custom shell-command items
- Multiple independent custom top-level menus, each with shell-command or keyboard-shortcut items
- Bundled distro/Apple icon picker for the System Menu button
- Optional hiding of the Activities button

## License

GPL-3.0
