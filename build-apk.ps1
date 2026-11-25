$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$JdkHome = "$env:LOCALAPPDATA\Java\jdk-17.0.19+10"
$JdkBin = "$JdkHome\bin"
$BuildTools = "$env:LOCALAPPDATA\Android\Sdk\build-tools\34.0.0"
$AndroidJar = "$env:LOCALAPPDATA\Android\Sdk\platforms\android-34\android.jar"

$env:JAVA_HOME = $JdkHome
$env:PATH = "$JdkBin;$env:PATH"

$AppDir = "$Root\android-app\app"
$AssetsDir = "$AppDir\assets"
$BuildDir = "$Root\android-app\build"
$KeystoreDir = "$Root\android-app\keystore"
$Keystore = "$KeystoreDir\smartbase-release.jks"
$DistDir = "$Root\dist"
$OutApk = "$DistDir\SmartBase-QuickFill.apk"

function Assert-Ok($StepName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$StepName failed with exit code $LASTEXITCODE"
  }
}

New-Item -ItemType Directory -Force -Path $AssetsDir, "$BuildDir\gen", "$BuildDir\classes", "$BuildDir\dex", $KeystoreDir, $DistDir | Out-Null
Remove-Item -Recurse -Force "$BuildDir\*" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$BuildDir\gen", "$BuildDir\classes", "$BuildDir\dex" | Out-Null

# Copy latest QuickFill userscript into Android assets (UTF-8 without BOM)
$ScriptContent = [System.IO.File]::ReadAllText("$Root\smartbase-quickfill.user.js", [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText("$AssetsDir\quickfill.js", $ScriptContent, (New-Object System.Text.UTF8Encoding($false)))

# Generate persistent release keystore if missing
if (!(Test-Path $Keystore)) {
  Write-Host "Generating release keystore..."
  & "$JdkBin\keytool.exe" -genkeypair -v -keystore $Keystore -storepass "SmartBase2026!" -keypass "SmartBase2026!" -alias "smartbase" -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=SmartBase QuickFill, O=SmartBase, C=IL"
  Assert-Ok "keytool"
}

Write-Host "1/6 Compiling resources with aapt2..."
& "$BuildTools\aapt2.exe" compile --dir "$AppDir\res" -o "$BuildDir\res.zip"
Assert-Ok "aapt2 compile"

Write-Host "2/6 Linking APK resources and manifest..."
& "$BuildTools\aapt2.exe" link `
  -o "$BuildDir\unaligned.apk" `
  -I $AndroidJar `
  --manifest "$AppDir\AndroidManifest.xml" `
  -A $AssetsDir `
  --java "$BuildDir\gen" `
  "$BuildDir\res.zip" `
  --auto-add-overlay
Assert-Ok "aapt2 link"

Write-Host "3/6 Compiling Java sources..."
$JavaSources = Get-ChildItem -Recurse -Filter "*.java" -Path "$BuildDir\gen", "$AppDir\src" | ForEach-Object { $_.FullName }
& "$JdkBin\javac.exe" --release 11 -encoding UTF-8 -cp $AndroidJar -d "$BuildDir\classes" @JavaSources
Assert-Ok "javac"

Write-Host "4/6 Converting bytecode to DEX with d8..."
$ClassFiles = Get-ChildItem -Recurse -Filter "*.class" -Path "$BuildDir\classes" | ForEach-Object { "`"$($_.FullName)`"" }
$ClassArgLine = $ClassFiles -join " "
cmd /c "`"$BuildTools\d8.bat`" --min-api 24 --lib `"$AndroidJar`" --output `"$BuildDir\dex`" $ClassArgLine"
Assert-Ok "d8"

Write-Host "5/6 Packaging classes.dex and aligning..."
& "$JdkBin\jar.exe" uf "$BuildDir\unaligned.apk" -C "$BuildDir\dex" classes.dex
Assert-Ok "jar uf"

& "$BuildTools\zipalign.exe" -p -f 4 "$BuildDir\unaligned.apk" "$BuildDir\aligned.apk"
Assert-Ok "zipalign"

Write-Host "6/6 Signing and verifying APK..."
cmd /c "`"$BuildTools\apksigner.bat`" sign --ks `"$Keystore`" --ks-key-alias smartbase --ks-pass pass:SmartBase2026! --key-pass pass:SmartBase2026! --out `"$OutApk`" `"$BuildDir\aligned.apk`""
Assert-Ok "apksigner sign"

cmd /c "`"$BuildTools\apksigner.bat`" verify --verbose `"$OutApk`""
Assert-Ok "apksigner verify"

$SizeKb = [math]::Round((Get-Item $OutApk).Length / 1KB, 1)
Write-Host "SUCCESS: Built $OutApk ($SizeKb KB)"
