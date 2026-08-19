param([string]$Source = 'D:\Extension\Vol9_VI.docx')

Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$chaptersDir = Join-Path $root 'chapters'
$assetsDir = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $chaptersDir | Out-Null
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
Get-ChildItem -LiteralPath $chaptersDir -Filter '*.docx' -ErrorAction SilentlyContinue | Remove-Item -Force
Get-ChildItem -LiteralPath $assetsDir -File -ErrorAction SilentlyContinue | Remove-Item -Force

function Get-Text($paragraph, $ns) {
  $parts = foreach ($node in $paragraph.SelectNodes('.//w:t|.//w:br|.//w:tab', $ns)) {
    if ($node.LocalName -eq 'br') { "`n" } elseif ($node.LocalName -eq 'tab') { "`t" } else { $node.InnerText }
  }
  return (($parts -join '') -replace "\r?\n", "`n").Trim()
}

function Get-Runs($paragraph, $ns) {
  $runs = @()
  foreach ($run in $paragraph.SelectNodes('.//w:r', $ns)) {
    $fontNode = $run.SelectSingleNode('./w:rPr/w:rFonts', $ns)
    $font = if ($fontNode) { $fontNode.GetAttribute('ascii','http://schemas.openxmlformats.org/wordprocessingml/2006/main') } else { '' }
    $text = foreach ($node in $run.SelectNodes('./w:t|./w:br|./w:tab', $ns)) { if ($node.LocalName -eq 'br') { "`n" } elseif ($node.LocalName -eq 'tab') { "`t" } else { $node.InnerText } }
    $value = ($text -join '')
    if ($value) { $runs += [ordered]@{ text = $value; font = $font; bold = [bool]$run.SelectSingleNode('./w:rPr/w:b', $ns); italic = [bool]$run.SelectSingleNode('./w:rPr/w:i', $ns) } }
  }
  return @($runs)
}

function Write-DocxChapter($sourceZip, $sourceXml, $sourceBody, $startNode, $endNode, $output) {
  $newXml = New-Object System.Xml.XmlDocument
  $newXml.PreserveWhitespace = $true
  $newXml.LoadXml($sourceXml.OuterXml)
  $ns = New-Object System.Xml.XmlNamespaceManager($newXml.NameTable)
  $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
  $body = $newXml.SelectSingleNode('//w:body', $ns)
  $sectPr = $body.SelectSingleNode('./w:sectPr', $ns).CloneNode($true)
  while ($body.HasChildNodes) { $body.RemoveChild($body.FirstChild) | Out-Null }
  $nodes = @($sourceBody.ChildNodes | Where-Object { $_.LocalName -in @('p','tbl') })
  $from = [array]::IndexOf($nodes, $startNode)
  $to = if ($endNode) { [array]::IndexOf($nodes, $endNode) } else { $nodes.Count }
  for ($i = $from; $i -lt $to; $i++) { $body.AppendChild($newXml.ImportNode($nodes[$i], $true)) | Out-Null }
  $body.AppendChild($newXml.ImportNode($sectPr, $true)) | Out-Null

  if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force }
  $file = [IO.File]::Create($output)
  $zip = [IO.Compression.ZipArchive]::new($file, [IO.Compression.ZipArchiveMode]::Create, $false)
  foreach ($entry in $sourceZip.Entries) {
    if ($entry.FullName -eq 'word/document.xml') { continue }
    $target = $zip.CreateEntry($entry.FullName)
    $input = $entry.Open(); $out = $target.Open(); $input.CopyTo($out); $out.Dispose(); $input.Dispose()
  }
  $docEntry = $zip.CreateEntry('word/document.xml')
  $writer = New-Object IO.StreamWriter($docEntry.Open(), (New-Object Text.UTF8Encoding($false)))
  $writer.Write($newXml.OuterXml); $writer.Dispose(); $zip.Dispose(); $file.Dispose()
}

