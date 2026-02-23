import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("TrackMyExts is now active!");

  // 1. Listen for any changes to extensions
  const disposableListener = vscode.extensions.onDidChange(() => {
    syncExtensionsToGit();
  });

  // 2. Allow manual triggering via command palette
  const disposableCommand = vscode.commands.registerCommand(
    "TrackMyExts.syncNow",
    () => {
      syncExtensionsToGit();
      vscode.window.showInformationMessage(
        "TrackMyExts: Manual sync triggered.",
      );
    },
  );

  context.subscriptions.push(disposableListener, disposableCommand);
}

// MAKE THIS ASYNC
async function syncExtensionsToGit() {
  const config = vscode.workspace.getConfiguration("TrackMyExts");
  let repoPath = config.get<string>("repoPath");

  // IF NO PATH IS SET, ASK THE USER
  if (!repoPath) {
    const userInput = await vscode.window.showInputBox({
      prompt:
        "TrackMyExts: Enter a GitHub URL or local path to sync extensions.",
      placeHolder:
        "e.g., https://github.com/yourname/repo.git or /Users/aditya/my-repo",
    });

    if (!userInput) {
      vscode.window.showWarningMessage(
        "TrackMyExts: Sync cancelled. No path provided.",
      );
      return;
    }
    repoPath = userInput;

    // Save it to settings so we don't ask again
    await config.update(
      "repoPath",
      repoPath,
      vscode.ConfigurationTarget.Global,
    );
  }

  // CALL THE HELPER FUNCTION TO CLONE OR VERIFY
  const validRepoPath = await ensureLocalRepo(repoPath);

  if (!validRepoPath || !fs.existsSync(validRepoPath)) {
    vscode.window.showWarningMessage(
      "TrackMyExts: Invalid path. Please set a valid Git repository path.",
    );
    return;
  }

  // Fetch all installed extensions (excluding built-in ones)
  const extensions = vscode.extensions.all
    .filter((ext) => !ext.packageJSON.isBuiltin)
    .map((ext) => ext.id)
    .sort();

  const data = {
    timestamp: new Date().toISOString(),
    total: extensions.length,
    extensions: extensions,
  };

  const filePath = path.join(validRepoPath, "extensions.json");

  try {
    // Write the JSON file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    // Execute Git commands synchronously
    execSync("git add extensions.json", { cwd: validRepoPath });

    // Check if there are actual changes to commit
    const status = execSync("git status --porcelain", {
      cwd: validRepoPath,
    }).toString();

    if (status.trim() !== "") {
      const commitMsg = `Update extensions: ${new Date().toLocaleString()}`;
      execSync(`git commit -m "${commitMsg}"`, { cwd: validRepoPath });
      execSync("git push", { cwd: validRepoPath });

      vscode.window.setStatusBarMessage("TrackMyExts: Synced to Git! 🚀", 5000);
    }
  } catch (error: any) {
    console.error("TrackMyExts Sync Error:", error);
    vscode.window.showErrorMessage(
      `TrackMyExts failed to sync: ${error.message}`,
    );
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

    if (!targetFolder) return null;

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

export function deactivate() {}
