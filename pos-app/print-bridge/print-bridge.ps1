# POS Print Bridge — Windows PowerShell (no Node.js required)
# Double-click start-bridge.bat  OR  right-click → Run with PowerShell
# Listens on 127.0.0.1:39100 for the Print Station tab on this PC.

$ErrorActionPreference = "Stop"
$Port = if ($env:PRINT_BRIDGE_PORT) { [int]$env:PRINT_BRIDGE_PORT } else { 39100 }
$Prefix = "http://127.0.0.1:$Port/"

function Write-CorsHeaders([System.Net.HttpListenerResponse]$res) {
  $res.Headers.Add("Access-Control-Allow-Origin", "*")
  $res.Headers.Add("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
  $res.Headers.Add("Access-Control-Allow-Private-Network", "true")
}

function Send-Json(
  [System.Net.HttpListenerResponse]$res,
  [int]$status,
  $payload
) {
  $json = ($payload | ConvertTo-Json -Compress -Depth 6)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $res.StatusCode = $status
  $res.ContentType = "application/json; charset=utf-8"
  Write-CorsHeaders $res
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.OutputStream.Close()
}

function Send-TcpBytes([string]$hostName, [int]$printerPort, [byte[]]$data) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($hostName, $printerPort, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(8000, $false)
    if (-not $ok) { throw "Timeout connecting to ${hostName}:${printerPort}" }
    $client.EndConnect($iar)
    $stream = $client.GetStream()
    $stream.Write($data, 0, $data.Length)
    $stream.Flush()
  }
  finally {
    $client.Close()
  }
}

function Get-LanIps {
  try {
    return @(
      Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
        Select-Object -ExpandProperty IPAddress -Unique
    )
  }
  catch {
    return @()
  }
}

# Cache to prevent duplicate prints within 4 seconds
$RecentPrints = @{}

function Test-And-Claim-Print([string]$hostName, [int]$port, [int]$byteCount, [string]$dataBase64) {
  $sample = if ($dataBase64.Length -gt 120) { $dataBase64.Substring($dataBase64.Length - 120) } else { $dataBase64 }
  $key = "${hostName}:${port}:${byteCount}:${sample}"
  $now = [DateTime]::UtcNow

  # Clean expired entries (> 30s)
  $expiredKeys = @($RecentPrints.Keys | Where-Object { ($now - $RecentPrints[$_]).TotalSeconds -gt 30 })
  foreach ($k in $expiredKeys) { $RecentPrints.Remove($k) }

  if ($RecentPrints.ContainsKey($key)) {
    $elapsed = ($now - $RecentPrints[$key]).TotalSeconds
    if ($elapsed -lt 10) {
      return $false # Duplicate!
    }
  }
  $RecentPrints[$key] = $now
  return $true
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Prefix)

