# desktop-reposition.ps1
# Set desktop icon positions via IFolderView2.SelectAndPositionItems (COM, no mouse)
#
# Usage: powershell -STA -ExecutionPolicy Bypass -File desktop-reposition.ps1 -LayoutJson '<json>'

param(
  [Parameter(Mandatory=$true)]
  [string]$LayoutJson
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$csCode = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public static class DesktopMover
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

    [StructLayout(LayoutKind.Sequential)]
    struct POINT { public int x; public int y; }

    [DllImport("shell32.dll")]
    static extern IntPtr SHGetPathFromIDListW(IntPtr pidl, IntPtr pszPath);

    [DllImport("ole32.dll")]
    static extern void CoTaskMemFree(IntPtr pv);

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

    [DllImport("user32.dll")]
    static extern bool InvalidateRect(IntPtr hWnd, IntPtr lpRect, bool bErase);

    [DllImport("user32.dll")]
    static extern bool UpdateWindow(IntPtr hWnd);

    [DllImport("shell32.dll")]
    static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    // === Win32 for finding desktop SysListView32 and sending LVM_SETITEMPOSITION ===
    [DllImport("user32.dll")]
    static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    static extern IntPtr FindWindowEx(IntPtr ph, IntPtr ch, string cn, string wn);
    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll")]
    static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int L, T, R, B; }

    const uint LVM_FIRST = 0x1000;
    const uint LVM_SETITEMPOSITION = LVM_FIRST + 15; // 0x100F

    static IntPtr _listView = IntPtr.Zero;

    public static IntPtr FindDesktopListView() {
        IntPtr best = IntPtr.Zero;
        int bestArea = 0;
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            var sb = new System.Text.StringBuilder(256);
            GetClassName(hWnd, sb, 256);
            string cls = sb.ToString();
            if (cls == "Progman" || cls == "WorkerW") {
                IntPtr defView = FindWindowEx(hWnd, IntPtr.Zero, "SHELLDLL_DefView", null);
                if (defView != IntPtr.Zero) {
                    IntPtr lv = FindWindowEx(defView, IntPtr.Zero, "SysListView32", null);
                    if (lv != IntPtr.Zero) {
                        RECT r;
                        GetWindowRect(lv, out r);
                        int area = (r.R - r.L) * (r.B - r.T);
                        if (area > bestArea) { bestArea = area; best = lv; }
                    }
                }
            }
            return true;
        }, IntPtr.Zero);
        _listView = best;
        return best;
    }

    // Move via LVM_SETITEMPOSITION (cross-process safe: coords inline in lParam)
    public static void MoveItemLVM(int index, int x, int y) {
        // lParam = MAKELPARAM(x, y): LOWORD=x, HIWORD=y
        int packed = ((y & 0xFFFF) << 16) | (x & 0xFFFF);
        SendMessage(_listView, LVM_SETITEMPOSITION, (IntPtr)index, (IntPtr)packed);
    }

    // SVSI_POSITIONITEM = 0x80
    const uint SVSI_POSITIONITEM = 0x80;

    static IFolderView2 _fv2;

    static IFolderView2 GetDesktopFV2() {
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

    static string GetNameFromPIDL(IntPtr pidl) {
        IntPtr pathBuf = Marshal.AllocHGlobal(520);
        SHGetPathFromIDListW(pidl, pathBuf);
        string path = Marshal.PtrToStringUni(pathBuf);
        Marshal.FreeHGlobal(pathBuf);
        if (!string.IsNullOrEmpty(path)) {
            return Path.GetFileName(path);
        }
        try {
            SHFILEINFO sfi = new SHFILEINFO();
            SHGetFileInfo(pidl, 0, ref sfi, (uint)Marshal.SizeOf(typeof(SHFILEINFO)), 0x00000110);
            if (!string.IsNullOrEmpty(sfi.szDisplayName)) return sfi.szDisplayName;
        } catch {}
        return null;
    }

    // Build name -> index map
    public static Dictionary<string, int> BuildIndex(out int count) {
        _fv2 = GetDesktopFV2();
        _fv2.ItemCount(0x7FFFFFF2, out count);
        var map = new Dictionary<string, int>();
        for (int i = 0; i < count; i++) {
            IntPtr pidl;
            _fv2.Item(i, out pidl);
            string name = GetNameFromPIDL(pidl);
            CoTaskMemFree(pidl);
            if (name != null && !map.ContainsKey(name)) {
                map[name] = i;
            }
        }
        return map;
    }

    // Move item at index to (x,y) using SelectAndPositionItems
    public static int MoveItem(int index, int x, int y) {
        IntPtr pidl;
        int hr = _fv2.Item(index, out pidl);
        if (hr != 0 || pidl == IntPtr.Zero) return -1;

        IntPtr apidl = Marshal.AllocHGlobal(IntPtr.Size);
        Marshal.WriteIntPtr(apidl, pidl);

        POINT pt;
        pt.x = x;
        pt.y = y;
        IntPtr apt = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(POINT)));
        Marshal.StructureToPtr(pt, apt, false);

        int result = _fv2.SelectAndPositionItems(1, apidl, apt, SVSI_POSITIONITEM);

        Marshal.FreeHGlobal(apidl);
        Marshal.FreeHGlobal(apt);
        CoTaskMemFree(pidl);
        return result;
    }

    // Force desktop refresh
    public static void RefreshDesktop() {
        // SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0
        SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);
    }
}
"@

