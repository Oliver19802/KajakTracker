param(
  [string]$InputFile = (Join-Path $PSScriptRoot 'work\spreewald-30km.osm')
)

$counts = [ordered]@{
  locks = 0
  weirs = 0
  restaurants = 0
  cafes = 0
  pubs = 0
  biergartens = 0
  fast_food = 0
  canoe_put_ins = 0
  slipways = 0
  toilets = 0
  camp_sites = 0
  caravan_sites = 0
}
$types = @{}
foreach ($key in $counts.Keys) {
  $types[$key] = [ordered]@{ node = 0; way = 0; relation = 0 }
}

function Add-Match([string]$key, [string]$type) {
  $counts[$key]++
  $types[$key][$type]++
}

$settings = [System.Xml.XmlReaderSettings]::new()
$settings.IgnoreComments = $true
$settings.IgnoreWhitespace = $true
$reader = [System.Xml.XmlReader]::Create((Resolve-Path $InputFile), $settings)
try {
  while ($reader.Read()) {
    if ($reader.NodeType -ne [System.Xml.XmlNodeType]::Element -or
        $reader.Name -notin @('node', 'way', 'relation')) { continue }

    $type = $reader.Name
    $depth = $reader.Depth
    $tags = @{}
    if (-not $reader.IsEmptyElement) {
      while ($reader.Read()) {
        if ($reader.NodeType -eq [System.Xml.XmlNodeType]::EndElement -and
            $reader.Depth -eq $depth) { break }
        if ($reader.NodeType -eq [System.Xml.XmlNodeType]::Element -and
            $reader.Name -eq 'tag') {
          $tags[$reader.GetAttribute('k')] = $reader.GetAttribute('v')
        }
      }
    }

    if ($tags.waterway -in @('lock_gate', 'lock') -or $tags.lock -eq 'yes') { Add-Match locks $type }
    if ($tags.waterway -eq 'weir') { Add-Match weirs $type }
    switch ($tags.amenity) {
      'restaurant' { Add-Match restaurants $type }
      'cafe' { Add-Match cafes $type }
      'pub' { Add-Match pubs $type }
      'biergarten' { Add-Match biergartens $type }
      'fast_food' { Add-Match fast_food $type }
      'toilets' { Add-Match toilets $type }
    }
    if ($tags.canoe -eq 'put_in') { Add-Match canoe_put_ins $type }
    if ($tags.leisure -eq 'slipway') { Add-Match slipways $type }
    if ($tags.tourism -eq 'camp_site') { Add-Match camp_sites $type }
    if ($tags.tourism -eq 'caravan_site') { Add-Match caravan_sites $type }
  }
} finally {
  $reader.Dispose()
}

[ordered]@{ totals = $counts; by_osm_type = $types } | ConvertTo-Json -Depth 5
