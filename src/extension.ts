import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

let isRestoring = false;

export function activate(context: vscode.ExtensionContext) {
  console.log("TrackMyExts is now active!");

  // 1. Immediate Sync on Event (Fixed: No nested interval)
  const disposableListener = vscode.extensions.onDidChange(() => {
    if (!isRestoring) {
      syncExtensionsToGit();
    }
  });

  // 2. Standalone Heartbeat (Runs once every 60s as a backup)
  const heartbeat = setInterval(() => {
    if (!isRestoring) {
      syncExtensionsToGit();
    }
  }, 60000);

  // 3. Register Commands
  const disposableSync = vscode.commands.registerCommand(
    "TrackMyExts.syncNow",
    async () => {
      await syncExtensionsToGit();
      vscode.window.showInformationMessage("TrackMyExts: Sync complete! 🚀");
    },
  );

  const disposableRestore = vscode.commands.registerCommand(
    "TrackMyExts.restore",
    async () => {
      await restoreExtensions();
    },
  );

  // Add all to subscriptions, including the heartbeat cleanup
  context.subscriptions.push(
    disposableListener,
    disposableSync,
    disposableRestore,
    { dispose: () => clearInterval(heartbeat) },
  );
}

// MAKE THIS ASYNC
async function syncExtensionsToGit() {
  const config = vscode.workspace.getConfiguration("TrackMyExts");
  let repoPath = config.get<string>("repoPath");

  if (!repoPath) {
    const userInput = await vscode.window.showInputBox({
      prompt:
        "TrackMyExts: Enter a GitHub URL or local path to sync extensions.",
      placeHolder: "e.g., https://github.com/yourname/repo.git",
    });

    if (!userInput) {
      vscode.window.showWarningMessage("TrackMyExts: Sync cancelled.");
      return;
    }
    repoPath = userInput;
    await config.update(
      "repoPath",
      repoPath,
      vscode.ConfigurationTarget.Global,
    );
  }

  const validRepoPath = await ensureLocalRepo(repoPath);

  if (!validRepoPath || !fs.existsSync(validRepoPath)) {
    vscode.window.showWarningMessage("TrackMyExts: Invalid path.");
    return;
  }

  const extensions = vscode.extensions.all
    .filter((ext) => !ext.packageJSON.isBuiltin)
    .map((ext) => ext.id)
    .sort();

  // FIXED: Removed timestamp so Git only detects actual changes!
  const data = {
    total: extensions.length,
    extensions: extensions,
  };

  const filePath = path.join(validRepoPath, "extensions.json");

  // --- SMART COMMIT LOGIC ---
  let commitMsg = `Update extensions: ${new Date().toLocaleString()}`;
  if (fs.existsSync(filePath)) {
    try {
      const oldDataRaw = fs.readFileSync(filePath, "utf8");
      const oldExtensions: string[] = JSON.parse(oldDataRaw).extensions;

      const added = extensions.filter((x) => !oldExtensions.includes(x));
      const removed = oldExtensions.filter((x) => !extensions.includes(x));

      if (added.length > 0 && removed.length > 0) {
        commitMsg = `Sync: +${added.length} added, -${removed.length} removed`;
        vscode.window.showInformationMessage(
          `TrackMyExts: ${added.length} extension(s) installed, ${removed.length} removed.`,
        );
        vscode.window.setStatusBarMessage(
          `TrackMyExts: ${added.length} added, ${removed.length} removed.`,
          5000,
        );
      } else if (added.length > 0) {
        commitMsg = `Installed: ${added.join(", ")}`;
        vscode.window.showInformationMessage(
          `TrackMyExts: Installed ${added.length} extension(s): ${added.join(", ")}`,
        );
        vscode.window.setStatusBarMessage(
          `TrackMyExts: Installed ${added.length} extension(s).`,
          5000,
        );
      } else if (removed.length > 0) {
        commitMsg = `Uninstalled: ${removed.join(", ")}`;
        vscode.window.showInformationMessage(
          `TrackMyExts: Uninstalled ${removed.length} extension(s): ${removed.join(", ")}`,
        );
        vscode.window.setStatusBarMessage(
          `TrackMyExts: Uninstalled ${removed.length} extension(s).`,
          5000,
        );
      }
    } catch (parseError) {
      // Keep default message if parsing fails
    }
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    execSync("git add extensions.json", { cwd: validRepoPath });

    const status = execSync("git status --porcelain", {
      cwd: validRepoPath,
    }).toString();

    if (status.trim() !== "") {
      execSync(`git commit -m "${commitMsg}"`, { cwd: validRepoPath });
      execSync("git push", { cwd: validRepoPath });
      vscode.window.setStatusBarMessage("TrackMyExts: Synced to Git! 🚀", 5000);
    }
  } catch (error: any) {
    console.error("TrackMyExts Sync Error:", error);
  }
}

