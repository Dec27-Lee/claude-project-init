param(
  [Parameter(Mandatory = $true)]
  [string]$Prompt,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [ValidatePattern('^\d+x\d+$')]
  [string]$Size = "1536x864",

  [string]$Model,
  [string]$BaseUrl,
  [string]$ApiKey,

  [ValidateRange(1, 10)]
  [int]$Count = 1,

  [string]$Quality,
  [string]$Background,

  [ValidateSet("b64_json", "url")]
  [string]$ResponseFormat,

  [switch]$AllowAnthropicFallback,
  [switch]$NoSettingsFallback
)

$ErrorActionPreference = "Stop"

function Get-ClaudeSettingEnvValue {
  param([string]$Name)

  if ($NoSettingsFallback) { return $null }

  $userProfile = [Environment]::GetFolderPath("UserProfile")
  if ([string]::IsNullOrWhiteSpace($userProfile)) { return $null }

  $settingsPath = Join-Path $userProfile ".claude/settings.json"
  if (-not (Test-Path $settingsPath)) { return $null }

  try {
    $settings = Get-Content -Raw -Path $settingsPath | ConvertFrom-Json
    if ($null -eq $settings.env) { return $null }
    $prop = $settings.env.PSObject.Properties[$Name]
    if ($null -eq $prop) { return $null }
    return [string]$prop.Value
  } catch {
    return $null
  }
}

function First-NonEmpty {
  param([object[]]$Values)
  foreach ($value in $Values) {
    if ($null -ne $value -and -not [string]::IsNullOrWhiteSpace([string]$value)) {
      return [string]$value
    }
  }
  return $null
}

function Normalize-BaseUrl {
  param([string]$Url)

  $clean = $Url.TrimEnd("/")
  if ($clean -notmatch '^https?://') {
    throw "Base URL must start with http:// or https://."
  }
  if ($clean -match "/v1$") { return $clean }
  return "$clean/v1"
}

function Resolve-OutputPath {
  param(
    [string]$Path,
    [int]$Index,
    [int]$Total
  )

  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw "OutputPath cannot be empty."
  }

  if ((Test-Path $Path) -and (Get-Item $Path).PSIsContainer) {
    throw "OutputPath must be a file path, not a directory."
  }

  $dir = Split-Path -Parent $Path
  $leaf = Split-Path -Leaf $Path
  $name = [System.IO.Path]::GetFileNameWithoutExtension($leaf)
  $ext = [System.IO.Path]::GetExtension($leaf)

  if ([string]::IsNullOrWhiteSpace($name)) { $name = "image" }
  if ([string]::IsNullOrWhiteSpace($ext)) { $ext = ".png" }

  if ($Total -le 1) {
    if ([string]::IsNullOrWhiteSpace($dir)) { return "$name$ext" }
    return Join-Path $dir "$name$ext"
  }

  $suffix = ("{0:D2}" -f ($Index + 1))
  if ([string]::IsNullOrWhiteSpace($dir)) { return "$name-$suffix$ext" }
  return Join-Path $dir "$name-$suffix$ext"
}

function Save-ImageItem {
  param(
    [object]$Item,
    [string]$Path
  )

  $parent = Split-Path -Parent $Path
  if (-not [string]::IsNullOrWhiteSpace($parent) -and -not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }

  if ($null -ne $Item.b64_json -and -not [string]::IsNullOrWhiteSpace([string]$Item.b64_json)) {
    [System.IO.File]::WriteAllBytes($Path, [System.Convert]::FromBase64String([string]$Item.b64_json))
    return
  }

  if ($null -ne $Item.url -and -not [string]::IsNullOrWhiteSpace([string]$Item.url)) {
    Invoke-WebRequest -Uri ([string]$Item.url) -OutFile $Path | Out-Null
    return
  }

  if ($null -ne $Item.result -and -not [string]::IsNullOrWhiteSpace([string]$Item.result)) {
    [System.IO.File]::WriteAllBytes($Path, [System.Convert]::FromBase64String([string]$Item.result))
    return
  }

  throw "Image item did not include b64_json, url, or result."
}

