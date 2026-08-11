# Print Bridge + Print Station (máy Windows quán)

Điện thoại / tablet **chỉ đặt món**. PC Windows giữ **1 tab Print Station** + chạy folder nhỏ này.

## Cài 1 lần trên PC Windows

1. Cài [Node.js LTS](https://nodejs.org) (Next → Next → Finish)
2. Copy **cả folder `print-bridge`** sang PC (USB / Drive / tải từ GitHub)
   - Ví dụ: `C:\pos-print-bridge\`
3. Double-click **`start-bridge.bat`**
4. Giữ cửa sổ đen mở suốt giờ làm

## Mỗi ngày trên PC Windows

1. Bridge đang chạy (`start-bridge.bat`)
2. Mở Chrome → đăng nhập POS → mở **`/print-station`** (Settings → Devices → Print Station)
3. Để tab đó mở (có thể thu nhỏ cửa sổ)

## Settings trên POS (web)

| Ô | Điền gì |
|---|--------|
| Silent network print | **Bật** |
| Print bridge URL | `http://127.0.0.1:39100` (vì Print Station chạy **trên cùng PC** với bridge) |
| Network printers → IP | IP máy in bếp, vd `192.168.1.202` |
| Port | `9100` |
| Role | Kitchen (và/hoặc Receipt) |
| Kitchen print on Send | **Bật** |
| Print from Print Station tab | **Bật** (mặc định) |

Điện thoại cùng Wi‑Fi → đặt món → Send → tab Print Station trên PC in ra máy bếp.

## Không cần

- Cài driver máy in trên điện thoại  
- Copy cả project `pos-app`  
- Điền IP LAN của PC vào Bridge URL (dùng `127.0.0.1` là đủ khi dùng Print Station)  

## Lỗi thường gặp

- In ra chữ `OPTIONS /print...` → Bridge URL đang nhầm thành IP máy in `:9100`. Sửa lại `http://127.0.0.1:39100`.
- Không in → PC chưa mở `/print-station`, hoặc chưa chạy bridge, hoặc khác Wi‑Fi / Realtime tắt.
