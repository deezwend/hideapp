$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot '../native/WindowHost.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
function Assert-Region($expected, $class, $hit, $x, $y, $left, $top, $right, $bottom, $dpi, $fullscreen, $label) {
    $actual = [WindowHost]::IsCustomCloseRegion($class, $hit, $x, $y, $left, $top, $right, $bottom, $dpi, $fullscreen)
    if ($actual -ne $expected) { throw "Close-button assertion failed: $label" }
}
Assert-Region $true 'Chrome_WidgetWin_1' 1 985 115 100 100 1000 700 96 $false 'Discord/Electron client close'
Assert-Region $false 'Chrome_WidgetWin_1' 1 950 115 100 100 1000 700 96 $false 'maximize neighbour'
Assert-Region $false 'Chrome_WidgetWin_1' 1 985 170 100 100 1000 700 96 $false 'content area'
Assert-Region $false 'Chrome_WidgetWin_1' 1 400 115 100 100 1000 700 96 $false 'titlebar middle'
Assert-Region $false 'Chrome_WidgetWin_1' 1 1000 115 100 100 1000 700 96 $false 'outside right edge'
Assert-Region $false 'Chrome_WidgetWin_1' 1 985 99 100 100 1000 700 96 $false 'outside top edge'
Assert-Region $false 'OtherApp' 1 985 115 100 100 1000 700 96 $false 'unrecognised custom app'
Assert-Region $false 'Chrome_WidgetWin_1' 9 985 115 100 100 1000 700 96 $false 'native maximize hit'
Assert-Region $false 'Chrome_WidgetWin_1' 1 985 115 100 100 1000 700 96 $true 'fullscreen'
Assert-Region $true 'Chrome_WidgetWin_1' 1 1970 140 100 100 2000 1000 144 $false '150 percent DPI'
Assert-Region $true 'Chrome_WidgetWin_1' 1 1950 150 100 100 2000 1000 192 $false '200 percent DPI'
Assert-Region $true 'Chrome_WidgetWin_1' 1 -120 -180 -1000 -200 -100 500 96 $false 'negative monitor coordinates'
'Close-button region assertions passed.'
