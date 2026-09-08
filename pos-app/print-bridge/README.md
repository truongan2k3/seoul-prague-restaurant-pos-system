# Print Bridge cho máy Windows (silent print, **không cần Node**)

Điện thoại chỉ đặt món. PC Windows chạy **1 file** + mở tab Print Station.

## Chạy trên PC Windows (một click)

1. Copy folder `print-bridge` sang PC (USB / Drive), ví dụ `C:\pos-print-bridge\`
2. Double-click **`POS-Print-Bridge.bat`**  
   → bridge chạy ngay (không cần `cd` vào thư mục)  
   → lần đầu tự tạo shortcut **POS Print Bridge** trên Desktop
3. Mỗi ngày sau đó: double-click shortcut trên Desktop (hoặc lại file `.bat` trong folder)
4. Giữ cửa sổ đen mở suốt giờ làm  
   → dùng **PowerShell có sẵn trên Windows** (`print-bridge.ps1`)

Nếu Windows hỏi quyền chạy script: chọn **Open** / cho phép — bat đã dùng `-ExecutionPolicy Bypass`.

Tuỳ chọn: `install-desktop-shortcut.bat` tạo lại shortcut Desktop nếu cần.

## Mỗi ngày

1. Shortcut **POS Print Bridge** đang chạy  
2. Chrome trên **cùng PC** → mở **`/print-station`** và để tab đó mở  
3. Trên POS: chip **Printer: Online** khi bridge + Print Station sẵn sàng; **Printer: Offline** nếu thiếu một trong hai  
   (máy phụ / tablet theo heartbeat từ máy PC — không popup)

## Settings POS

| Ô | Điền |
|---|------|
| Silent network print | **Bật** |
| Print bridge URL | `http://127.0.0.1:39100` |
| Network printers → IP | IP máy in bếp (vd `192.168.1.202`) |
| Port | `9100` |
| Role | Kitchen |
| Print from Print Station | **Bật** |

## Kiểm tra bridge

Trên Chrome **của PC Windows** mở:

`http://127.0.0.1:39100/health`

Phải thấy `"ok": true`.

## Không cần

- Cài Node.js  
- Driver máy in trên điện thoại  
- Copy cả project `pos-app`

## Lỗi thường gặp

- **Printer: Offline** → chưa chạy bridge, hoặc chưa mở `/print-station` trên **PC** (không mở trên điện thoại).  
- In ra `OPTIONS /print` → Bridge URL nhầm thành IP máy in `:9100`.  
- PowerShell bị chặn → chuột phải `print-bridge.ps1` → Properties → Unblock, hoặc chạy lại `POS-Print-Bridge.bat`.
