const vscode = require('vscode');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('debugDataframeViewer.open', () => openDataframe(false)),
    vscode.commands.registerCommand('debugDataframeViewer.openNew', () => openDataframe(true))
  );
}

async function openDataframe(moveToNewWindow) {
  const editor = vscode.window.activeTextEditor;
  const session = vscode.debug.activeDebugSession;

  if (!editor || editor.document.languageId !== 'python') {
    vscode.window.showWarningMessage('Open a Python file and place the cursor on a dataframe variable.');
    return;
  }
  if (!session) {
    vscode.window.showWarningMessage('Pause a Python debug session before opening a dataframe.');
    return;
  }

  const position = editor.selection.active;
  const range = editor.document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
  const name = range ? editor.document.getText(range) : undefined;
  if (!name) {
    vscode.window.showWarningMessage('Place the cursor on a dataframe variable first.');
    return;
  }

  const frameId = await findFrameId(session);
  if (frameId === undefined) {
    vscode.window.showWarningMessage('No paused Python stack frame is available.');
    return;
  }

  const maxRows = vscode.workspace.getConfiguration('debugDataframeViewer')
    .get('maxRows', 500);

  try {
    const nativeVariable = await findDebugVariable(session, name, frameId);
    if (nativeVariable && await tryOpenNativeViewer(nativeVariable)) {
      if (moveToNewWindow) {
        const viewerIsActive = await waitForNativeViewer(name);
        if (!viewerIsActive) {
          throw new Error('Data Wrangler did not activate its viewer tab, so your code was not moved. Try again once the Data Viewer tab is visible.');
        }
        // Put the Data Wrangler editor in its own group first. VS Code can
        // otherwise detach every selected tab from the source editor group.
        await vscode.commands.executeCommand('workbench.action.moveEditorToNextGroup');
        await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
      }
      return;
    }

    if (moveToNewWindow) {
      throw new Error('The native Jupyter Data Viewer is unavailable for this variable.');
    }

    const data = await evaluateDataframe(session, name, frameId, maxRows);
    await showViewer(name, data);
  } catch (error) {
    vscode.window.showErrorMessage(`Could not open ${name}: ${error.message || error}`);
  }
}

function isNativeViewerTab(tab, name) {
  const label = String(tab?.label || '').toLowerCase();
  return label.startsWith(name.toLowerCase()) && label.includes('[dw]');
}

async function waitForNativeViewer(name) {
  const activeViewer = () => isNativeViewerTab(vscode.window.tabGroups.activeTabGroup.activeTab, name);
  if (activeViewer()) return true;

  return new Promise(resolve => {
    const subscription = vscode.window.tabGroups.onDidChangeTabs(() => {
      if (activeViewer()) {
        clearTimeout(timeout);
        subscription.dispose();
        resolve(true);
      }
    });
    const timeout = setTimeout(() => {
      subscription.dispose();
      resolve(activeViewer());
    }, 2000);
  });
}

async function findDebugVariable(session, name, frameId) {
  const scopes = await session.customRequest('scopes', { frameId });
  for (const scope of scopes.scopes || []) {
    if (!scope.variablesReference) continue;
    const result = await session.customRequest('variables', {
      variablesReference: scope.variablesReference,
      start: 0,
      count: 1000
    });
    const variable = (result.variables || []).find(item => item.name === name);
    if (variable) return { ...variable, frameId, evaluateName: variable.evaluateName || name };
  }
  return undefined;
}

async function tryOpenNativeViewer(variable) {
  try {
    const jupyter = vscode.extensions.getExtension('ms-toolsai.jupyter');
    if (!jupyter) return false;
    await vscode.commands.executeCommand('jupyter.showDataViewer', { variable });
    return true;
  } catch {
    return false;
  }
}

async function findFrameId(session) {
  const threads = await session.customRequest('threads').catch(() => undefined);
  const thread = threads && threads.threads && threads.threads[0];
  if (!thread) throw new Error('No debug thread is available.');

  const stack = await session.customRequest('stackTrace', {
    threadId: thread.id,
    startFrame: 0,
    levels: 1
  }).catch(() => undefined);

  if (stack && stack.stackFrames && stack.stackFrames[0]) {
    return stack.stackFrames[0].id;
  }

  // debugpy usually exposes the current frame through the stopped thread.
  // If the adapter rejects stackTrace with thread 1, ask the user to select
  // the active frame in the Call Stack and retry; this avoids evaluating in
  // an unrelated frame.
  throw new Error('Unable to identify the current debug frame. Select a frame in Call Stack and retry.');
}

async function evaluate(session, expression, frameId) {
  const result = await session.customRequest('evaluate', {
    expression,
    frameId,
    context: 'repl'
  });
  return result && result.result;
}