$modelFromSettings = Get-ClaudeSettingEnvValue "GPT_IMAGE_MODEL"
$gptImageBaseFromSettings = Get-ClaudeSettingEnvValue "GPT_IMAGE_BASE_URL"
$gptImageKeyFromSettings = Get-ClaudeSettingEnvValue "GPT_IMAGE_API_KEY"
$openAiBaseFromSettings = Get-ClaudeSettingEnvValue "OPENAI_BASE_URL"
$openAiKeyFromSettings = Get-ClaudeSettingEnvValue "OPENAI_API_KEY"

$baseCandidates = @($BaseUrl, $env:GPT_IMAGE_BASE_URL, $gptImageBaseFromSettings, $env:OPENAI_BASE_URL, $openAiBaseFromSettings)
$keyCandidates = @($ApiKey, $env:GPT_IMAGE_API_KEY, $gptImageKeyFromSettings, $env:OPENAI_API_KEY, $openAiKeyFromSettings)

if ($AllowAnthropicFallback) {
  $baseCandidates += @($env:ANTHROPIC_BASE_URL, (Get-ClaudeSettingEnvValue "ANTHROPIC_BASE_URL"))
  $keyCandidates += @($env:ANTHROPIC_AUTH_TOKEN, (Get-ClaudeSettingEnvValue "ANTHROPIC_AUTH_TOKEN"))
}

$resolvedModel = First-NonEmpty @($Model, $env:GPT_IMAGE_MODEL, $modelFromSettings, "gpt-image-2")
$resolvedBaseUrl = First-NonEmpty $baseCandidates
$resolvedApiKey = First-NonEmpty $keyCandidates

if ([string]::IsNullOrWhiteSpace($resolvedBaseUrl)) {
  throw "Missing base URL. Set GPT_IMAGE_BASE_URL or OPENAI_BASE_URL, or pass -BaseUrl. Use -AllowAnthropicFallback only if your Claude relay exposes an OpenAI-compatible images endpoint."
}

if ([string]::IsNullOrWhiteSpace($resolvedApiKey)) {
  throw "Missing API key. Set GPT_IMAGE_API_KEY or OPENAI_API_KEY, or pass -ApiKey."
}

$base = Normalize-BaseUrl $resolvedBaseUrl
$uri = "$base/images/generations"

$body = [ordered]@{
  model = $resolvedModel
  prompt = $Prompt
  size = $Size
  n = $Count
}

if (-not [string]::IsNullOrWhiteSpace($Quality)) { $body.quality = $Quality }
if (-not [string]::IsNullOrWhiteSpace($Background)) { $body.background = $Background }
if (-not [string]::IsNullOrWhiteSpace($ResponseFormat)) { $body.response_format = $ResponseFormat }

try {
  $response = Invoke-RestMethod `
    -Uri $uri `
    -Method Post `
    -Headers @{ Authorization = "Bearer $resolvedApiKey" } `
    -ContentType "application/json" `
    -Body ($body | ConvertTo-Json -Depth 20)
} catch {
  $message = $_.Exception.Message
  throw "Image generation request failed: $message. If this is 404, verify that the base URL points to an OpenAI-compatible /v1 endpoint for your relay. If this is 400, verify model, size, quality, and background parameters supported by the relay. If this is 429, retry later or lower -Count."
}

$imageItems = @()

if ($null -ne $response.data) {
  foreach ($item in $response.data) { $imageItems += $item }
}

if ($imageItems.Count -eq 0 -and $null -ne $response.output) {
  foreach ($output in $response.output) {
    if ($null -ne $output.result) { $imageItems += $output }
    if ($null -ne $output.content) {
      foreach ($content in $output.content) {
        if ($null -ne $content.result -or $null -ne $content.b64_json -or $null -ne $content.url) {
          $imageItems += $content
        }
      }
    }
  }
}

if ($imageItems.Count -eq 0) {
  throw "No image payload found in response. Supported shapes: data[].b64_json, data[].url, output[].result."
}

$saved = @()
for ($i = 0; $i -lt $imageItems.Count; $i++) {
  $path = Resolve-OutputPath -Path $OutputPath -Index $i -Total $imageItems.Count
  Save-ImageItem -Item $imageItems[$i] -Path $path
  $saved += $path
}

foreach ($path in $saved) {
  $file = Get-Item -Path $path
  "Saved: $($file.FullName) ($($file.Length) bytes)"
}
