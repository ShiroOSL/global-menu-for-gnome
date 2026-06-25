# Global Menu for GNOME

Global Menu for GNOME brings a clean, streamlined desktop layout to your system by seamlessly integrating active application menus directly into the GNOME top panel. This lightweight extension maximizes your vertical screen real estate, provides smooth native window navigation, and relies on an efficient backend architecture to deliver a highly polished, lag-free user experience. Built with modern Linux display architectures in mind, it has been fully tested and verified to run stably on GNOME 50 under Wayland environments.

## Installation

### Method 1: Install via GNOME Extensions Website
The easiest way to install the extension is directly from the official web store:
Get it on GNOME Extensions: https://extensions.gnome.org/extension/10288/global-menu-for-gnome/

### Method 2: Install from Source
To install the extension manually from source, open your terminal and run the following commands:

# Clone the repository to your local machine
git clone https://github.com/ShiroOSL/global-menu-for-gnome.git

# Navigate into the project directory
cd global-menu-for-gnome

# Make the installation script executable and run it
chmod +x install.sh
./install.sh

After running the script, log out and log back in (or restart GNOME Shell) and enable Global Menu for GNOME using the Extensions app or Extension Manager.

## Uninstallation

If you ever need to remove the extension, you can easily do so using the included uninstall script:

# Navigate into the cloned project directory
cd global-menu-for-gnome

# Make the uninstallation script executable and run it
chmod +x uninstall.sh
./uninstall.sh
