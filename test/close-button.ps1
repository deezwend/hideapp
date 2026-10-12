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
Assert-Region $true 'Chrome_WidgetWin_1' 0 985 115 100 100 1000 700 96 $false 'timed-out Electron hit test'
Assert-Region $false 'Chrome_WidgetWin_1' 0 950 115 100 100 1000 700 96 $false 'timeout does not widen to maximize'
Assert-Region $false 'OtherApp' 0 985 115 100 100 1000 700 96 $false 'timeout does not accept other classes'
Assert-Region $false 'Chrome_WidgetWin_1' 0 985 115 100 100 1000 700 96 $true 'timeout excludes fullscreen'
Assert-Region $false 'Chrome_WidgetWin_1' 0 985 170 100 100 1000 700 96 $false 'timeout excludes content'
# Model Terminal's parent HTCLIENT / child HTCLOSE routing with real HWNDs.
# No desktop input or unlocked session is required.
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Windows.Forms;
public class CaptionHitFixture : Form {
    public int Hit = 1;
    protected override void WndProc(ref Message message) {
        if (message.Msg == 0x84) { message.Result = new IntPtr(Hit); return; }
        base.WndProc(ref message);
    }
}
'@
$root = New-Object CaptionHitFixture
$child = New-Object CaptionHitFixture
$unrelated = New-Object CaptionHitFixture
try {
    $child.TopLevel = $false
    $root.Controls.Add($child)
    # Create the parent HWND first; otherwise WinForms parks the child HWND
    # under its temporary parking window until the parent is created.
    $null = $root.Handle
    $null = $child.Handle
    $pointType = [WindowHost].GetNestedType('Point', [Reflection.BindingFlags]::NonPublic)
    $point = [Activator]::CreateInstance($pointType)
    $pointType.GetField('X').SetValue($point, 100)
    $pointType.GetField('Y').SetValue($point, 100)
    $method = [WindowHost].GetMethod('IsCloseButton', [Reflection.BindingFlags]'NonPublic,Static')
    function Assert-Hit($expected, $target, $label) {
        $actual = $method.Invoke($null, @($root.Handle, $target, $point))
        if ($actual -ne $expected) { throw "Child caption assertion failed: $label" }
    }
    $child.Hit = 20
    Assert-Hit $true $child.Handle 'Terminal child close with parent HTCLIENT'
    foreach ($hit in @(1, 2, 8, 9, 12)) {
        $child.Hit = $hit
        Assert-Hit $false $child.Handle "content/caption/minimize/maximize/resize ($hit)"
    }
    $unrelated.Hit = 20
    Assert-Hit $false $unrelated.Handle 'unrelated window cannot supply close hit'
    $root.Hit = 20
    Assert-Hit $true $child.Handle 'native parent close still works'
    Assert-Hit $true $root.Handle 'classic console/native close without child'
} finally {
    $child.Dispose()
    $root.Dispose()
    $unrelated.Dispose()
}
'Close-button region and child routing assertions passed.'
