# read-desktop-positions.ps1
# 通过 IFolderView2 COM 接口读取桌面图标真实像素位置
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms

$csCode = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class DesktopPosReader
{
    [ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IServiceProvider {
        [PreserveSig] int QueryService(ref Guid g, ref Guid r, out IntPtr p);
    }

    [ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellBrowser {
        [PreserveSig] int GetWindow(out IntPtr h);
        [PreserveSig] int ContextSensitiveHelp(bool f);
        [PreserveSig] int InsertMenusSB(IntPtr h, IntPtr l);
        [PreserveSig] int SetMenuSB(IntPtr h1, IntPtr h2, IntPtr h3);
        [PreserveSig] int RemoveMenusSB(IntPtr h);
        [PreserveSig] int SetStatusTextSB(IntPtr p);
        [PreserveSig] int EnableModelessSB(bool f);
        [PreserveSig] int TranslateAcceleratorSB(IntPtr p, ushort w);
        [PreserveSig] int BrowseObject(IntPtr pidl, uint flags);
        [PreserveSig] int GetViewStateStream(uint grfMode, out IntPtr ppStrm);
        [PreserveSig] int GetControlWindow(uint id, out IntPtr phwnd);
        [PreserveSig] int SendControlMsg(uint id, uint msg, IntPtr wp, IntPtr lp, out IntPtr ret);
        [PreserveSig] int QueryActiveShellView([MarshalAs(UnmanagedType.IUnknown)] out object ppshv);
    }

    [ComImport, Guid("1af3a467-214f-4298-908e-06b03e0b39f9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IFolderView2 {
        [PreserveSig] int GetCurrentViewMode(out uint p);
        [PreserveSig] int SetCurrentViewMode(uint v);
        [PreserveSig] int GetFolder(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        [PreserveSig] int Item(int i, out IntPtr ppidl);
        [PreserveSig] int ItemCount(uint f, out int c);
        [PreserveSig] int Items(uint f, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        [PreserveSig] int GetSelectionMarkedItem(out int i);
        [PreserveSig] int GetFocusedItem(out int i);
        [PreserveSig] int GetItemPosition(IntPtr pidl, out long ppt);
        [PreserveSig] int GetSpacing(out long ppt);
        [PreserveSig] int GetDefaultSpacing(out long ppt);
        [PreserveSig] int GetAutoArrange();
        [PreserveSig] int SelectItem(int i, uint f);
        [PreserveSig] int SelectAndPositionItems(uint cidl, IntPtr apidl, IntPtr apt, uint f);
    }

    // IShellFolder 用于获取显示名称
    [ComImport, Guid("000214E6-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellFolder {
        [PreserveSig] int ParseDisplayName(IntPtr hwnd, IntPtr pbc, [MarshalAs(UnmanagedType.LPWStr)] string pszDisplayName, ref uint pchEaten, out IntPtr ppidl, ref uint pdwAttributes);
        [PreserveSig] int EnumObjects(IntPtr hwnd, uint grfFlags, out IntPtr ppenumIDList);
        [PreserveSig] int BindToObject(IntPtr pidl, IntPtr pbc, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int BindToStorage(IntPtr pidl, IntPtr pbc, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int CompareIDs(int lParam, IntPtr pidl1, IntPtr pidl2);
        [PreserveSig] int CreateViewObject(IntPtr hwndOwner, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int GetAttributesOf(uint cidl, IntPtr apidl, ref uint rgfInOut);
        [PreserveSig] int GetUIObjectOf(IntPtr hwndOwner, uint cidl, IntPtr apidl, ref Guid riid, IntPtr rgfReserved, out IntPtr ppv);
        [PreserveSig] int GetDisplayNameOf(IntPtr pidl, uint uFlags, out IntPtr pStrRet);
        [PreserveSig] int SetNameOf(IntPtr hwnd, IntPtr pidl, [MarshalAs(UnmanagedType.LPWStr)] string pszName, uint uFlags, out IntPtr ppidlOut);
    }

    [DllImport("shell32.dll")]
    static extern IntPtr SHGetPathFromIDListW(IntPtr pidl, IntPtr pszPath);

    [DllImport("shell32.dll")]
    static extern IntPtr SHGetDesktopFolder(out IShellFolder ppshf);

    [DllImport("ole32.dll")]
    static extern void CoTaskMemFree(IntPtr pv);

    // SHFILEINFO 用于获取图标信息
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct SHFILEINFO {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr SHGetFileInfo(IntPtr pidl, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);

    private static IFolderView2 GetDesktopFV2() {
        Guid clsid = new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39");
        Type swType = Type.GetTypeFromCLSID(clsid, true);
        object sw = Activator.CreateInstance(swType);
        object wb = sw.GetType().InvokeMember("FindWindowSW",
            System.Reflection.BindingFlags.InvokeMethod, null, sw,
            new object[] { 0, 0, 8, 0, 1 });
        IServiceProvider sp = (IServiceProvider)wb;
        Guid sid = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837");
        Guid iid = new Guid("000214E2-0000-0000-C000-000000000046");
        IntPtr pBrowser;
        sp.QueryService(ref sid, ref iid, out pBrowser);
        IShellBrowser browser = (IShellBrowser)Marshal.GetObjectForIUnknown(pBrowser);
        Marshal.Release(pBrowser);
        object sv;
        browser.QueryActiveShellView(out sv);
        Guid iidFV2 = new Guid("1af3a467-214f-4298-908e-06b03e0b39f9");
        IntPtr pUnk = Marshal.GetIUnknownForObject(sv);
        IntPtr pFV2;
        Marshal.QueryInterface(pUnk, ref iidFV2, out pFV2);
        Marshal.Release(pUnk);
        IFolderView2 fv2 = (IFolderView2)Marshal.GetObjectForIUnknown(pFV2);
        Marshal.Release(pFV2);
        return fv2;
    }

    private static string GetNameFromPIDL(IntPtr pidl) {
        // 方法1: SHGetPathFromIDListW
        IntPtr pathBuf = Marshal.AllocHGlobal(520);
        SHGetPathFromIDListW(pidl, pathBuf);
        string path = Marshal.PtrToStringUni(pathBuf);
        Marshal.FreeHGlobal(pathBuf);
        if (!string.IsNullOrEmpty(path)) {
            return Path.GetFileName(path);
        }
        // 方法2: SHGetFileInfo 获取显示名称
        try {
            SHFILEINFO sfi = new SHFILEINFO();
            SHGetFileInfo(pidl, 0, ref sfi, (uint)Marshal.SizeOf(typeof(SHFILEINFO)), 0x00000110); // SHGFI_DISPLAYNAME | SHGFI_PIDL
            if (!string.IsNullOrEmpty(sfi.szDisplayName)) return sfi.szDisplayName;
        } catch {}
        return null;
    }

    public static string ReadPositions() {
        IFolderView2 fv2 = GetDesktopFV2();
        int count;
        fv2.ItemCount(0x7FFFFFF2, out count);

        long spacingLong;
        fv2.GetSpacing(out spacingLong);
        int spacingX = (int)(spacingLong & 0xFFFFFFFF);
        int spacingY = (int)((spacingLong >> 32) & 0xFFFFFFFF);

        long defaultSpacingLong;
        fv2.GetDefaultSpacing(out defaultSpacingLong);
        int defaultSpacingX = (int)(defaultSpacingLong & 0xFFFFFFFF);
        int defaultSpacingY = (int)((defaultSpacingLong >> 32) & 0xFFFFFFFF);

        string result = "count=" + count + ";spacingX=" + spacingX + ";spacingY=" + spacingY + ";defaultSpacingX=" + defaultSpacingX + ";defaultSpacingY=" + defaultSpacingY;
        for (int i = 0; i < count; i++) {
            IntPtr pidl;
            fv2.Item(i, out pidl);
            long ptLong;
            fv2.GetItemPosition(pidl, out ptLong);
            int x = (int)(ptLong & 0xFFFFFFFF);
            int y = (int)((ptLong >> 32) & 0xFFFFFFFF);
            string name = GetNameFromPIDL(pidl);
            CoTaskMemFree(pidl);
            if (name == null) name = "icon_" + i;
            result += "|" + name + "," + x + "," + y;
        }
        return result;
    }
}
"@

Add-Type -TypeDefinition $csCode
$output = [DesktopPosReader]::ReadPositions()

# 解析输出并转为 JSON
$icons = @()
$parts = $output.Split('|')
$meta = @{}
foreach ($pair in $parts[0].Split(';')) {
    if ($pair -match '=') {
        $kv = $pair.Split('=', 2)
        $meta[$kv[0]] = $kv[1]
    }
}
$count = if ($meta.ContainsKey('count')) { [int]$meta['count'] } else { 0 }
$spacingX = if ($meta.ContainsKey('spacingX')) { [Math]::Abs([int]$meta['spacingX']) } else { 0 }
$spacingY = if ($meta.ContainsKey('spacingY')) { [Math]::Abs([int]$meta['spacingY']) } else { 0 }
$defaultSpacingX = if ($meta.ContainsKey('defaultSpacingX')) { [Math]::Abs([int]$meta['defaultSpacingX']) } else { 0 }
$defaultSpacingY = if ($meta.ContainsKey('defaultSpacingY')) { [Math]::Abs([int]$meta['defaultSpacingY']) } else { 0 }

for ($i = 1; $i -lt $parts.Length; $i++) {
    $fields = $parts[$i].Split(',')
    if ($fields.Length -ge 3) {
        $icons += @{
            name = $fields[0]
            x = [int]$fields[1]
            y = [int]$fields[2]
        }
    }
}

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.Bounds
$working = $screen.WorkingArea

# 从注册表读取图标间距（IconSpacing，单位：负值像素）
# HKCU:\Control Panel\Desktop\WindowMetrics
$iconSpacingX = -1150  # 默认值
$iconSpacingY = -1125  # 默认值
$regX = Get-ItemProperty -LiteralPath 'HKCU:\Control Panel\Desktop\WindowMetrics' -Name 'IconSpacing' -ErrorAction SilentlyContinue
$regY = Get-ItemProperty -LiteralPath 'HKCU:\Control Panel\Desktop\WindowMetrics' -Name 'IconVerticalSpacing' -ErrorAction SilentlyContinue
if ($regX) { $iconSpacingX = [int]$regX.IconSpacing }
if ($regY) { $iconSpacingY = [int]$regY.IconVerticalSpacing }

# 注册表值是负数，转为正数并除以15（Twips转像素，96 DPI下约等于直接取绝对值/15）
$regSpacingX = [Math]::Abs($iconSpacingX) / 15
$regSpacingY = [Math]::Abs($iconSpacingY) / 15

# 优先使用注册表读取的值（系统设置的真实间距），GetSpacing 和推断值仅作兜底
$effectiveSpacingX = if ($regSpacingX -gt 20) { [int]$regSpacingX } elseif ($spacingX -gt 0) { $spacingX } else { $defaultSpacingX }
$effectiveSpacingY = if ($regSpacingY -gt 20) { [int]$regSpacingY } elseif ($spacingY -gt 0) { $spacingY } else { $defaultSpacingY }

$gridCols = if ($effectiveSpacingX -gt 0) { [Math]::Max(1, [int][Math]::Round($working.Width / $effectiveSpacingX)) } else { 0 }
$gridRows = if ($effectiveSpacingY -gt 0) { [Math]::Max(1, [int][Math]::Round($working.Height / $effectiveSpacingY)) } else { 0 }



@{
    desktop = @{ x = 0; y = 0; width = $bounds.Width; height = $bounds.Height }
    workArea = @{ x = $working.X; y = $working.Y; width = $working.Width; height = $working.Height }
    spacing = @{ x = $effectiveSpacingX; y = $effectiveSpacingY }
    defaultSpacing = @{ x = $defaultSpacingX; y = $defaultSpacingY }
    icons = $icons
    count = $icons.Count
    rawCount = $count
    gridCols = $gridCols
    gridRows = $gridRows
} | ConvertTo-Json -Compress -Depth 4
