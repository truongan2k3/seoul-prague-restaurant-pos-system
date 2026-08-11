# Local print bridge (silent multi-printer)

Browsers cannot open TCP port 9100 to thermal printers. This tiny Node server runs on a PC in the restaurant LAN and forwards ESC/POS bytes from the POS web app.

## Run

```bash
node print-bridge/server.mjs
```

Default: `http://127.0.0.1:39100`

Optional env:

- `PRINT_BRIDGE_PORT=39100`
- `PRINT_BRIDGE_HOST=0.0.0.0` (allow other tablets on LAN to use this PC as bridge)

## POS Settings

1. Enable **Silent network print**
2. Set **Print bridge URL** (e.g. `http://127.0.0.1:39100` or `http://192.168.1.43:39100`)
3. Add printers (Receipt / Kitchen roles, IP, port `9100`)
4. Toggle each printer on/off
5. Keep **Browser fallback** on while testing

## API

- `GET /health` → `{ ok: true }`
- `POST /print` → `{ host, port, dataBase64, printerName? }`
