# 通过 CDP 在官方启动器（Electron/NGP）页面里点「开始游戏」
#
# 由 launcher_ui.rs 以 `-EncodedCommand` 方式执行，约定：
#   - 端口从环境变量 NSMMI_CDP_PORT 读取
#   - 点击成功时在 stdout 打印 CLICKED，其它情况把原因写到 stderr
#   - 退出码 0 表示脚本执行完毕（是否点中看 stdout）

$ErrorActionPreference = 'Stop'

$port = $env:NSMMI_CDP_PORT
if (-not $port) {
    Write-Error 'NSMMI_CDP_PORT not set'
    exit 2
}

# 1) 找到可调试页面
try {
    $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" -TimeoutSec 5
} catch {
    Write-Error ("cdp endpoint unreachable: " + $_.Exception.Message)
    exit 3
}

$page = $targets | Where-Object { $_.type -eq 'page' -and $_.webSocketDebuggerUrl } | Select-Object -First 1
if (-not $page) {
    $page = $targets | Where-Object { $_.webSocketDebuggerUrl } | Select-Object -First 1
}
if (-not $page) {
    Write-Error 'no debuggable page target'
    exit 4
}

# 2) 连上 WebSocket
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$token = [System.Threading.CancellationToken]::None

try {
    $connect = $ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $token)
    if (-not $connect.Wait(5000)) {
        Write-Error 'websocket connect timeout'
        exit 5
    }
} catch {
    Write-Error ("websocket connect failed: " + $_.Exception.Message)
    exit 5
}

function Send-CdpText([string]$text) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    $segment = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $bytes)
    $task = $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $token)
    if (-not $task.Wait(5000)) { throw 'websocket send timeout' }
}

function Receive-CdpText() {
    $buffer = New-Object byte[] 131072
    $segment = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $buffer)
    $builder = New-Object System.Text.StringBuilder
    while ($true) {
        $task = $ws.ReceiveAsync($segment, $token)
        if (-not $task.Wait(5000)) { throw 'websocket receive timeout' }
        $result = $task.Result
        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            return $builder.ToString()
        }
        [void]$builder.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count))
        if ($result.EndOfMessage) { break }
    }
    return $builder.ToString()
}

# 3) 在页面里找「开始游戏」并点击
$js = @'
(function () {
  var keys = ['\u5f00\u59cb\u6e38\u620f', '\u8fdb\u5165\u6e38\u620f', '\u542f\u52a8\u6e38\u620f', '\u5f00\u59cb'];
  var nodes = Array.prototype.slice.call(document.querySelectorAll('button,a,div,span'));
  for (var i = 0; i < keys.length; i++) {
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j];
      var text = (n.innerText || n.textContent || '').trim();
      if (!text || text.length > 16 || text.indexOf(keys[i]) < 0) continue;
      var rect = n.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      try { n.scrollIntoView({ block: 'center' }); } catch (e) {}
      try { n.click(); } catch (e) {}
      var types = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
      for (var k = 0; k < types.length; k++) {
        try {
          n.dispatchEvent(new MouseEvent(types[k], { bubbles: true, cancelable: true, view: window }));
        } catch (e) {}
      }
      return 'CLICKED:' + text;
    }
  }
  return 'NOTFOUND:' + document.title;
})()
'@

$request = @{
    id     = 1
    method = 'Runtime.evaluate'
    params = @{
        expression    = $js
        returnByValue = $true
        awaitPromise  = $false
    }
} | ConvertTo-Json -Depth 6 -Compress

Send-CdpText $request

$reply = ''
for ($attempt = 0; $attempt -lt 5; $attempt++) {
    $reply = Receive-CdpText
    if ($reply -match '"id":\s*1') { break }
}
if (-not $reply) {
    Write-Error 'no cdp reply'
    exit 6
}

if ($reply -match 'CLICKED') {
    Write-Output 'CLICKED'
    exit 0
}

if ($reply -match 'NOTFOUND') {
    Write-Error ('start button not found: ' + $reply)
    exit 7
}

Write-Error ('unexpected cdp reply: ' + $reply)
exit 8
