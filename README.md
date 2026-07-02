# Global Menu for GNOME

Global Menu for GNOME brings a clean, streamlined desktop layout to your system by adding a dedicated application menu directly into the GNOME top panel. Inspired by the sleek aesthetic of macOS, this lightweight extension places essential window actions, navigation controls, and quick-access menu options into a single unified top-bar component. Built with modern Linux display architectures in mind, it runs 100% natively as a pure-JavaScript extension and is verified for GNOME 50 under Wayland environments.

## 🚀 Installation

### Method 1: Install via GNOME Extensions Website
Once approved by the review team, the easiest way to install the extension will be directly from the official web store:
👉 [Get it on GNOME Extensions](https://extensions.gnome.org/extension/10288/global-menu-for-gnome/)



### Method 2: Install from Source
To install the extension manually from source, open your terminal and run the following commands:


 Clone the repository to your local machine
`git clone https://github.com/ShiroOSL/global-menu-for-gnome.git`

 Navigate into the project directory
`cd global-menu-for-gnome`

 Run the installation script
`bash install.sh`


🔄 Apply Changes:

On Wayland: Log out of your desktop session and log back in.

On X11: Press Alt + F2, type r, and hit Enter to reload GNOME Shell.

Once your session is reloaded, enable `Global Menu for GNOME` using the Extensions app or Extension Manager.

# ❌ Uninstallation
If you ever need to remove the extension and clean up its configuration, use the included uninstall script:

```
# Navigate into the cloned project directory
cd global-menu-for-gnome

# Run the uninstallation script
bash uninstall.sh
