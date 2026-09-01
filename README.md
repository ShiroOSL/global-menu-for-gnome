<p align="center">
  <img src="icon.png" width="96" alt="Global Menu for GNOME icon">
</p>

<h1 align="center">Global Menu for GNOME</h1>

<p align="center">
  A clean macOS-style global menu bar for your GNOME top panel :3
</p>

<p align="center">
  <a href="https://ko-fi.com/shiro_osl">
    <img src="kofi-button.png" height="36" alt="Support me on Ko-fi">
  </a>
</p>

---

## What is this?

Global Menu for GNOME brings a streamlined, macOS-inspired layout to your
desktop by adding a dedicated application menu straight into the GNOME top
panel — window actions, navigation controls, a System Menu, and quick-access
options, all folded into one clean top-bar component instead of scattered
across app headerbars.

## Features

- Global top-bar menu (App, File, Edit, View, Go, Window, Help) with per-menu toggles
- System Menu (Apple-menu-style button) with configurable icon, App Grid, Software Center, System Monitor, Terminal, Extensions, Force Quit, power options, and custom shell-command items
- Multiple independent custom top-level menus, each with shell-command or keyboard-shortcut items
- Bundled distro/Apple icon picker for the System Menu button
- Optional hiding of the Activities button

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
- On X11: press `Alt + F2`, type `r`, and hit Enter to reload GNOME Shell.

Then enable **Global Menu for GNOME** using the Extensions app or Extension Manager.

## ❌ Uninstallation

If you installed from GNOME Extensions, just remove it from the Extensions app.

If you installed from source:

```bash
cd global-menu-for-gnome
bash uninstall.sh
```

## Support

If Global Menu made your desktop a little nicer, consider buying me a
coffee on [Ko-fi](https://ko-fi.com/shiro_osl) — it genuinely helps keep
this going.

## License

GPL-3.0