try {
  $listener.Start()
}
catch {
  Write-Host ""
  Write-Host "Failed to bind $Prefix"
  Write-Host $_.Exception.Message
  Write-Host "Is another print-bridge already running?"
  Write-Host ""
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "  POS Print Bridge is RUNNING"
Write-Host "  (PowerShell — no Node.js)"
Write-Host "========================================"
Write-Host "  Local:   http://127.0.0.1:$Port"
$ips = Get-LanIps
if ($ips.Count -eq 0) {
  Write-Host "  LAN IP:  (not found)"
}
else {
  foreach ($ip in $ips) {
    Write-Host "  LAN:     $ip  (printers use this network)"
  }
}
Write-Host ""
Write-Host "  1) Keep this window OPEN"
Write-Host "  2) On THIS PC open POS → /print-station"
Write-Host "  3) Silent print ON"
Write-Host "  4) Bridge URL = http://127.0.0.1:$Port"
Write-Host "  Printer IP goes under Network printers (not Bridge URL)."
Write-Host "========================================"
Write-Host ""
Write-Host "Press Ctrl+C to stop."
Write-Host ""

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      if ($req.HttpMethod -eq "OPTIONS") {
        $res.StatusCode = 204
        Write-CorsHeaders $res
        $res.Close()
        continue
      }

      $path = $req.Url.AbsolutePath.TrimEnd("/")
      if ([string]::IsNullOrEmpty($path)) { $path = "/" }

      if ($req.HttpMethod -eq "GET" -and ($path -eq "/health" -or $path -eq "health")) {
        Send-Json $res 200 @{
          ok      = $true
          service = "pos-print-bridge"
          port    = $Port
          engine  = "powershell"
          lanIps  = @($ips)
        }
        continue
      }

      if ($req.HttpMethod -eq "POST" -and ($path -eq "/ping-printer" -or $path -eq "ping-printer")) {
        $reader = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
        $raw = $reader.ReadToEnd()
        $reader.Close()
        $payload = $raw | ConvertFrom-Json
        $pingHost = [string]$payload.host
        $pingPort = if ($payload.port) { [int]$payload.port } else { 9100 }
        if ([string]::IsNullOrWhiteSpace($pingHost)) {
          Send-Json $res 400 @{ ok = $false; error = "host required" }
          continue
        }
        $pingStart = [DateTime]::UtcNow
        $pingClient = New-Object System.Net.Sockets.TcpClient
        try {
          $iar = $pingClient.BeginConnect($pingHost, $pingPort, $null, $null)
          $connected = $iar.AsyncWaitHandle.WaitOne(3000, $false)
          if (-not $connected) { throw "Timeout connecting to ${pingHost}:${pingPort}" }
          $pingClient.EndConnect($iar)
          $latencyMs = [int]([DateTime]::UtcNow - $pingStart).TotalMilliseconds
          Write-Host ("[print-bridge] ping {0}:{1} -> OK ({2}ms)" -f $pingHost, $pingPort, $latencyMs)
          Send-Json $res 200 @{ ok = $true; latencyMs = $latencyMs }
        }
        catch {
          $errMsg = $_.Exception.Message
          Write-Host ("[print-bridge] ping {0}:{1} -> FAIL: {2}" -f $pingHost, $pingPort, $errMsg)
          Send-Json $res 200 @{ ok = $false; error = $errMsg }
        }
        finally {
          $pingClient.Close()
        }
        continue
      }

      if ($req.HttpMethod -eq "POST" -and ($path -eq "/print" -or $path -eq "print")) {
        $reader = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
        $raw = $reader.ReadToEnd()
        $reader.Close()
        $payload = $raw | ConvertFrom-Json
        $hostName = [string]$payload.host
        $printerPort = if ($payload.port) { [int]$payload.port } else { 9100 }
        $dataBase64 = [string]$payload.dataBase64
        if ([string]::IsNullOrWhiteSpace($hostName) -or [string]::IsNullOrWhiteSpace($dataBase64)) {
          Send-Json $res 400 @{ ok = $false; error = "host and dataBase64 required" }
          continue
        }
        $data = [Convert]::FromBase64String($dataBase64)
        $printerName = if ($payload.printerName) { [string]$payload.printerName } else { "${hostName}:${printerPort}" }

        # Prevent duplicate prints of the exact same data to the same printer within 4 seconds
        if (-not (Test-And-Claim-Print $hostName $printerPort $data.Length $dataBase64)) {
          Write-Host ("[print-bridge] duplicate print ignored ({0} bytes → {1})" -f $data.Length, $printerName)
          Send-Json $res 200 @{
            ok        = $true
            bytes     = $data.Length
            printer   = $printerName
            duplicate = $true
          }
          continue
        }
        try {
          Send-TcpBytes $hostName $printerPort $data
          Write-Host ("[print-bridge] sent {0} bytes → {1}" -f $data.Length, $printerName)
          Send-Json $res 200 @{
            ok      = $true
            bytes   = $data.Length
            printer = $printerName
          }
        }
        catch {
          Write-Host "[print-bridge] print failed:" $_.Exception.Message
          Send-Json $res 500 @{ ok = $false; error = $_.Exception.Message }
        }
        continue
      }

      Send-Json $res 404 @{ ok = $false; error = "Not found" }
    }
    catch {
      try {
        Send-Json $res 500 @{ ok = $false; error = $_.Exception.Message }
      }
      catch {
        try { $res.Abort() } catch { }
      }
    }
  }
}
finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