async function evaluateDataframe(session, name, frameId, maxRows) {
  const typeResult = await evaluate(session,
    `__import__('base64').b64encode((type(${name}).__module__ + "." + type(${name}).__name__).encode()).decode()`, frameId);
  const type = decodeBase64String(typeResult);
  if (!type) throw new Error(`Variable ${name} was not found.`);

  const moduleName = String(type);
  if (!moduleName.includes('pandas') && !moduleName.includes('polars')) {
    throw new Error(`${name} is ${moduleName}, not a supported pandas or Polars dataframe.`);
  }

  const columns = await evaluateEncodedJson(session,
    `__import__('json').dumps([str(c) for c in ${name}.columns])`, frameId);
  const rows = [];
  const chunkSize = 25;
  for (let start = 0; start < maxRows; start += chunkSize) {
    const end = start + chunkSize;
    const expression = moduleName.includes('pandas')
      ? `__import__('json').dumps(${name}.iloc[${start}:${end}].to_json(orient='values', date_format='iso'))`
      : `__import__('json').dumps(${name}[${start}:${end}].to_dicts(), default=str)`;
    const chunk = await evaluateEncodedJson(session, expression, frameId);
    const values = moduleName.includes('pandas') ? JSON.parse(chunk) : chunk;
    if (!Array.isArray(values) || values.length === 0) break;
    rows.push(...values);
    if (values.length < chunkSize) break;
  }
  return { columns, data: rows };
}

async function evaluateEncodedJson(session, expression, frameId) {
  const encoded = await evaluate(session,
    `__import__('base64').b64encode((${expression}).encode()).decode()`, frameId);
  const decoded = decodeBase64String(encoded);
  try {
    return JSON.parse(decoded);
  } catch {
    throw new Error('The debugger returned truncated data. Try lowering maxRows or narrowing the dataframe.');
  }
}

function decodeString(value) {
  if (typeof value !== 'string') return String(value || '');
  try {
    const decoded = JSON.parse(value);
    return typeof decoded === 'string' ? decoded : value;
  } catch {
    return value.replace(/^['"]|['"]$/g, '');
  }
}

function decodeBase64String(value) {
  const encoded = decodeString(value);
  try {
    return Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return encoded;
  }
}

function decodeBase64Json(value) {
  try {
    return JSON.parse(decodeBase64String(value));
  } catch {
    return undefined;
  }
}

async function showViewer(name, data) {
  const panel = vscode.window.createWebviewPanel(
    'debugDataframeViewer',
    `${name} — Data Viewer`,
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );
  panel.webview.html = renderHtml(name, data);
}

function renderHtml(name, data) {
  const payload = JSON.stringify({ name, ...data })
    .replace(/</g, '\\u003c');
  return `<!doctype html>
<html><head><meta charset="UTF-8"><style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:12px}
.toolbar{display:flex;gap:12px;align-items:center;margin-bottom:10px}.toolbar input{flex:1;padding:6px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border)}
.meta{opacity:.75;font-size:12px}table{border-collapse:collapse;width:max-content;min-width:100%}th,td{border:1px solid var(--vscode-panel-border);padding:5px 8px;white-space:pre;max-width:500px;overflow:hidden;text-overflow:ellipsis}th{position:sticky;top:0;background:var(--vscode-editorGroupHeader-tabsBackground);text-align:left}
tr:nth-child(even){background:color-mix(in srgb,var(--vscode-editor-background),var(--vscode-foreground) 4%)}
</style></head><body><div class="toolbar"><strong id="title"></strong><input id="filter" placeholder="Filter rows..."><span class="meta" id="meta"></span></div><div style="overflow:auto;max-height:calc(100vh - 70px)"><table><thead><tr id="head"></tr></thead><tbody id="body"></tbody></table></div>
<script>
const value=${payload}; const title=document.getElementById('title'), meta=document.getElementById('meta'), head=document.getElementById('head'), body=document.getElementById('body'), filter=document.getElementById('filter');
title.textContent=value.name; value.columns.forEach(c=>{const th=document.createElement('th');th.textContent=c;head.appendChild(th)});
function draw(){const q=filter.value.toLowerCase();body.textContent='';let shown=0;value.data.forEach(row=>{if(q&&!row.some(v=>String(v??'').toLowerCase().includes(q)))return;const tr=document.createElement('tr');row.forEach(v=>{const td=document.createElement('td');td.textContent=String(v??'');td.title=td.textContent;tr.appendChild(td)});body.appendChild(tr);shown++});meta.textContent=shown+' of '+value.data.length+' loaded rows';}
filter.addEventListener('input',draw);draw();
</script></body></html>`;
}

function deactivate() {}

module.exports = { activate, deactivate };