async function ensureLocalRepo(repoPathOrUrl: string): Promise<string | null> {
  // Check if it's a URL
  if (repoPathOrUrl.startsWith("http") || repoPathOrUrl.startsWith("git@")) {
    const targetFolder = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select folder to clone the repo into",
    });

    if (!targetFolder) {
      return null;
    }

    const localPath = path.join(
      targetFolder[0].fsPath,
      "vscode-extension-history",
    );

    // Clone the repo if it doesn't exist locally
    if (!fs.existsSync(localPath)) {
      vscode.window.setStatusBarMessage(
        "TrackMyExts: Cloning repository... 📥",
        5000,
      );
      execSync(`git clone ${repoPathOrUrl} "${localPath}"`);
    }

    // UPDATE THE SETTING WITH THE NEW LOCAL PATH (Changed from 'exthistory')
    await vscode.workspace
      .getConfiguration("TrackMyExts")
      .update("repoPath", localPath, vscode.ConfigurationTarget.Global);

    return localPath;
  }

  return repoPathOrUrl;
}

async function restoreExtensions() {
  const config = vscode.workspace.getConfiguration("TrackMyExts");
  const repoPath = config.get<string>("repoPath");

  if (!repoPath || !fs.existsSync(repoPath)) {
    return;
  }

  try {
    // 1. Fetch Git history for extensions.json
    const log = execSync(
      'git log --pretty=format:"%h|%ad|%s" --date=iso-local extensions.json',
      { cwd: repoPath },
    ).toString();
    const lines = log.split("\n").filter((l) => l.trim() !== "");

    if (lines.length === 0) {
      vscode.window.showInformationMessage("No history found yet!");
      return;
    }

    const picks = lines.map((line) => {
      const [hash, dateTime, msg] = line.split("|");
      // Use regex to extract only date and time (YYYY-MM-DD HH:MM:SS)
      let dateTimeLabel = dateTime;
      const match =
        dateTime &&
        dateTime.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
      if (match) {
        dateTimeLabel = `${match[1]} ${match[2]}`;
      }
      return {
        label: `${dateTimeLabel}: ${msg}`,
        detail: hash,
      };
    });

    const selected = await vscode.window.showQuickPick(picks, {
      placeHolder: "Select a version to restore to",
    });
    if (!selected) {
      return;
    }

    // 2. Read the snapshot and current state
    const content = execSync(`git show ${selected.detail}:extensions.json`, {
      cwd: repoPath,
    }).toString();
    const snapshot = JSON.parse(content);
    const snapshotIds: string[] = snapshot.extensions;

    const currentIds = vscode.extensions.all
      .filter((e) => !e.packageJSON.isBuiltin)
      .map((e) => e.id.toLowerCase());

    // 3. Calculate Differences
    const toInstall = snapshotIds.filter(
      (id) => !currentIds.includes(id.toLowerCase()),
    );
    const toUninstall = currentIds.filter(
      (id) => !snapshotIds.map((s) => s.toLowerCase()).includes(id),
    );

    if (toInstall.length === 0 && toUninstall.length === 0) {
      vscode.window.showInformationMessage(
        "Your extensions already match this snapshot!",
      );
      return;
    }

    // 4. Confirmation Dialog
    const message = `Restore will: \n• Install: ${toInstall.length || 0} \n• Uninstall: ${toUninstall.length || 0}`;
    const confirm = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      "Proceed",
    );

    if (confirm === "Proceed") {
      isRestoring = true; // PAUSE AUTO-SYNC
      try {
        await applyChanges(toInstall, toUninstall);
        // Once done, take a fresh snapshot of the final restored state!
        await syncExtensionsToGit();
      } finally {
        isRestoring = false; // RESUME AUTO-SYNC
      }
    }
  } catch (err: any) {
    vscode.window.showErrorMessage("Restore failed: " + err.message);
  }
}

async function applyChanges(toInstall: string[], toUninstall: string[]) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Syncing Extensions...",
      cancellable: false,
    },
    async (progress) => {
      // Handle Uninstalls
      for (const id of toUninstall) {
        progress.report({ message: `Uninstalling ${id}...` });
        try {
          // Using CLI for silent uninstallation
          execSync(`code --uninstall-extension ${id}`);
        } catch (e) {
          // Fallback to command if CLI fails
          await vscode.commands.executeCommand(
            "workbench.extensions.uninstallExtension",
            id,
          );
        }
      }

      // Handle Installs
      for (const id of toInstall) {
        progress.report({ message: `Installing ${id}...` });
        try {
          // Using CLI for silent installation
          execSync(`code --install-extension ${id}`);
        } catch (e) {
          await vscode.commands.executeCommand(
            "workbench.extensions.installExtension",
            id,
          );
        }
      }

      vscode.window.showInformationMessage(
        "Sync Complete! Please reload VS Code to see changes.",
      );
    },
  );
}

export function deactivate() {}
