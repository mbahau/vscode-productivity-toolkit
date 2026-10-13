# VS Code Productivity Toolkit

A collection of practical Visual Studio Code extensions for debugging, data analysis, and developer productivity.

## Extensions

| Extension | Description | Status |
|---|---|---|
| DataFrame Viewer | Open pandas and Polars dataframes directly from the editor while debugging. Supports the native Data Viewer and moving it into a new VS Code window. | In development |
| Debug Tools | Helpful commands and shortcuts for debugging workflows. | Planned |
| CSV Tools | Tools for inspecting and working with CSV files. | Planned |

## DataFrame Viewer

While paused in a Python debug session:

1. Place the cursor on a pandas or Polars dataframe.
2. Right-click the variable.
3. Select **Open in Data Viewer**.
4. Or select **Open in Data Viewer — New Window**.

The extension is designed for Python debugging in local and WSL environments.

## Installation

Download the latest `.vsix` file from the extension releases page.

In VS Code:

1. Open the Extensions view.
2. Select the `...` menu.
3. Choose **Install from VSIX**.
4. Select the downloaded file.

## Development

Open the required extension folder in VS Code:

```bash
code extensions/dataframe-viewer
```

Press `F5` to launch the Extension Development Host.

## Packaging

From an extension folder:

```bash
npx @vscode/vsce package
```

This creates a `.vsix` file that can be installed manually in VS Code.

## Contributing

Issues and pull requests are welcome. Please include reproduction steps, VS Code version, operating system, and extension version when reporting a problem.

## License

MIT License
