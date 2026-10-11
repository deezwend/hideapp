param([int]$OwnerPid = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'WindowHost.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
    [WindowHost]::Run($OwnerPid)
} catch {
    [Console]::Error.WriteLine($_.Exception.ToString())
    exit 1
}
