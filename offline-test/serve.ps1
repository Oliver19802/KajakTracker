param([int]$Port = 8765)

$root = (Resolve-Path $PSScriptRoot).Path
$server = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$server.Start()
Write-Host "Offline test server: http://127.0.0.1:$Port/"
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.pbf'='application/x-protobuf'; '.pmtiles'='application/octet-stream' }

try {
  while ($true) {
    $client = $server.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 8192, $true)
      $requestLine = $reader.ReadLine(); $headers = @{}
      while (($line = $reader.ReadLine())) { $parts = $line.Split(':', 2); if ($parts.Count -eq 2) { $headers[$parts[0].Trim().ToLowerInvariant()] = $parts[1].Trim() } }
      $requestTarget = ($requestLine -split ' ')[1]
      $relative = [Uri]::UnescapeDataString(($requestTarget -split '\?')[0].TrimStart('/')); if (-not $relative) { $relative = 'index.html' }
      $path = [IO.Path]::GetFullPath((Join-Path $root $relative.Replace('/', [IO.Path]::DirectorySeparatorChar)))
      if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
        $body = [Text.Encoding]::UTF8.GetBytes('Not found'); $head = "HTTP/1.1 404 Not Found`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
        $headBytes = [Text.Encoding]::ASCII.GetBytes($head); $stream.Write($headBytes); $stream.Write($body); continue
      }
      $file = [IO.File]::OpenRead($path); $start = 0L; $end = $file.Length - 1; $status = '200 OK'
      if ($headers.range -match '^bytes=(\d+)-(\d*)$') { $start = [long]$Matches[1]; if ($Matches[2]) { $end = [Math]::Min([long]$Matches[2], $end) }; $status = '206 Partial Content' }
      $length = $end - $start + 1; $type = $mime[[IO.Path]::GetExtension($path)] ?? 'application/octet-stream'
      $contentRange = if ($status.StartsWith('206')) { "Content-Range: bytes $start-$end/$($file.Length)`r`n" } else { '' }
      $head = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $length`r`nAccept-Ranges: bytes`r`n${contentRange}Cache-Control: no-store`r`nConnection: close`r`n`r`n"
      $headBytes = [Text.Encoding]::ASCII.GetBytes($head); $stream.Write($headBytes); $file.Position = $start
      $buffer = [byte[]]::new(65536); $remaining = $length
      while ($remaining -gt 0) { $read = $file.Read($buffer, 0, [Math]::Min($buffer.Length, $remaining)); if ($read -le 0) { break }; $stream.Write($buffer, 0, $read); $remaining -= $read }
      $file.Dispose()
    } catch {} finally { $client.Close() }
  }
} finally { $server.Stop() }
