# Print Bridge cho máy Windows (silent print, **không cần Node**)

Điện thoại chỉ đặt món. PC Windows chạy **1 file** + mở tab Print Station.

## Cài / chạy trên PC Windows (không cài Node)

1. Copy folder `print-bridge` sang PC (USB / Drive), ví dụ `C:\pos-print-bridge\`
2. **Một lần:** double-click **`install-desktop-shortcut.bat`**  
   → tạo shortcut **POS Print Bridge** trên Desktop (không cần vào thư mục nữa)
3. **Tuỳ chọn một lần:** double-click **`register-start-protocol.bat`**  
   → POS có thể bấm nút **Start bridge** trong popup cảnh báo
4. Mỗi ngày: double-click shortcut Desktop (hoặc `start-bridge.bat`)
5. Giữ cửa sổ đen mở suốt giờ làm  
   → dùng **PowerShell có sẵn trên Windows** (`print-bridge.ps1`)

Nếu Windows hỏi quyền chạy script: chọn **Open** / cho phép — bat đã dùng `-ExecutionPolicy Bypass`.

## Mỗi ngày

1. Shortcut **POS Print Bridge** (hoặc `start-bridge.bat`) đang chạy  
2. Chrome trên **cùng PC** → mở **`/print-station`**  
   (POS sẽ popup + nút **Mở Print Station** nếu tab này đóng)  
3. Để tab đó mở

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

- Print Station **Not ready / Bridge unreachable** → chưa chạy bridge, hoặc mở `/print-station` trên **điện thoại** (phải mở trên PC).  
- In ra `OPTIONS /print` → Bridge URL nhầm thành IP máy in `:9100`.  
- PowerShell bị chặn → chuột phải `print-bridge.ps1` → Properties → Unblock, hoặc chạy lại `start-bridge.bat`.  
- Nút **Start bridge** trên web không làm gì → chạy lại `register-start-protocol.bat` một lần trên PC.