Add-Type -TypeDefinition $csCode

# === Parse JSON ===
$layout = $LayoutJson | ConvertFrom-Json

# === Build name -> index map via COM ===
$count = 0
$nameToIndex = [DesktopMover]::BuildIndex([ref]$count)
Write-Output "ITEMCOUNT: $count"
Write-Output "NAMES: $($nameToIndex.Count) items mapped"

# === Build move plan ===
$moves = @()
$layoutMode = [string]($layout | Select-Object -ExpandProperty _mode -ErrorAction SilentlyContinue)

if ($layoutMode -eq 'absolute') {
    foreach ($item in $layout.items) {
        if (-not $item.name) { continue }
        if ($null -eq $item.pixelX -or $null -eq $item.pixelY) { continue }

        $idx = -1
        if ($nameToIndex.ContainsKey($item.name)) {
            $idx = $nameToIndex[$item.name]
        } else {
            foreach ($key in $nameToIndex.Keys) {
                if ($key -eq $item.name -or $key -like "$($item.name)*" -or $item.name -like "$key*") {
                    $idx = $nameToIndex[$key]
                    break
                }
            }
        }

        if ($idx -ge 0) {
            $moves += @{ index = $idx; name = $item.name; toX = [int]$item.pixelX; toY = [int]$item.pixelY }
        } else {
            Write-Output "SKIP: $($item.name) (not found)"
        }
    }
} else {
    Write-Output "ERROR: non-absolute layout not supported"
    exit 1
}

Write-Output "TO_MOVE: $($moves.Count) icons"

# === Find desktop ListView for LVM moves ===
$listView = [DesktopMover]::FindDesktopListView()
Write-Output "LISTVIEW: $listView"

# === Execute moves: try LVM first (visible), then COM as backup ===
$movedCount = 0
foreach ($m in $moves) {
    # LVM_SETITEMPOSITION moves the visible control directly
    [DesktopMover]::MoveItemLVM($m.index, $m.toX, $m.toY)
    # COM also updates internal model so position persists
    [DesktopMover]::MoveItem($m.index, $m.toX, $m.toY) | Out-Null
    $movedCount++
}

Write-Output "RESULT: moved $movedCount icons"

# Force desktop refresh
Write-Output "REFRESH: triggering desktop redraw..."
[DesktopMover]::RefreshDesktop()
Start-Sleep -Milliseconds 200

Write-Output "COMPLETED"
