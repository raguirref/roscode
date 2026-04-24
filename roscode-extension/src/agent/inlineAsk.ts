import * as vscode from "vscode";
import Anthropic from "@anthropic-ai/sdk";
import type { RosConnection } from "../ros/connection";

/**
 * Cursor-style ⌘K inline agent. Takes the current selection (or word),
 * asks Claude a contextual question, and replaces/appends the result
 * inline. Short, fast, no webview.
 */
export async function inlineAsk(
  _context: vscode.ExtensionContext,
  ros: RosConnection
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("Open a file first to use inline agent.");
    return;
  }

  const question = await vscode.window.showInputBox({
    placeHolder: "Ask roscode…",
    prompt: "Inline agent — edits will be applied to the current selection",
    ignoreFocusOut: true,
  });
  if (!question) return;

  const apiKey =
    vscode.workspace.getConfiguration("roscode").get<string>("anthropicApiKey") ||
    process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    vscode.window.showErrorMessage(
      "Set your Anthropic API key in roscode settings first."
    );
    return;
  }

  const client = new Anthropic({ apiKey });
  const model = vscode.workspace.getConfiguration("roscode").get<string>("model", "claude-opus-4-7");
  const doc = editor.document;
  const lang = doc.languageId;
  const selection = editor.selection;
  const selText = doc.getText(selection);
  const fileContext = doc.getText().slice(0, 4000);

  const rosCtx = ros.robot
    ? `\nROS connection: ${ros.robot.hostname} (${ros.robot.rosVersion.toUpperCase()})`
    : "\nROS: not connected";

  const system = `You are roscode's inline coding agent inside roscode studio.
You output ONLY code that will be inserted/replaced verbatim. No prose, no markdown fences, no explanation.
Match the existing code style (indentation, naming). Language: ${lang}.${rosCtx}`;

  const userPrompt = selText
    ? `File context (first 4KB):\n\`\`\`${lang}\n${fileContext}\n\`\`\`\n\nSelected code (replace this):\n\`\`\`${lang}\n${selText}\n\`\`\`\n\nTask: ${question}`
    : `File context (first 4KB):\n\`\`\`${lang}\n${fileContext}\n\`\`\`\n\nAt current cursor, task: ${question}\nOutput only the code to insert.`;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "roscode inline…", cancellable: false },
    async () => {
      try {
        const res = await client.messages.create({
          model,
          max_tokens: 1500,
          system,
          messages: [{ role: "user", content: userPrompt }],
        });
        const firstText = res.content.find((b) => b.type === "text");
        if (!firstText || firstText.type !== "text") return;
        let out = firstText.text.trim();
        out = out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "");

        await editor.edit((eb) => {
          if (selection.isEmpty) eb.insert(selection.active, out);
          else eb.replace(selection, out);
        });
      } catch (e: any) {
        vscode.window.showErrorMessage(`Inline agent failed: ${e.message ?? e}`);
      }
    }
  );
}
