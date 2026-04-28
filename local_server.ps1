$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logPath = Join-Path $root "local_server.log"
"START $(Get-Date -Format s)" | Out-File -FilePath $logPath -Append -Encoding utf8
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), 8080)
$listener.Start()
"LISTENING 127.0.0.1:8080" | Out-File -FilePath $logPath -Append -Encoding utf8

function Get-ContentType([string]$path) {
    switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
        ".html" { return "text/html; charset=utf-8" }
        ".js" { return "application/javascript; charset=utf-8" }
        ".css" { return "text/css; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        ".png" { return "image/png" }
        ".jpg" { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        ".svg" { return "image/svg+xml" }
        default { return "application/octet-stream" }
    }
}

function Send-Response($stream, [int]$statusCode, [string]$statusText, [byte[]]$bodyBytes, [string]$contentType) {
    $headers = @(
        "HTTP/1.1 $statusCode $statusText",
        "Content-Type: $contentType",
        "Content-Length: $($bodyBytes.Length)",
        "Connection: close",
        ""
        ""
    ) -join "`r`n"

    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($bodyBytes, 0, $bodyBytes.Length)
    $stream.Flush()
}

while ($true) {
    try {
        $client = $listener.AcceptTcpClient()

        try {
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()

            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes("Bad Request")
                Send-Response $stream 400 "Bad Request" $body "text/plain; charset=utf-8"
                continue
            }

            "REQUEST $requestLine" | Out-File -FilePath $logPath -Append -Encoding utf8

            while ($reader.Peek() -ge 0) {
                $line = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($line)) {
                    break
                }
            }

            $parts = $requestLine.Split(" ")
            $requestPath = if ($parts.Length -ge 2) { $parts[1] } else { "/" }
            $requestPath = $requestPath.Split("?")[0].TrimStart("/")

            if ([string]::IsNullOrWhiteSpace($requestPath)) {
                $requestPath = "index.html"
            }

            $safePath = $requestPath.Replace("/", "\")
            $filePath = Join-Path $root $safePath

            if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
                Send-Response $stream 404 "Not Found" $body "text/plain; charset=utf-8"
                continue
            }

            $bodyBytes = [System.IO.File]::ReadAllBytes($filePath)
            $contentType = Get-ContentType $filePath
            Send-Response $stream 200 "OK" $bodyBytes $contentType
        }
        finally {
            if ($reader) { $reader.Dispose() }
            if ($stream) { $stream.Dispose() }
            if ($client) { $client.Close() }
        }
    }
    catch {
        "ERROR $($_.Exception.Message)" | Out-File -FilePath $logPath -Append -Encoding utf8
    }
}
