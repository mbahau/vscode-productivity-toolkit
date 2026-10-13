# Debug DataFrame Viewer

This local VS Code extension adds **Open in Data Viewer** to the Python editor context menu while debugging.

## Use

1. Install the extension into the WSL VS Code window.
2. Start a Python debug session and pause at a breakpoint.
3. Put the cursor on a pandas or Polars dataframe variable.
4. Right-click and choose **Open in Data Viewer**.

The first version loads up to `debugDataframeViewer.maxRows` rows (default 500) and provides client-side row filtering.
