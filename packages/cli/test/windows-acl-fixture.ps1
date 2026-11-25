# SPDX-License-Identifier: AGPL-3.0-or-later
# Test fixture only: deliberately changes real ACLs; all paths arrive as JSON data.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false, $true)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$request = [Console]::In.ReadLine() | ConvertFrom-Json
$path = [string]$request.path
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$user = $identity.User
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
public static class AclFixture {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode)]
  static extern uint SetNamedSecurityInfo(string path, int type, uint flags, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode)]
  static extern uint GetNamedSecurityInfo(string path, int type, uint flags, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern uint GetShortPathNameW(string path, StringBuilder value, uint size);
  public static string ShortName(string path) {
    StringBuilder value = new StringBuilder(32768);
    uint length = GetShortPathNameW(path, value, (uint)value.Capacity);
    if (length == 0 || length >= value.Capacity) throw new Win32Exception(Marshal.GetLastWin32Error());
    return value.ToString();
  }
  [StructLayout(LayoutKind.Sequential)]
  struct Info {
    public uint Attributes;
    public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
    public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle file, out Info info);
  public static void NullDacl(string path) {
    uint code = SetNamedSecurityInfo(path, 1, 0x80000004, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
    if (code != 0) throw new Win32Exception((int)code);
  }
  public static bool IsNullDacl(string path) {
    IntPtr owner, group, dacl, sacl, descriptor;
    uint code = GetNamedSecurityInfo(path, 1, 4, out owner, out group, out dacl, out sacl, out descriptor);
    if (code != 0) throw new Win32Exception((int)code);
    try { return dacl == IntPtr.Zero; } finally { LocalFree(descriptor); }
  }
  public static bool Ordinary(FileStream file) {
    Info info;
    return GetFileInformationByHandle(file.SafeFileHandle, out info) && info.Links == 1 && (info.Attributes & 0x410) == 0;
  }
}
'@
function Describe {
  $security = [IO.File]::GetAccessControl($path)
  $raw = [Security.AccessControl.RawSecurityDescriptor]::new($security.GetSecurityDescriptorBinaryForm(), 0)
  $rules = @()
  foreach ($ace in $raw.DiscretionaryAcl) {
    $rules += @{ sid = $ace.SecurityIdentifier.Value; allow = $ace.AceQualifier -eq [Security.AccessControl.AceQualifier]::AccessAllowed;
      inherited = $ace.IsInherited; callback = $ace.IsCallback }
  }
  return @{ owner = $raw.Owner.Value; user = $user.Value; protected = $security.AreAccessRulesProtected;
    nullDacl = [AclFixture]::IsNullDacl($path); rules = $rules }
}
function PrivateSecurity {
  $security = [Security.AccessControl.FileSecurity]::new()
  $security.SetOwner($user)
  $security.SetAccessRuleProtection($true, $false)
  $security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($user, [Security.AccessControl.FileSystemRights]::FullControl, [Security.AccessControl.AccessControlType]::Allow))
  return $security
}
$result = $null
switch ($request.op) {
  'inspect' { $result = Describe }
  'short-name' { $short = [AclFixture]::ShortName($path); $result = @{ path = $short; differs = $short -ine $path } }
  'private' { [IO.File]::SetAccessControl($path, (PrivateSecurity)); $result = Describe }
  'current-owner' {
    $security = [IO.File]::GetAccessControl($path)
    $security.SetOwner($user)
    [IO.File]::SetAccessControl($path, $security)
    $result = Describe
  }
  'broad' {
    $security = [IO.File]::GetAccessControl($path)
    $everyone = [Security.Principal.SecurityIdentifier]::new('S-1-1-0')
    $security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($everyone, [Security.AccessControl.FileSystemRights]::Read, [Security.AccessControl.AccessControlType]::Allow))
    [IO.File]::SetAccessControl($path, $security)
    $result = Describe
  }
  'permissive-parent' {
    $security = [Security.AccessControl.DirectorySecurity]::new()
    $security.SetOwner($user)
    $security.SetAccessRuleProtection($true, $false)
    $inherit = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    $security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($user, [Security.AccessControl.FileSystemRights]::FullControl, $inherit, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
    $security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'), [Security.AccessControl.FileSystemRights]::ReadAndExecute, $inherit, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
    [IO.Directory]::SetAccessControl($path, $security)
    $result = @{ changed = $true }
  }
  'null' { [AclFixture]::NullDacl($path); $result = @{ nullDacl = [AclFixture]::IsNullDacl($path) } }
  'uninspectable' {
    $security = PrivateSecurity
    # OWNER RIGHTS suppresses the owner's implicit READ_CONTROL; file data stays readable.
    $security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-3-4'), [Security.AccessControl.FileSystemRights]::ReadPermissions, [Security.AccessControl.AccessControlType]::Deny))
    [IO.File]::SetAccessControl($path, $security)
    $stream = [IO.FileStream]::new($path, [IO.FileMode]::Open, [Security.AccessControl.FileSystemRights]::ReadData, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete, 4096, [IO.FileOptions]::None)
    try {
      $readable = $stream.ReadByte() -ge -1
      $inspectable = $true
      try { $null = $stream.GetAccessControl() } catch { $inspectable = $false }
      $result = @{ readable = $readable; inspectable = $inspectable }
    } finally { $stream.Dispose() }
  }
  'callback' {
    $security = PrivateSecurity
    $raw = [Security.AccessControl.RawSecurityDescriptor]::new($security.GetSecurityDescriptorBinaryForm(), 0)
    $ace = [Security.AccessControl.CommonAce]::new([Security.AccessControl.AceFlags]::None, [Security.AccessControl.AceQualifier]::AccessAllowed,
      [int][Security.AccessControl.FileSystemRights]::Read, [Security.Principal.SecurityIdentifier]::new('S-1-1-0'), $true, [byte[]]@())
    $raw.DiscretionaryAcl.InsertAce($raw.DiscretionaryAcl.Count, $ace)
    $binary = [byte[]]::new($raw.BinaryLength)
    $raw.GetBinaryForm($binary, 0)
    $security.SetSecurityDescriptorBinaryForm($binary)
    [IO.File]::SetAccessControl($path, $security)
    $result = Describe
  }
  'foreign-owned' {
    # Existing ordinary system-owned files exercise ownership refusal without requiring
    # administrator privileges to forge an owner on a temporary fixture.
    foreach ($relative in @('win.ini', 'System32\drivers\etc\hosts', 'System32\drivers\etc\networks', 'System32\notepad.exe', 'explorer.exe')) {
      $candidate = [IO.Path]::Combine($env:SystemRoot, $relative)
      $stream = $null
      try {
        $stream = [IO.FileStream]::new($candidate, [IO.FileMode]::Open, [Security.AccessControl.FileSystemRights]::Read, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete, 4096, [IO.FileOptions]::None)
        $owner = $stream.GetAccessControl().GetOwner([Security.Principal.SecurityIdentifier])
        if ([AclFixture]::Ordinary($stream) -and -not $owner.Equals($user)) { $result = @{ path = $candidate; owner = $owner.Value; user = $user.Value }; break }
      } catch {} finally { if ($null -ne $stream) { $stream.Dispose() } }
    }
    if ($null -eq $result) { throw 'No readable ordinary foreign-owned Windows fixture exists' }
  }
  default { throw 'unknown fixture operation' }
}
$identity.Dispose()
[Console]::Out.WriteLine(($result | ConvertTo-Json -Compress -Depth 5))
