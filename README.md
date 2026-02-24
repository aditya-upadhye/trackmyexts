# TrackMyExts

> **Git version control for your VS Code extensions!**

TrackMyExts automatically tracks your installed VS Code extensions in a Git repository, so you can sync, restore, and share your extension setup across devices or with your team.

---

## Features

- **Automatic Sync:**
  - Every time you install or uninstall an extension, your extension list is saved to a Git repo (`extensions.json`).
  - A backup sync runs every 60 seconds as a failsafe.
- **Manual Sync:**
  - Run the command: `TrackMyExts: Force Sync Now` to instantly save your current extension state.
- **Restore Extensions:**
  - Use `TrackMyExts: Restore Extensions from History` to roll back to any previous extension snapshot from your Git history.
- **Smart Commit Messages:**
  - Commit messages show which extensions were added or removed for easy tracking.

---

## Getting Started

1. **Install TrackMyExts** from the VS Code Marketplace or manually from this repo.
2. **Configure the Git Repository:**
   - On first use, you’ll be prompted to enter a GitHub repo URL or a local folder path where your extension history will be stored.
   - If you enter a GitHub URL, you’ll be asked to select a local folder to clone into.
3. **Start Using VS Code as Usual:**
   - Extension changes are tracked automatically!

---

## Commands

Open the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`) and search for:

- `TrackMyExts: Force Sync Now` — Manually sync your extensions to Git.
- `TrackMyExts: Restore Extensions from History` — Restore your extensions to a previous snapshot.

---

## How It Works

1. **Syncing:**
   - On extension change or manual sync, your non-builtin extensions are saved to `extensions.json` in your chosen Git repo.
   - The file is committed and pushed automatically.
2. **Restoring:**
   - Pick any previous commit from the Git history of `extensions.json`.
   - The extension list is compared to your current setup.
   - Missing extensions are installed, and extra ones are uninstalled (with confirmation).

---

## Configuration

- `TrackMyExts.repoPath`: Absolute path to the local Git repository where `extensions.json` will be saved. You can change this in your VS Code settings.

---

## Requirements

- **Git** must be installed and available in your system PATH.
- **VS Code CLI** (`code`) should be available in your PATH for silent install/uninstall (fallback to VS Code commands if not).

---

## Troubleshooting

- If you see sync errors, check that your repo path is correct and you have write access.
- For GitHub repos, ensure you have push access and authentication set up (SSH or HTTPS).

---

## License

MIT

---

## Author

Aditya Upadhye
