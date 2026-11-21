# SPDX-License-Identifier: AGPL-3.0-or-later
# Fixed Windows PowerShell 5.1 / .NET Framework bridge. Requests are JSON data on stdin.
# Keep byte-identical to the copy in the other Node CLI package; regression tests enforce this.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false, $true)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$held = $null
try {
  if ($PSVersionTable.PSEdition -ne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -lt 1) { throw 'unavailable' }
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace QuietVote {
  public sealed class PrivateFileFailure : Exception {
    public PrivateFileFailure(string code) : base(code) {}
  }
  public static class PrivateFile {
    public const int MaxBytes = 64 * 1024 * 1024;
    [StructLayout(LayoutKind.Sequential)]
    private struct FileInfo {
      public uint Attributes;
      public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
      public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct FileId {
      public ulong Volume;
      [MarshalAs(UnmanagedType.ByValArray, SizeConst=16)] public byte[] Id;
    }
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool GetFileInformationByHandle(SafeFileHandle file, out FileInfo info);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle file, int kind, out FileId info, uint size);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern uint GetFileType(SafeFileHandle file);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern uint GetFinalPathNameByHandleW(SafeFileHandle file, StringBuilder path, uint size, uint flags);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern uint GetLongPathNameW(string path, StringBuilder result, uint size);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool SetFileInformationByHandle(SafeFileHandle file, int kind, IntPtr info, uint size);

    private static void Refuse(string code) { throw new PrivateFileFailure(code); }
    public static string PathOf(string path) {
      if (String.IsNullOrEmpty(path) || path.IndexOf('\0') >= 0) Refuse("PATH");
      string full = Path.GetFullPath(path);
      // Local drive files only: reject devices, UNC paths, alternate streams and reserved DOS names.
      if (full.Length < 4 || !Char.IsLetter(full[0]) || full[1] != ':' || full[2] != '\\' ||
          full.IndexOf(':', 2) >= 0) Refuse("PATH");
      foreach (string part in full.Substring(3).Split('\\')) {
        if (part.Length == 0 || part.EndsWith(".") || part.EndsWith(" ")) Refuse("PATH");
        string stem = part.Split('.')[0].ToUpperInvariant();
        if (stem == "CON" || stem == "PRN" || stem == "AUX" || stem == "NUL" ||
            stem == "CONIN$" || stem == "CONOUT$" ||
            (stem.Length == 4 && (stem.StartsWith("COM") || stem.StartsWith("LPT")) && stem[3] >= '0' && stem[3] <= '9')) Refuse("PATH");
      }
      // DOS 8.3 aliases (including the usual Windows TEMP directory) are harmless.
      // Expand names without resolving reparse targets; Named still compares the actual
      // handle destination against this spelling, so a junction/symlink is not accepted.
      StringBuilder expanded = new StringBuilder(32768);
      uint length = GetLongPathNameW(full, expanded, (uint)expanded.Capacity);
      if (length > 0 && length < expanded.Capacity) return expanded.ToString();
      int error = Marshal.GetLastWin32Error();
      if (length != 0 || (error != 2 && error != 3)) Refuse("PATH");
      string parent = Path.GetDirectoryName(full);
      length = GetLongPathNameW(parent, expanded, (uint)expanded.Capacity);
      if (length > 0 && length < expanded.Capacity) return Path.Combine(expanded.ToString(), Path.GetFileName(full));
      error = Marshal.GetLastWin32Error();
      if (length != 0 || (error != 2 && error != 3)) Refuse("PATH");
      return full; // Preserve the ordinary missing-file/directory failure from FileStream.
    }
    private static SecurityIdentifier CurrentUser() {
      using (WindowsIdentity identity = WindowsIdentity.GetCurrent()) { return identity.User; }
    }
    private static FileInfo Info(FileStream file) {
      FileInfo info;
      if (!file.CanSeek || GetFileType(file.SafeFileHandle) != 1 ||
          !GetFileInformationByHandle(file.SafeFileHandle, out info)) { Refuse("TYPE"); return new FileInfo(); }
      if ((info.Attributes & (0x10U | 0x400U)) != 0 || info.Links != 1) Refuse("TYPE");
      return info;
    }
    private static FileId Identity(FileStream file) {
      FileId id;
      if (!GetFileInformationByHandleEx(file.SafeFileHandle, 18, out id, (uint)Marshal.SizeOf(typeof(FileId)))) { Refuse("IDENTITY"); return new FileId(); }
      if (id.Id == null || id.Id.Length != 16) Refuse("IDENTITY");
      return id;
    }
    private static bool Same(FileId a, FileId b) {
      if (a.Volume != b.Volume) return false;
      for (int i = 0; i < 16; i++) if (a.Id[i] != b.Id[i]) return false;
      return true;
    }
    private static bool Named(FileStream file, string path) {
      StringBuilder value = new StringBuilder(32768);
      uint length = GetFinalPathNameByHandleW(file.SafeFileHandle, value, (uint)value.Capacity, 0);
      if (length == 0 || length >= value.Capacity) Refuse("IDENTITY");
      string actual = value.ToString();
      if (!actual.StartsWith(@"\\?\", StringComparison.Ordinal)) Refuse("PATH");
      return String.Equals(actual.Substring(4), path, StringComparison.OrdinalIgnoreCase);
    }
    public static void Validate(FileStream file, bool writing) {
      Info(file);
      // This ACL belongs to the exact stream used for all subsequent reads/writes.
      FileSecurity security = file.GetAccessControl();
      byte[] descriptor = security.GetSecurityDescriptorBinaryForm();
      RawSecurityDescriptor raw = new RawSecurityDescriptor(descriptor, 0);
      SecurityIdentifier user = CurrentUser();
      if (user == null || raw.Owner == null || !raw.Owner.Equals(user)) Refuse("OWNER");
      if (!security.AreAccessRulesProtected || (raw.ControlFlags & ControlFlags.DiscretionaryAclPresent) == 0 ||
          raw.DiscretionaryAcl == null || raw.DiscretionaryAcl.Count == 0) Refuse("ACL");
      bool read = false, write = false;
      foreach (GenericAce item in raw.DiscretionaryAcl) {
        CommonAce ace = item as CommonAce;
        if (ace == null || ace.IsCallback || ace.AceFlags != AceFlags.None ||
            (ace.AceQualifier != AceQualifier.AccessAllowed && ace.AceQualifier != AceQualifier.AccessDenied) ||
            (ace.AccessMask & ~(int)FileSystemRights.FullControl) != 0) Refuse("ACL");
        if (ace.AceQualifier == AceQualifier.AccessAllowed) {
          if (!ace.SecurityIdentifier.Equals(user)) Refuse("ACL");
          read |= (ace.AccessMask & (int)FileSystemRights.ReadData) != 0;
          write |= (ace.AccessMask & (int)FileSystemRights.WriteData) != 0;
        }
      }
      if (!read || (writing && !write)) Refuse("ACL");
    }
    public static FileStream Open(string supplied) {
      string path = PathOf(supplied);
      FileStream file = new FileStream(path, FileMode.Open, FileSystemRights.Read, FileShare.Read | FileShare.Delete, 65536, FileOptions.SequentialScan);
      try {
        Validate(file, false);
        Identity(file);
        if (!Named(file, path)) Refuse("PATH");
        return file;
      } catch { file.Dispose(); throw; }
    }
    public static FileStream Create(string supplied) {
      string path = PathOf(supplied);
      SecurityIdentifier user = CurrentUser();
      if (user == null) Refuse("OWNER");
      FileSecurity security = new FileSecurity();
      security.SetOwner(user);
      security.SetAccessRuleProtection(true, false);
      security.AddAccessRule(new FileSystemAccessRule(user, FileSystemRights.FullControl, AccessControlType.Allow));
      // The protected DACL is part of CreateNew, before the first secret byte exists.
      FileStream file = new FileStream(path, FileMode.CreateNew, FileSystemRights.FullControl,
          FileShare.ReadWrite | FileShare.Delete, 65536, FileOptions.WriteThrough, security);
      try {
        Validate(file, true);
        Identity(file);
        if (!Named(file, path)) Refuse("PATH");
        return file;
      } catch { try { DeleteHeld(file); } finally { file.Dispose(); } throw; }
    }
    public static byte[] Read(FileStream file, int max) {
      if (max < 0 || max > MaxBytes) Refuse("SIZE");
      Validate(file, false);
      FileInfo before = Info(file);
      long size = file.Length;
      if (size < 0 || size > max) Refuse("SIZE");
      byte[] bytes = new byte[(int)size];
      try {
        file.Position = 0;
        int offset = 0;
        while (offset < bytes.Length) {
          int count = file.Read(bytes, offset, bytes.Length - offset);
          if (count == 0) Refuse("CHANGED");
          offset += count;
        }
        if (file.ReadByte() != -1) Refuse("CHANGED");
        Validate(file, false);
        FileInfo after = Info(file);
        if (file.Length != size || before.Write.dwHighDateTime != after.Write.dwHighDateTime ||
            before.Write.dwLowDateTime != after.Write.dwLowDateTime) Refuse("CHANGED");
        return bytes;
      } catch { Array.Clear(bytes, 0, bytes.Length); throw; }
    }
    public static void Save(FileStream file, byte[] bytes, int max) {
      if (max < 0 || max > MaxBytes || bytes.Length > max) Refuse("SIZE");
      Validate(file, true);
      file.Position = 0;
      file.Write(bytes, 0, bytes.Length);
      file.SetLength(bytes.Length);
      file.Flush(true);
      Validate(file, true);
      if (file.Length != bytes.Length) Refuse("CHANGED");
    }
    public static string ReadBase64(FileStream file, int max) {
      byte[] bytes = Read(file, max);
      try { return Convert.ToBase64String(bytes); }
      finally { Array.Clear(bytes, 0, bytes.Length); }
    }
    public static void SaveBase64(FileStream file, string data, int max) {
      if (max < 0 || max > MaxBytes || data.Length > ((max + 2) / 3) * 4) Refuse("SIZE");
      byte[] bytes = Convert.FromBase64String(data);
      try { Save(file, bytes, max); }
      finally { Array.Clear(bytes, 0, bytes.Length); }
    }
    public static void WriteBase64(string path, string data, bool replace) {
      if (data.Length > ((MaxBytes + 2) / 3) * 4) Refuse("SIZE");
      byte[] bytes = Convert.FromBase64String(data);
      try { Write(path, bytes, replace); }
      finally { Array.Clear(bytes, 0, bytes.Length); }
    }
    public static bool Bound(FileStream held, string supplied) {
      try {
        string path = PathOf(supplied);
        Validate(held, true);
        if (!Named(held, path)) return false;
        using (FileStream named = new FileStream(path, FileMode.Open, FileSystemRights.Read,
            FileShare.ReadWrite | FileShare.Delete, 4096, FileOptions.None)) {
          Info(named);
          return Named(named, path) && Same(Identity(held), Identity(named));
        }
      } catch { return false; }
    }
    private static void RenameHeld(FileStream file, string path, bool replace) {
      byte[] name = Encoding.Unicode.GetBytes(path);
      int nameOffset = IntPtr.Size == 8 ? 20 : 12;
      int lengthOffset = IntPtr.Size == 8 ? 16 : 8;
      int size = nameOffset + name.Length + 2;
      IntPtr buffer = Marshal.AllocHGlobal(size);
      try {
        for (int i = 0; i < size; i++) Marshal.WriteByte(buffer, i, 0);
        Marshal.WriteByte(buffer, 0, replace ? (byte)1 : (byte)0);
        Marshal.WriteInt32(buffer, lengthOffset, name.Length);
        Marshal.Copy(name, 0, IntPtr.Add(buffer, nameOffset), name.Length);
        if (!SetFileInformationByHandle(file.SafeFileHandle, 3, buffer, (uint)size)) throw new Win32Exception(Marshal.GetLastWin32Error());
      } finally { Marshal.FreeHGlobal(buffer); }
    }
    private static void DeleteHeld(FileStream file) {
      IntPtr buffer = Marshal.AllocHGlobal(1);
      try {
        Marshal.WriteByte(buffer, 1);
        if (!SetFileInformationByHandle(file.SafeFileHandle, 4, buffer, 1)) Refuse("CLEANUP");
      } finally { Marshal.FreeHGlobal(buffer); }
    }
    public static void Write(string supplied, byte[] bytes, bool replace) {
      string path = PathOf(supplied);
      // Replacement removes a directory entry, never writes through an existing file or link.
      if (replace) {
        try {
          FileAttributes old = File.GetAttributes(path);
          if ((old & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0) Refuse("TYPE");
        } catch (FileNotFoundException) {} catch (DirectoryNotFoundException) {}
      }
      string temp = Path.Combine(Path.GetDirectoryName(path), "." + Path.GetFileName(path) + "." + Guid.NewGuid().ToString("N") + ".tmp");
      FileStream file = Create(temp);
      bool published = false;
      try {
        Save(file, bytes, MaxBytes);
        if (!Named(file, temp)) Refuse("CHANGED");
        RenameHeld(file, path, replace);
        published = true;
        Validate(file, true);
        if (!Named(file, path)) Refuse("CHANGED");
      } finally {
        try { if (!published) DeleteHeld(file); } finally { file.Dispose(); }
      }
    }
    public static string ReadLine(int max) {
      StringBuilder line = new StringBuilder();
      for (;;) {
        int c = Console.In.Read();
        if (c < 0) return line.Length == 0 ? null : line.ToString();
        if (c == '\n') return line.ToString();
        if (line.Length >= max) Refuse("SIZE");
        line.Append((char)c);
      }
    }
  }
}
'@
  function Send($value) { [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }
  function InputMessage {
    $line = [QuietVote.PrivateFile]::ReadLine(90 * 1024 * 1024)
    if ($null -eq $line) { return $null }
    return ($line | ConvertFrom-Json)
  }
  $request = InputMessage
  if ($null -eq $request) { throw 'missing request' }
  switch ($request.op) {
    'service' {
      Send @{ ok = $true }
      while ($null -ne ($request = InputMessage)) {
        switch ($request.op) {
          'read' {
            $held = [QuietVote.PrivateFile]::Open([string]$request.path)
            try { Send @{ ok = $true; data = [QuietVote.PrivateFile]::ReadBase64($held, [int]$request.max) } }
            finally { $held.Dispose(); $held = $null }
          }
          'write' {
            [QuietVote.PrivateFile]::WriteBase64([string]$request.path, [string]$request.data, [bool]$request.replace)
            Send @{ ok = $true }
          }
          'close' { Send @{ ok = $true }; exit 0 }
          default { throw 'unknown command' }
        }
      }
    }
    'read' {
      $held = [QuietVote.PrivateFile]::Open([string]$request.path)
      Send @{ ok = $true; data = [QuietVote.PrivateFile]::ReadBase64($held, [int]$request.max) }
    }
    'write' {
      [QuietVote.PrivateFile]::WriteBase64([string]$request.path, [string]$request.data, [bool]$request.replace)
      Send @{ ok = $true }
    }
    'reserve' {
      $path = [string]$request.path
      $max = [int]$request.max
      if ($max -lt 0 -or $max -gt [QuietVote.PrivateFile]::MaxBytes) { throw 'bad limit' }
      $held = [QuietVote.PrivateFile]::Create($path)
      Send @{ ok = $true }
      while ($null -ne ($request = InputMessage)) {
        switch ($request.op) {
          'bound' { Send @{ ok = $true; bound = [QuietVote.PrivateFile]::Bound($held, $path) } }
          'save' {
            [QuietVote.PrivateFile]::SaveBase64($held, [string]$request.data, $max)
            Send @{ ok = $true }
          }
          'read' {
            Send @{ ok = $true; data = [QuietVote.PrivateFile]::ReadBase64($held, $max) }
          }
          'close' { $held.Dispose(); $held = $null; Send @{ ok = $true }; exit 0 }
          default { throw 'unknown command' }
        }
      }
    }
    default { throw 'unknown operation' }
  }
} catch {
  $errorValue = $_.Exception.GetBaseException()
  $code = 'UNAVAILABLE'
  if ($errorValue.GetType().FullName -eq 'QuietVote.PrivateFileFailure') { $code = $errorValue.Message }
  elseif (($errorValue.HResult -band 65535) -in @(2,3)) { $code = 'ENOENT' }
  elseif (($errorValue.HResult -band 65535) -in @(80,183)) { $code = 'EEXIST' }
  elseif ($errorValue -is [ComponentModel.Win32Exception] -and $errorValue.NativeErrorCode -in @(80,183)) { $code = 'EEXIST' }
  [Console]::Out.WriteLine(('{"ok":false,"code":"' + $code + '"}'))
  [Console]::Out.Flush()
  exit 1
} finally {
  if ($null -ne $held) { $held.Dispose() }
}
