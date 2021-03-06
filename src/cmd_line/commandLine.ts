import * as parser from './parser';
import * as vscode from 'vscode';
import { CommandLineHistory } from '../history/historyFile';
import { Message } from '../util/message';
import { ModeName } from './../mode/mode';
import { StatusBar } from '../statusBar';
import { VimError, ErrorCode } from '../error';
import { VimState } from '../state/vimState';
import { configuration } from '../configuration/configuration';
import { logger } from '../util/logger';

class CommandLine {
  private _history: CommandLineHistory;

  /**
   *  Index used for navigating commandline history with <up> and <down>
   */
  private _commandLineHistoryIndex: number = 0;

  public get commandlineHistoryIndex(): number {
    return this._commandLineHistoryIndex;
  }

  public set commandlineHistoryIndex(index: number) {
    this._commandLineHistoryIndex = index;
  }

  public get historyEntries() {
    return this._history.get();
  }

  public previousMode = ModeName.Normal;

  constructor() {
    this._history = new CommandLineHistory();
  }

  public load(): Promise<void> {
    return this._history.load();
  }

  public async Run(command: string, vimState: VimState): Promise<void> {
    if (!command || command.length === 0) {
      return;
    }

    if (command && command[0] === ':') {
      command = command.slice(1);
    }

    this._history.add(command);
    this._commandLineHistoryIndex = this._history.get().length;

    try {
      const cmd = parser.parse(command);
      const useNeovim = configuration.enableNeovim && cmd.command && cmd.command.neovimCapable;

      if (useNeovim) {
        var statusBarText = await vimState.nvim.run(vimState, command);
        StatusBar.Set(statusBarText, vimState.currentMode, vimState.isRecordingMacro, true);
      } else {
        await cmd.execute(vimState.editor, vimState);
      }
    } catch (e) {
      if (e instanceof VimError) {
        if (e.code === ErrorCode.E492 && configuration.enableNeovim) {
          await vimState.nvim.run(vimState, command);
        } else {
          StatusBar.Set(
            `${e.toString()}. ${command}`,
            vimState.currentMode,
            vimState.isRecordingMacro,
            true
          );
        }
      } else {
        logger.error(`commandLine : error executing cmd=${command}. err=${e}.`);
        Message.ShowError(e.toString());
      }
    }
  }

  public async PromptAndRun(initialText: string, vimState: VimState): Promise<void> {
    if (!vscode.window.activeTextEditor) {
      logger.debug('commandLine : No active document');
      return;
    }
    let cmd = await vscode.window.showInputBox(this.getInputBoxOptions(initialText));
    await this.Run(cmd!, vimState);
  }

  private getInputBoxOptions(text: string): vscode.InputBoxOptions {
    return {
      prompt: 'Vim command line',
      value: text,
      ignoreFocusOut: false,
      valueSelection: [text.length, text.length],
    };
  }

  public async ShowHistory(initialText: string, vimState: VimState): Promise<string | undefined> {
    if (!vscode.window.activeTextEditor) {
      logger.debug('commandLine : No active document.');
      return '';
    }

    this._history.add(initialText);

    let cmd = await vscode.window.showQuickPick(
      this._history
        .get()
        .slice()
        .reverse(),
      {
        placeHolder: 'Vim command history',
        ignoreFocusOut: false,
      }
    );

    return cmd;
  }
}

export const commandLine = new CommandLine();