$sourceZip = [IO.Compression.ZipFile]::OpenRead($Source)
$docEntry = $sourceZip.GetEntry('word/document.xml')
$reader = [IO.StreamReader]::new($docEntry.Open())
$xml = New-Object System.Xml.XmlDocument
$xml.PreserveWhitespace = $true
$xml.LoadXml($reader.ReadToEnd()); $reader.Dispose()
$ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
$ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
$ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
$ns.AddNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
$relsEntry = $sourceZip.GetEntry('word/_rels/document.xml.rels')
$relsReader = [IO.StreamReader]::new($relsEntry.Open())
$relsXml = [xml]$relsReader.ReadToEnd(); $relsReader.Dispose()
$imageTargets = @{}
foreach ($rel in $relsXml.Relationships.Relationship) { if ($rel.Type -match '/image$') { $imageTargets[$rel.Id] = [IO.Path]::GetFileName($rel.Target) } }
foreach ($media in $sourceZip.Entries | Where-Object { $_.FullName -like 'word/media/*' }) {
  $target = Join-Path $assetsDir ([IO.Path]::GetFileName($media.FullName))
  $input = $media.Open(); $output = [IO.File]::Create($target); $input.CopyTo($output); $output.Dispose(); $input.Dispose()
}
foreach ($font in $sourceZip.Entries | Where-Object { $_.FullName -like 'word/fonts/*' }) {
  $target = Join-Path $assetsDir ([IO.Path]::GetFileName($font.FullName))
  $input = $font.Open(); $output = [IO.File]::Create($target); $input.CopyTo($output); $output.Dispose(); $input.Dispose()
}
$body = $xml.SelectSingleNode('//w:body', $ns)
$nodes = @($body.ChildNodes | Where-Object { $_.LocalName -in @('p','tbl') })
$headingNodes = @($nodes | Where-Object { $_.LocalName -eq 'p' -and $_.SelectSingleNode('./w:pPr/w:pStyle/@w:val', $ns).Value -eq 'Heading2' })
$records = @()
for ($i = 0; $i -lt $headingNodes.Count; $i++) {
  $heading = $headingNodes[$i]
  $next = if ($i + 1 -lt $headingNodes.Count) { $headingNodes[$i + 1] } else { $null }
  $title = Get-Text $heading $ns
  $start = [array]::IndexOf($nodes, $heading); $end = if ($next) { [array]::IndexOf($nodes, $next) } else { $nodes.Count }
  $blocks = @()
  $wordCount = 0
  for ($j = $start; $j -lt $end; $j++) {
    if ($nodes[$j].LocalName -eq 'p') {
      foreach ($image in $nodes[$j].SelectNodes('.//a:blip/@r:embed', $ns)) { if ($imageTargets.ContainsKey($image.Value)) { $blocks += [ordered]@{ type = 'image'; src = "assets/$($imageTargets[$image.Value])" } } }
      $text = Get-Text $nodes[$j] $ns
      if ($text) {
        $blocks += [ordered]@{ type = 'p'; text = $text; runs = @(Get-Runs $nodes[$j] $ns) }
        $wordCount += ($text -split '\s+').Count
      }
    }
  }
  $label = ('{0:D2}' -f ($i + 1))
  $safe = ($title -replace '[^\p{L}\p{Nd} _-]', '') -replace '\s+', '-'
  $fileName = "${label}-${safe}.docx"
  Write-DocxChapter $sourceZip $xml $body $heading $next (Join-Path $chaptersDir $fileName)
  $estMinutes = [Math]::Max(1, [Math]::Ceiling($wordCount / 200))
  $records += [ordered]@{ label = "Phần $($i + 1)"; title = $title; file = "chapters/$fileName"; wordCount = $wordCount; estMinutes = $estMinutes; blocks = @($blocks) }
}
$sourceZip.Dispose()
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$json = $records | ConvertTo-Json -Depth 5 -Compress
[System.IO.File]::WriteAllText((Join-Path $root 'chapters.js'), "window.CHAPTERS = $json;", [System.Text.Encoding]::UTF8)
Write-Output "Đã tách $($records.Count) chương vào $chaptersDir"
